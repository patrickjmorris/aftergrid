// examples/nyc-open-data/scripts/derive-question-tables.mjs, offline and whole: the derivation runs against a
// hand-made in-memory DuckDB of a few rows, so what `crz_daily` means — the `in_crz` rule, the sums, a NULL
// zone id, a trip with both ends in the zone — is checked by arithmetic anybody can do on paper rather than
// against 5.4 million rows nobody can. Nothing here fetches anything and nothing here needs demo.duckdb.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DuckDBInstance } from "@duckdb/node-api";
import {
  CRZ_DAILY_COLUMNS, DERIVED_SOURCE, DERIVED_TABLE, DERIVER_VERSION, SOURCE_TABLES,
  canonicalExpr, deriveQuestionTables, hashAllTables, hashTable, parseArgs, tableHashSql, utcStamp,
} from "../examples/nyc-open-data/scripts/derive-question-tables.mjs";

// The shape build-data.mjs writes, narrowed to what the derivation reads and records — including the two NOT
// NULL columns of build_provenance a derived row has to satisfy honestly (`url`, `fetched_at`).
const SCHEMA = [
  `create table trips_daily (
     pickup_date DATE not null, service VARCHAR not null,
     pu_location_id INTEGER, do_location_id INTEGER,
     trips BIGINT not null, fare_sum DECIMAL(18,4), tip_sum DECIMAL(18,4), distance_sum DECIMAL(18,4),
     congestion_surcharge_sum DECIMAL(18,4), cbd_congestion_fee_sum DECIMAL(18,4)
   )`,
  "create table crz_zones (location_id INTEGER not null, zone VARCHAR, borough VARCHAR)",
  "create table weather_daily (observation_date DATE not null, station_id VARCHAR not null, tmax_c DOUBLE)",
  "create table build_meta (key VARCHAR not null, value VARCHAR)",
  `create table build_provenance (
     source VARCHAR not null, url VARCHAR not null, period VARCHAR, bytes BIGINT, sha256 VARCHAR,
     fetch_mode VARCHAR not null, http_etag VARCHAR, http_last_modified VARCHAR,
     fetched_at TIMESTAMP not null, builder_version VARCHAR not null
   )`,
];

// Eight rows, chosen so every clause of the rule is exercised: a pickup in the zone, a dropoff in the zone, a
// trip with neither end in it, a NULL pickup zone, a trip with BOTH ends in the zone (counted once, not
// twice), a second service on the same day, an all-NULL tip group, and a second day.
const TRIPS = [
  "('2025-01-01','yellow',100,300,10,100.5,10.25,25.0,0,0)",
  "('2025-01-01','yellow',300,200,5,50.0,5.0,12.5,0,0)",
  "('2025-01-01','yellow',300,400,7,70.0,7.0,17.5,0,0)",
  "('2025-01-01','yellow',NULL,400,3,30.0,3.0,7.5,0,0)",
  "('2025-01-01','yellow',100,200,2,20.0,2.0,5.0,0,0)",
  "('2025-01-01','hvfhs',100,400,9,90.0,NULL,22.5,0,0)",
  "('2025-01-02','yellow',400,NULL,4,40.0,4.0,10.0,0,0)",
  "('2025-01-02','yellow',200,400,6,60.0,6.0,15.0,0,0)",
];

type Handle = { c: any; close: () => void; rows: (sql: string) => Promise<any[]> };

async function fixture({ withSources = true, months = "2024-12,2025-01" as string | null } = {}): Promise<Handle> {
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  await c.run("SET TimeZone='UTC'");
  for (const stmt of SCHEMA) {
    if (!withSources && /create table (trips_daily|crz_zones)/.test(stmt)) continue;
    await c.run(stmt);
  }
  if (withSources) {
    await c.run(`insert into trips_daily values ${TRIPS.join(",")}`);
    await c.run("insert into crz_zones values (100,'Midtown','Manhattan'),(200,'SoHo','Manhattan')");
  }
  await c.run("insert into weather_daily values ('2025-01-01','USW00094728',3.9),('2025-01-02','USW00094728',1.1)");
  await c.run("insert into build_meta values ('builder_version','build-data.mjs/1.1.0')");
  if (months !== null) await c.run(`insert into build_meta values ('months','${months}')`);
  await c.run(`insert into build_provenance values
     ('tlc_yellow','https://example.invalid/yellow_tripdata_2025-01.parquet','2025-01',123,
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','downloaded',NULL,NULL,
      TIMESTAMP '2026-09-17 14:18:24','build-data.mjs/1.1.0')`);
  const rows = async (sql: string) => (await c.runAndReadAll(sql)).getRowObjectsJson() as any[];
  return { c, rows, close: () => { c.closeSync(); db.closeSync(); } };
}

const AT = new Date("2026-09-17T15:04:05.678Z");

test("crz_daily is one row per date x service x in_crz, with the crz_trip rule and exact decimal sums", async () => {
  const h = await fixture();
  try {
    const result = await deriveQuestionTables(h.c, { database: "/somewhere/demo.duckdb", now: AT });
    assert.equal(result.rows, 5, "two days, one of them with two services, each split into in-zone and not");
    assert.equal(result.table, DERIVED_TABLE);

    // Decimals are compared as text so the assertion is about the exact scale stored, not a float that happens
    // to print the same. DECIMAL(18,4) in, DECIMAL(18,4) out.
    const got = await h.rows(`select pickup_date::VARCHAR as pickup_date, service, in_crz, trips::VARCHAR as trips,
                                     fare_sum::VARCHAR as fare_sum, tip_sum::VARCHAR as tip_sum, distance_sum::VARCHAR as distance_sum
                              from ${DERIVED_TABLE} order by pickup_date, service, in_crz`);
    assert.deepEqual(got, [
      // pickup 100 -> in; dropoff 400 -> not; the only hvfhs group, and its tips are all NULL, so the sum is
      // NULL rather than 0: nothing was observed, and a zero would claim something was.
      { pickup_date: "2025-01-01", service: "hvfhs", in_crz: true, trips: "9", fare_sum: "90.0000", tip_sum: null, distance_sum: "22.5000" },
      // neither end in the zone (300->400), plus the NULL pickup (NULL->400): an unknown end is not in the zone.
      { pickup_date: "2025-01-01", service: "yellow", in_crz: false, trips: "10", fare_sum: "100.0000", tip_sum: "10.0000", distance_sum: "25.0000" },
      // 10 + 5 + 2: pickup in the zone, dropoff in the zone, and both ends in the zone counted once.
      { pickup_date: "2025-01-01", service: "yellow", in_crz: true, trips: "17", fare_sum: "170.5000", tip_sum: "17.2500", distance_sum: "42.5000" },
      { pickup_date: "2025-01-02", service: "yellow", in_crz: false, trips: "4", fare_sum: "40.0000", tip_sum: "4.0000", distance_sum: "10.0000" },
      { pickup_date: "2025-01-02", service: "yellow", in_crz: true, trips: "6", fare_sum: "60.0000", tip_sum: "6.0000", distance_sum: "15.0000" },
    ]);

    // Nothing is dropped and nothing is double counted: the whole derived table adds up to the whole source.
    const [totals] = await h.rows(`select (select sum(trips) from trips_daily)::VARCHAR as source_trips,
                                          (select sum(trips) from ${DERIVED_TABLE})::VARCHAR as derived_trips`);
    assert.equal(totals.source_trips, totals.derived_trips);
  } finally { h.close(); }
});

test("the derived in_crz total matches the golden's reference expression over trips_daily", async () => {
  const h = await fixture();
  try {
    await deriveQuestionTables(h.c, { database: "demo.duckdb", now: AT });
    // The golden's reference SQL, and the crz_daily equivalent, over the same window. Same numbers or the
    // bounded table is not the table the Question asked for.
    const [reference] = await h.rows(`
      with crz as (select location_id from crz_zones)
      select sum(trips) filter (where pu_location_id in (select location_id from crz)
                                   or do_location_id in (select location_id from crz))::VARCHAR as crz_trips,
             sum(trips)::VARCHAR as all_trips
      from trips_daily
      where service in ('yellow','hvfhs') and pickup_date >= DATE '2025-01-01' and pickup_date < DATE '2025-02-01'`);
    const [derived] = await h.rows(`
      select sum(trips) filter (where in_crz)::VARCHAR as crz_trips, sum(trips)::VARCHAR as all_trips
      from ${DERIVED_TABLE}
      where service in ('yellow','hvfhs') and pickup_date >= DATE '2025-01-01' and pickup_date < DATE '2025-02-01'`);
    assert.deepEqual(derived, reference);
    assert.equal(derived.crz_trips, "32", "10 + 5 + 2 + 9 + 6, each trip once");
    assert.equal(derived.all_trips, "46");
  } finally { h.close(); }
});

test("the provenance row says a derivation happened, and claims nothing about a fetch", async () => {
  const h = await fixture();
  try {
    await deriveQuestionTables(h.c, { database: "/somewhere/demo.duckdb", now: AT });
    const rows = await h.rows(`select * exclude (fetched_at), fetched_at::VARCHAR as fetched_at
                               from build_provenance where source = '${DERIVED_SOURCE}'`);
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], {
      source: "derived:crz_daily",
      // `url` is NOT NULL in the built schema and nothing was fetched, so it names what was read.
      url: `demo.duckdb#${SOURCE_TABLES.join(",")}`,
      period: "2024-12,2025-01",          // inherited from build_meta.months, not invented here
      bytes: null,                         // no file, so no bytes
      sha256: null,                        // no file's bytes to hash; the table's content hash is --verify's job
      fetch_mode: "derived",
      http_etag: null,
      http_last_modified: null,
      fetched_at: utcStamp(AT),
      builder_version: DERIVER_VERSION,
    });
    assert.equal(utcStamp(AT), "2026-09-17 15:04:05", "the derivation time, to the second, in UTC");

    const meta = await h.rows(`select value from build_meta where key = '${DERIVED_SOURCE}'`);
    assert.deepEqual(meta, [{ value: AT.toISOString() }]);

    // The build's own row is still there, untouched: this adds a row, it does not rewrite the fetch record.
    const [kept] = await h.rows("select count(*)::VARCHAR as n from build_provenance where source = 'tlc_yellow'");
    assert.equal(kept.n, "1");
  } finally { h.close(); }
});

test("a database that records no months gets a NULL period rather than a guessed one", async () => {
  const h = await fixture({ months: null });
  try {
    await deriveQuestionTables(h.c, { database: "demo.duckdb", now: AT });
    const [row] = await h.rows(`select period from build_provenance where source = '${DERIVED_SOURCE}'`);
    assert.equal(row.period, null);
  } finally { h.close(); }
});

test("a second run is the same table, one provenance row, and no other table touched", async () => {
  const h = await fixture();
  try {
    const before = await hashAllTables(h.c);
    const first = await deriveQuestionTables(h.c, { database: "demo.duckdb", now: AT });
    const afterFirst = await hashAllTables(h.c);
    const second = await deriveQuestionTables(h.c, { database: "demo.duckdb", now: new Date("2026-09-18T09:00:00.000Z") });
    const afterSecond = await hashAllTables(h.c);

    assert.equal(second.content_hash, first.content_hash, "the derived table is a function of its sources, not of when it was derived");
    assert.equal(afterSecond[DERIVED_TABLE].content_hash, first.content_hash);
    assert.equal(afterSecond[DERIVED_TABLE].rows, 5, "a rerun replaces the table rather than appending to it");

    // Every table the derivation does not write is byte-for-byte what it was, by the same order-independent
    // hash build-data.mjs --verify prints.
    for (const table of ["trips_daily", "crz_zones", "weather_daily"]) {
      assert.deepEqual(afterSecond[table], before[table], `${table} changed`);
      assert.deepEqual(afterFirst[table], before[table], `${table} changed`);
    }

    // build_provenance and build_meta are the two tables that do change — by exactly one replaced row each.
    // Their hashes move with the derivation time, which is why build-data.mjs marks them volatile and never
    // compares them; their row counts do not move on a rerun.
    assert.equal(afterFirst.build_provenance.rows, before.build_provenance.rows + 1);
    assert.equal(afterSecond.build_provenance.rows, afterFirst.build_provenance.rows);
    assert.equal(afterSecond.build_meta.rows, afterFirst.build_meta.rows);
    assert.notEqual(afterSecond.build_provenance.content_hash, afterFirst.build_provenance.content_hash,
      "the second run recorded a later derivation time");
  } finally { h.close(); }
});

test("a database without the tables it derives from is refused by name, not mid-statement", async () => {
  const h = await fixture({ withSources: false });
  try {
    await assert.rejects(
      () => deriveQuestionTables(h.c, { database: "/somewhere/empty.duckdb", now: AT }),
      /has no trips_daily, crz_zones.*does not build one/s,
    );
    const tables = await h.rows("select table_name from information_schema.tables where table_schema='main'");
    assert.ok(!tables.some((t) => t.table_name === DERIVED_TABLE), "a refused run writes nothing");
    const [n] = await h.rows("select count(*)::VARCHAR as n from build_provenance");
    assert.equal(n.n, "1", "and records nothing");
  } finally { h.close(); }
});

test("the content hash is the build script's rule: order-independent, NULL-safe, taken over the declared columns", async () => {
  const h = await fixture();
  try {
    await deriveQuestionTables(h.c, { database: "demo.duckdb", now: AT });
    assert.equal(canonicalExpr(["a", "b"]), `coalesce("a"::VARCHAR, '\\N') || '|' || coalesce("b"::VARCHAR, '\\N')`);
    assert.match(tableHashSql("t", ["a"]), /^select count\(\*\)::BIGINT as rows, coalesce\(sum\(md5_number_lower\(/);

    // Row order inside a table is not promised, so the hash must not depend on it.
    const straight = await hashTable(h.c, DERIVED_TABLE, [...CRZ_DAILY_COLUMNS]);
    await h.c.run(`create table shuffled as select * from ${DERIVED_TABLE} order by trips desc, service`);
    const shuffled = await hashTable(h.c, "shuffled", [...CRZ_DAILY_COLUMNS]);
    assert.equal(shuffled.content_hash, straight.content_hash);
    assert.equal(shuffled.rows, straight.rows);
  } finally { h.close(); }
});

test("arguments: a documented default database, --verify, and no silent typos", () => {
  const defaults = parseArgs([]);
  assert.ok(defaults.out.endsWith("analytics/demo.duckdb"), "the Instance reads demo.duckdb inside its own root");
  assert.equal(defaults.verify, false);
  assert.equal(parseArgs(["--verify"]).verify, true);
  assert.equal(parseArgs(["--out", "/tmp/x.duckdb"]).out, "/tmp/x.duckdb");
  assert.throws(() => parseArgs(["--out"]), /--out needs a value/);
  assert.throws(() => parseArgs(["--tables", "crz_daily"]), /unknown argument --tables/);
});
