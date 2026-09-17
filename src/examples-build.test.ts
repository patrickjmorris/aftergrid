// The offline half of examples/nyc-open-data/scripts/build-data.mjs: everything the build decides before, or
// independently of, the network. Nothing here fetches anything — the sampling rule, the content hash and the
// verify path are exercised against a DuckDB built in a temporary file from literal rows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { DEFAULT_LIMITS } from "../scripts/lib/sql-runner.mjs";
import {
  BUILDER_VERSION, BUILD_DEPS, CONTROL_URL, CRZ_ZONE_IDS, DEFAULT_FROM, INSTANCE_LIMITS, MIN_MONTH, MONEY,
  NotPublished, PROVENANCE_COLUMNS, SAMPLE_RATE, SOURCES, TABLES, TLC_SERVICES,
  appendMismatch, appendPlan, build, canonicalExpr, confirmNotPublished, deriveCrzZones, mergeMonths, mergeSkips,
  monthBounds, monthRange, monthsBuiltOf, monthsOf, nextMonth, parseArgs, parseMonth, provenanceRow,
  readCachedDownload, recordDownload, sampleFilterSql, sampleKeySql, tableHashSql, utcStamp, verifyDatabase,
} from "../examples/nyc-open-data/scripts/build-data.mjs";

const scratch = () => {
  const dir = mkdtempSync(join(tmpdir(), "aftergrid-demo-build-"));
  return { dir, clean: () => rmSync(dir, { recursive: true, force: true }) };
};

test("month parsing and ranges: inclusive, ordered, and loud about a backwards window", () => {
  assert.deepEqual(parseMonth("2024-01"), { year: 2024, month: 1 });
  assert.equal(nextMonth("2024-12"), "2025-01");
  assert.equal(nextMonth("2024-01"), "2024-02");
  assert.deepEqual(monthRange("2024-11", "2025-02"), ["2024-11", "2024-12", "2025-01", "2025-02"]);
  assert.deepEqual(monthRange("2025-01", "2025-01"), ["2025-01"], "a one-month window is one month, not none");
  assert.deepEqual(monthBounds("2024-12"), { start: "2024-12-01 00:00:00", end: "2025-01-01 00:00:00" });

  for (const bad of ["2024-1", "2024/01", "2024-13", "202401", "", null, "1999-01"]) {
    assert.throws(() => parseMonth(bad as string), /must be YYYY-MM|no month|outside 2009/, `accepted ${JSON.stringify(bad)}`);
  }
  assert.throws(() => monthRange("2025-03", "2025-01"), /is before/);
});

test("arguments: documented defaults, a validated source list, and no silent typos", () => {
  const defaults = parseArgs([]);
  assert.equal(defaults.from, DEFAULT_FROM);
  assert.equal(defaults.to, null, "--to unset means 'probe the CDN', not a hardcoded month");
  assert.deepEqual(defaults.sources, SOURCES);
  assert.equal(defaults.sampleRate, SAMPLE_RATE);
  assert.equal(defaults.verify, false);
  assert.ok(defaults.out.endsWith("demo.duckdb"));

  const explicit = parseArgs(["--from", "2025-01", "--to", "2025-01", "--sources", "yellow,ghcn", "--out", "/tmp/x.duckdb", "--sample-rate", "7", "--verify"]);
  assert.equal(explicit.from, "2025-01");
  assert.equal(explicit.to, "2025-01");
  assert.deepEqual(explicit.sources, ["yellow", "ghcn"]);
  assert.equal(explicit.sampleRate, 7);
  assert.equal(explicit.verify, true);
  assert.equal(defaults.append, false);
  assert.equal(parseArgs(["--append"]).append, true);
  // --verify does not build, so an --append beside it would be an instruction silently dropped.
  assert.throws(() => parseArgs(["--append", "--verify"]), /--append and --verify cannot be combined/);

  assert.throws(() => parseArgs(["--sources", "yellow,taxis"]), /unknown source\(s\) taxis/);
  assert.throws(() => parseArgs(["--sources", ""]), /at least one source/);
  assert.throws(() => parseArgs(["--sample-rate", "0"]), /positive integer/);
  assert.throws(() => parseArgs(["--sample-rate", "2.5"]), /positive integer/);
  assert.throws(() => parseArgs(["--from"]), /needs a value/);
  assert.throws(() => parseArgs(["--month", "2024-01"]), /unknown argument --month/);
  assert.throws(() => parseArgs(["--from", "2025-06", "--to", "2025-01"]), /is before/);
});

test("the CRZ list is validated against the lookup, never guessed from it", () => {
  const lookup = [
    { location_id: 4, borough: "Manhattan", zone: "Alphabet City" },
    { location_id: 43, borough: "Manhattan", zone: "Central Park" },
    { location_id: 161, borough: "Manhattan", zone: "Midtown Center" },
    { location_id: 261, borough: "Manhattan", zone: "World Trade Center" },
    { location_id: 33, borough: "Brooklyn", zone: "Brooklyn Heights" },
  ];
  assert.deepEqual(deriveCrzZones(lookup, [161, 4, 261]), [
    { location_id: 4, zone: "Alphabet City", borough: "Manhattan" },
    { location_id: 161, zone: "Midtown Center", borough: "Manhattan" },
    { location_id: 261, zone: "World Trade Center", borough: "Manhattan" },
  ], "rows come back sorted by id, carrying the lookup's own zone name");

  assert.throws(() => deriveCrzZones(lookup, [4, 999]), /999 is not in the taxi zone lookup/);
  assert.throws(() => deriveCrzZones(lookup, [4, 33]), /is in Brooklyn, not Manhattan/);
  assert.throws(() => deriveCrzZones(lookup, [4, 4]), /duplicate id/);

  // The committed list itself: 38 ids, all distinct, and the boundary zones that are deliberately NOT in it.
  assert.equal(CRZ_ZONE_IDS.length, 38);
  assert.equal(new Set(CRZ_ZONE_IDS).size, 38);
  for (const inside of [4, 12, 13, 87, 100, 161, 163, 229, 231, 261]) assert.ok(CRZ_ZONE_IDS.includes(inside), `${inside} should be in the zone`);
  for (const outside of [43, 140, 141, 142, 143, 194, 202, 236, 237, 238, 239, 103, 104, 105]) {
    assert.ok(!CRZ_ZONE_IDS.includes(outside), `${outside} is at or above 60th St, or outside the road cordon`);
  }
});

test("a provenance row is one shape, and a streamed source is never given a hash it does not have", () => {
  const downloaded = provenanceRow({
    source: "tlc_yellow", url: "https://example.invalid/yellow_tripdata_2024-01.parquet", period: "2024-01",
    bytes: 49_961_641, sha256: "a".repeat(64), fetchMode: "downloaded", etag: '"abc"',
    lastModified: "Thu, 22 Feb 2024 21:33:00 GMT", fetchedAt: "2026-09-17 12:00:00",
  });
  assert.deepEqual(Object.keys(downloaded), [...PROVENANCE_COLUMNS]);
  assert.equal(downloaded.builder_version, BUILDER_VERSION);
  assert.equal(downloaded.fetch_mode, "downloaded");
  assert.equal(downloaded.bytes, 49_961_641);

  const streamed = provenanceRow({
    source: "citibike", url: "https://example.invalid/202401-citibike-tripdata.zip", period: "2024-01",
    bytes: 369_035_302, fetchMode: "streamed", etag: '"ce6c"', lastModified: null, fetchedAt: "2026-09-17 12:00:00",
  });
  assert.deepEqual(Object.keys(streamed), [...PROVENANCE_COLUMNS]);
  assert.equal(streamed.sha256, null, "a streamed file's bytes are never held, so it has no sha256");

  assert.throws(() => provenanceRow({ source: "citibike", url: "u", period: "p", bytes: 1, sha256: "b".repeat(64), fetchMode: "streamed", fetchedAt: "2026-09-17 12:00:00" }), /streamed, so it has no sha256/);
  assert.throws(() => provenanceRow({ source: "tlc_yellow", url: "u", period: "p", bytes: 1, fetchMode: "downloaded", fetchedAt: "2026-09-17 12:00:00" }), /needs a sha256/);
  assert.throws(() => provenanceRow({ source: "weather", url: "u", period: "p", bytes: 1, fetchMode: "streamed", fetchedAt: "x" }), /unknown provenance source/);
  assert.throws(() => provenanceRow({ source: "ghcn", url: "u", period: "p", bytes: 1, fetchMode: "copied", fetchedAt: "x" }), /downloaded or streamed/);

  // A streamed row is allowed no hash, but it may not be allowed to identify nothing at all.
  assert.throws(
    () => provenanceRow({ source: "citibike", url: "u", period: "p", bytes: null, fetchMode: "streamed", etag: null, lastModified: null, fetchedAt: "2026-09-17 12:00:00" }),
    /nothing in the row identifies what was read/,
  );
  for (const identifying of [{ bytes: 1 }, { bytes: null, etag: '"e"' }, { bytes: null, lastModified: "Thu, 22 Feb 2024 21:33:00 GMT" }]) {
    assert.equal(
      provenanceRow({ source: "citibike", url: "u", period: "p", fetchMode: "streamed", fetchedAt: "2026-09-17 12:00:00", ...identifying }).fetch_mode,
      "streamed", `any one of bytes/etag/last-modified is enough: ${JSON.stringify(identifying)}`,
    );
  }

  assert.match(utcStamp(new Date("2026-09-17T12:34:56.789Z")), /^2026-09-17 12:34:56$/);
});

test("the sampling rule is a function of the trip's own fields: stable, unbiased in rate, blind to row order", async () => {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();
  const run = async (sql: string) => (await connection.runAndReadAll(sql)).getRowObjectsJson();

  // A synthetic month of trips. Nothing about the sample may depend on the order they are read in.
  const trips = `
    select (timestamp '2024-01-01 00:00:00' + to_minutes(i)) as pickup,
           (timestamp '2024-01-01 00:07:00' + to_minutes(i)) as dropoff,
           (i % 260) + 1 as pu, (i % 97) + 1 as dz, round(4 + (i % 500) / 10.0, 2) as fare
    from range(200000) t(i)`;
  const predicate = sampleFilterSql(['"pickup"', '"dropoff"', '"pu"', '"dz"', '"fare"'], 100);

  const forwards = await run(`with t as (${trips}) select count(*)::BIGINT as n, sum(pu)::BIGINT as s from t where ${predicate}`);
  const shuffled = await run(`with t as (select * from (${trips}) order by fare desc, pickup desc) select count(*)::BIGINT as n, sum(pu)::BIGINT as s from t where ${predicate}`);
  assert.deepEqual(shuffled, forwards, "the same trips sampled in a different order give the same sample");

  const sampled = Number(forwards[0].n);
  assert.ok(sampled > 1600 && sampled < 2400, `1-in-100 over 200k rows should land near 2000, got ${sampled}`);

  // Changing one field of a trip re-decides that trip, and only that trip.
  const moved = await run(`with t as (select pickup, dropoff, pu, dz, fare + 0.01 as fare from (${trips})) select count(*)::BIGINT as n from t where ${predicate}`);
  assert.notEqual(Number(moved[0].n), sampled, "a different fare is a different trip and gets its own draw");

  // A coarser rate is a strict subset of a finer one: the rule is one hash, thresholded.
  const nested = await run(`with t as (${trips}) select count(*)::BIGINT as n from t where ${sampleFilterSql(['"pickup"', '"dropoff"', '"pu"', '"dz"', '"fare"'], 1000)} and not (${predicate})`);
  assert.equal(Number(nested[0].n), 0, "every 1-in-1000 trip is also a 1-in-100 trip");

  assert.throws(() => sampleFilterSql(['"a"'], 0), /positive integer/);
  assert.throws(() => sampleFilterSql(['"a"'], 1.5), /positive integer/);
  connection.closeSync(); instance.closeSync();
});

test("the content hash sees every column, distinguishes NULL from empty, and ignores row order", async () => {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();
  const hash = async (rows: string) => {
    await connection.run("drop table if exists t");
    await connection.run(`create table t (a VARCHAR, b BIGINT) `);
    await connection.run(`insert into t values ${rows}`);
    return (await connection.runAndReadAll(tableHashSql("t", ["a", "b"]))).getRowObjectsJson()[0];
  };
  const forwards = await hash("('x', 1), ('y', 2), (NULL, 3), ('', 4)");
  const backwards = await hash("('', 4), (NULL, 3), ('y', 2), ('x', 1)");
  assert.deepEqual(backwards, forwards, "the hash is a sum over rows, so insertion order cannot move it");
  assert.equal(Number(forwards.rows), 4);

  const nullSwapped = await hash("('x', 1), ('y', 2), ('', 3), (NULL, 4)");
  assert.notEqual(nullSwapped.content_hash, forwards.content_hash, "NULL and the empty string are not the same value");

  const changed = await hash("('x', 1), ('y', 2), (NULL, 3), ('', 5)");
  assert.notEqual(changed.content_hash, forwards.content_hash, "a changed cell changes the hash");

  const empty = await hash("('x', 1)");
  assert.notEqual(empty.content_hash, forwards.content_hash);
  assert.match(canonicalExpr(["a", "b"]), /coalesce\("a"::VARCHAR, '\\N'\) \|\| '\|' \|\| coalesce\("b"::VARCHAR, '\\N'\)/);
  connection.closeSync(); instance.closeSync();
});

test("--verify reads every declared table under the Instance's own limits, and names a missing one", async () => {
  const { dir, clean } = scratch();
  try {
    const path = join(dir, "tiny.duckdb");
    const instance = await DuckDBInstance.create(path);
    const connection = await instance.connect();
    // Every table the build declares except citibike_stations, which is left out on purpose.
    await connection.run(`create table trips_daily (pickup_date DATE, service VARCHAR, pu_location_id INTEGER, do_location_id INTEGER, trips BIGINT, fare_sum ${MONEY}, tip_sum ${MONEY}, distance_sum ${MONEY}, congestion_surcharge_sum ${MONEY}, cbd_congestion_fee_sum ${MONEY})`);
    await connection.run("insert into trips_daily values (DATE '2024-01-02', 'yellow', 161, 4, 12, 180.5, 20.25, 31.4, 30.0, NULL)");
    await connection.run("create table trips_sample (service VARCHAR, pickup_datetime TIMESTAMP, dropoff_datetime TIMESTAMP, pu_location_id INTEGER, do_location_id INTEGER, trip_distance DOUBLE, fare_amount DOUBLE, tip_amount DOUBLE, tolls_amount DOUBLE, congestion_surcharge DOUBLE, cbd_congestion_fee DOUBLE, passenger_count BIGINT, payment_type VARCHAR)");
    await connection.run("insert into trips_sample values ('yellow', TIMESTAMP '2024-01-02 09:00:00', TIMESTAMP '2024-01-02 09:12:00', 161, 4, 2.1, 14.9, 3.0, 0.0, 2.5, NULL, 1, '1')");
    await connection.run("create table weather_daily (observation_date DATE, station_id VARCHAR, tmax_c DOUBLE, tmin_c DOUBLE, prcp_mm DOUBLE, snow_mm DOUBLE)");
    await connection.run("insert into weather_daily values (DATE '2024-01-02', 'USW00094728', 4.4, -1.1, 0.0, 0.0)");
    await connection.run("create table citibike_daily (ride_date DATE, member_casual VARCHAR, rideable_type VARCHAR, rides BIGINT, duration_seconds_sum BIGINT)");
    await connection.run("insert into citibike_daily values (DATE '2024-01-02', 'member', 'classic_bike', 41000, 29000000)");
    await connection.run("create table taxi_zones (location_id INTEGER, borough VARCHAR, zone VARCHAR, service_zone VARCHAR)");
    await connection.run("insert into taxi_zones values (161, 'Manhattan', 'Midtown Center', 'Yellow Zone')");
    await connection.run("create table crz_zones (location_id INTEGER, zone VARCHAR, borough VARCHAR)");
    await connection.run("insert into crz_zones values (161, 'Midtown Center', 'Manhattan')");
    await connection.run("create table build_meta (key VARCHAR, value VARCHAR)");
    await connection.run("insert into build_meta values ('built_at', '2026-09-17T12:00:00Z')");
    await connection.run(`create table build_provenance (${PROVENANCE_COLUMNS.map((c) => `${c} VARCHAR`).join(", ")})`);
    await connection.run(`insert into build_provenance values ('citibike', 'https://example.invalid/z.zip', '2024-01', '369035302', NULL, 'streamed', '"e"', NULL, '2026-09-17 12:00:00', '${BUILDER_VERSION}')`);
    connection.closeSync(); instance.closeSync();

    const first = await verifyDatabase(path);
    assert.deepEqual(first.map((r) => r.table), TABLES.map((t) => t.name), "every declared table is reported, in the declared order");

    const stations = first.find((r) => r.table === "citibike_stations");
    assert.equal(stations?.missing, true, "a table the build did not write is reported missing, not skipped");
    assert.equal(stations?.rows, null);

    const daily = first.find((r) => r.table === "trips_daily");
    assert.equal(daily?.rows, 1);
    assert.match(String(daily?.content_hash), /^\d+$/);
    assert.equal(daily?.volatile, false);
    assert.equal(first.find((r) => r.table === "build_provenance")?.volatile, true, "provenance records the fetch, so it is never compared");
    assert.equal(first.find((r) => r.table === "build_meta")?.volatile, true);

    // Two reads of the same bytes agree — this is the comparison the determinism acceptance makes.
    const second = await verifyDatabase(path);
    for (const [i, row] of second.entries()) {
      assert.equal(row.content_hash, first[i].content_hash, `${row.table} hashed differently on a second read`);
      assert.equal(row.rows, first[i].rows);
    }
    assert.equal(INSTANCE_LIMITS.memory_limit, "256MB");
    assert.equal(INSTANCE_LIMITS.threads, 2);

    await assert.rejects(verifyDatabase(join(dir, "absent.duckdb")), /no database at/);
  } finally { clean(); }
});

// ---------------------------------------------------------------------------------------------------------
// A whole build, with no network at all
// ---------------------------------------------------------------------------------------------------------
// `build()` takes its network — and its database opener — as an argument, so a whole window can be walked here:
// months the publisher serves, months it does not, the staging tables, the refusals and the rename. The fakes
// below are the only thing standing in for the three CDNs; everything else is the real build and a real DuckDB.
const ZONE_CSV = "LocationID,Borough,Zone,service_zone\n" +
  CRZ_ZONE_IDS.map((id: number) => `${id},Manhattan,Zone ${id},Yellow Zone`).join("\n") + "\n";

const citibikeCsv = (month: string) => {
  const header = "ride_id,rideable_type,started_at,ended_at,start_station_name,start_station_id," +
    "end_station_name,end_station_id,start_lat,start_lng,end_lat,end_lng,member_casual";
  const rows = [1, 2].map((i) =>
    `r${month}${i},classic_bike,${month}-0${i} 09:00:00,${month}-0${i} 09:1${i}:00,` +
    `Start ${i},S${i},End ${i},E${i},40.7${i},-73.9${i},40.8${i},-74.0${i},member`);
  return [header, ...rows].join("\n") + "\n";
};

const zipMonth = (url: string) => { const m = /(\d{4})(\d{2})-citibike/.exec(url) as RegExpExecArray; return `${m[1]}-${m[2]}`; };

/** citibikeMonths: the months the fake host serves. extractFails: a month whose member read dies mid-build. */
function fakeNetwork({ citibikeMonths = [] as string[], extractFails = "", sqlLog = null as string[] | null } = {}) {
  return {
    probeLatestMonth: async () => { throw new Error("this fake never probes: the test states --to or injects a probe"); },
    download: async (url: string, dest: string, { source, period }: any) => {
      if (!url.includes("taxi_zone_lookup")) throw new NotPublished(url);
      writeFileSync(dest, ZONE_CSV);
      return { path: dest, cached: false, row: provenanceRow({
        source, url, period, bytes: ZONE_CSV.length, sha256: "a".repeat(64), fetchMode: "downloaded",
        etag: '"zones"', lastModified: null, fetchedAt: "2026-09-17 12:00:00" }) };
    },
    head: async () => ({ ok: false, status: 403, bytes: null, etag: null, lastModified: null }),
    confirmNotPublished: async (url: string) => { throw new NotPublished(url); },
    zipDirectory: async (url: string) => {
      const month = zipMonth(url);
      if (!citibikeMonths.includes(month)) throw new NotPublished(url);
      return { ok: true, status: 200, bytes: 4096, etag: `"${month}"`, lastModified: null,
        entries: [{ name: `${month.replace("-", "")}-citibike-tripdata.csv`, method: 0, compressedSize: 1, uncompressedSize: 1, localHeaderOffset: 0 }] };
    },
    extractZipEntry: async (url: string, _entry: any, dest: string) => {
      const month = zipMonth(url);
      if (extractFails === month) throw new Error(`range GET of ${month} -> 500`);
      writeFileSync(dest, citibikeCsv(month));
      return statSync(dest).size;
    },
    openDatabase: async (path: string, config: any) => {
      const handle = await BUILD_DEPS.openDatabase(path, config);
      if (!sqlLog) return handle;
      const connection = handle.connection;
      return { ...handle, connection: {
        run: (sql: string) => { sqlLog.push(sql); return connection.run(sql); },
        runAndReadAll: (sql: string) => connection.runAndReadAll(sql),
      } };
    },
  };
}

const fakeArgs = (dir: string, extra: string[] = []) =>
  parseArgs(["--from", "2024-01", "--sources", "citibike", "--out", join(dir, "demo.duckdb"), "--raw-dir", join(dir, "raw"), ...extra]);

const readMeta = async (path: string) => {
  const instance = await DuckDBInstance.create(path, { access_mode: "READ_ONLY" });
  const connection = await instance.connect();
  const rows = (await connection.runAndReadAll("select key, value from build_meta")).getRowObjectsJson();
  connection.closeSync(); instance.closeSync();
  return Object.fromEntries(rows.map((r: any) => [String(r.key), String(r.value)]));
};

test("a skipped month is recorded in build_meta, summarised, and reflected in the exit status", async () => {
  const { dir, clean } = scratch();
  try {
    const log: string[] = [];
    const args = fakeArgs(dir, ["--to", "2024-03"]);
    const result = await build(args, (line: string) => log.push(line), fakeNetwork({ citibikeMonths: ["2024-01", "2024-03"] }));

    assert.deepEqual(result.skipped, [{ source: "citibike", month: "2024-02", reason: "not published" }]);
    assert.deepEqual(result.monthsBuilt, { citibike: ["2024-01", "2024-03"] });
    assert.equal(result.incomplete, true, "a month inside an explicit --to window was skipped, so the build fell short");
    assert.ok(log.some((l) => /citibike: 2 of 3 months built/.test(l)), `no per-source summary in:\n${log.join("\n")}`);
    assert.ok(log.some((l) => /1 month skipped/.test(l)), "the skips are summarised, not only mentioned in passing");
    assert.ok(log.some((l) => /exit status 1/.test(l)));

    const meta = await readMeta(args.out);
    assert.equal(meta["months_built:citibike"], "2024-01,2024-03", "which months are in this database is recorded in it");
    assert.deepEqual(JSON.parse(meta.months_skipped), [{ source: "citibike", month: "2024-02", reason: "not published" }]);
    assert.equal(meta.to_source, "explicit");
    assert.equal(meta.builder_version, BUILDER_VERSION);

    // The same missing month at the edge of a *probed* window is where the publisher stops, not a shortfall.
    const probed = await build(fakeArgs(dir), () => {}, {
      ...fakeNetwork({ citibikeMonths: ["2024-01", "2024-03"] }), probeLatestMonth: async () => "2024-03",
    });
    assert.equal(probed.incomplete, false, "a probed window ends where the source does");
    assert.equal((await readMeta(probed.out)).to_source, "probed");
  } finally { clean(); }
});

test("a build whose every requested month was skipped refuses to replace a good database", async () => {
  const { dir, clean } = scratch();
  try {
    const args = fakeArgs(dir, ["--to", "2024-02"]);
    writeFileSync(args.out, "the previous build's bytes");
    const before = readFileSync(args.out);
    await assert.rejects(
      build(args, () => {}, fakeNetwork({ citibikeMonths: [] })),
      /every requested month of citibike was skipped/,
      "an empty database must not quietly take a good one's place",
    );
    assert.deepEqual(readFileSync(args.out), before, "the old file is left exactly as it was");
    assert.equal(existsSync(`${args.out}.building`), false, "the discarded build cleans up after itself");
  } finally { clean(); }
});

test("Citi Bike staging tables are replaced each month, never emptied with delete", async () => {
  const { dir, clean } = scratch();
  try {
    const sql: string[] = [];
    const args = fakeArgs(dir, ["--to", "2024-03"]);
    await build(args, () => {}, fakeNetwork({ citibikeMonths: ["2024-01", "2024-02", "2024-03"], sqlLog: sql }));

    const count = (re: RegExp) => sql.filter((s) => re.test(s)).length;
    assert.equal(count(/create temp table "stg_cb_daily"/), 3, "one fresh staging table per built month");
    assert.equal(count(/create temp table "stg_cb_stations"/), 3);
    assert.equal(count(/delete from stg_cb/i), 0, "DuckDB does not reclaim a deleted row group, so nothing is deleted");
    assert.equal(count(/drop table if exists "stg_cb_daily"/), 4, "three per-month drops, and one when the source is done");

    // The same thing seen from the data: staging that carried over would re-aggregate the earlier months.
    const instance = await DuckDBInstance.create(args.out, { access_mode: "READ_ONLY" });
    const connection = await instance.connect();
    const daily = (await connection.runAndReadAll("select count(*)::BIGINT as rows, sum(rides)::BIGINT as rides from citibike_daily")).getRowObjectsJson()[0];
    const stations = (await connection.runAndReadAll("select count(*)::BIGINT as rows from citibike_stations")).getRowObjectsJson()[0];
    connection.closeSync(); instance.closeSync();
    assert.equal(Number(daily.rows), 6, "two ride days a month, three months, counted once each");
    assert.equal(Number(daily.rides), 6);
    assert.equal(Number(stations.rows), 12, "four stations a month, three months");
  } finally { clean(); }
});

test("a build that dies mid-way leaves the previous database, and a finished one replaces it in place", async () => {
  const { dir, clean } = scratch();
  try {
    const args = fakeArgs(dir, ["--to", "2024-02"]);
    const months = ["2024-01", "2024-02"];
    await build(args, () => {}, fakeNetwork({ citibikeMonths: months }));
    const first = readFileSync(args.out);
    assert.ok(first.length > 0);

    await assert.rejects(
      build(args, () => {}, fakeNetwork({ citibikeMonths: months, extractFails: "2024-02" })),
      /range GET of 2024-02/,
    );
    assert.deepEqual(readFileSync(args.out), first, "a failed build changes nothing about what is already there");
    assert.equal(existsSync(`${args.out}.building`), false);

    const again = await build(args, () => {}, fakeNetwork({ citibikeMonths: months }));
    assert.equal(again.incomplete, false);
    const verified = await verifyDatabase(again.out);
    assert.equal(verified.find((r: any) => r.table === "citibike_daily")?.rows, 4, "the replacement is a readable database");
    assert.equal(verified.find((r: any) => r.table === "trips_daily")?.rows, 0, "citibike was the only source asked for");
  } finally { clean(); }
});

test("--verify reads under the Engine's own limits, imported rather than copied", () => {
  assert.deepEqual(INSTANCE_LIMITS, DEFAULT_LIMITS);
  assert.equal(INSTANCE_LIMITS, DEFAULT_LIMITS, "the same object as the Engine's, so the two cannot drift apart");
  assert.equal(typeof INSTANCE_LIMITS.statement_timeout_ms, "number", "the timeout is a limit --verify applies, not a decoration");
});

test("a cached download is re-hashed before it is trusted", async () => {
  const { dir, clean } = scratch();
  try {
    const dest = join(dir, "taxi_zone_lookup.csv");
    const url = "https://example.invalid/taxi_zone_lookup.csv";
    writeFileSync(dest, "LocationID,Borough\n1,Manhattan\n");
    const sha = createHash("sha256").update(readFileSync(dest)).digest("hex");
    writeFileSync(`${dest}.fetch.json`, JSON.stringify({
      source: "tlc_zones", url, period: "static", bytes: statSync(dest).size, sha256: sha,
      fetchMode: "downloaded", etag: '"z"', lastModified: null, fetchedAt: "2026-09-17 12:00:00",
    }));

    // What `download` writes is what a rerun reads: the same sidecar, round-tripped.
    const recorded = recordDownload(dest, {
      source: "tlc_zones", url, period: "static", bytes: statSync(dest).size, sha256: sha,
      fetchMode: "downloaded", etag: '"z"', lastModified: null, fetchedAt: "2026-09-17 12:00:00",
    });
    assert.equal(recorded.sha256, sha);
    assert.equal(recorded.fetch_mode, "downloaded");
    assert.throws(
      () => recordDownload(join(dir, "unsound.csv"), { source: "tlc_zones", url, period: "static", bytes: 1, sha256: null, fetchMode: "downloaded", fetchedAt: "2026-09-17 12:00:00" }),
      /needs a sha256/, "an unsound row throws before a sidecar claiming it is written",
    );
    assert.equal(existsSync(join(dir, "unsound.csv.fetch.json")), false);

    const log: string[] = [];
    const row = await readCachedDownload(dest, url, (l: string) => log.push(l));
    assert.equal(row?.sha256, sha, "bytes that still hash to what the sidecar says are the bytes it describes");
    assert.equal(log.length, 0);

    // Edited in place, same length: the url and the size still match, so those alone cannot see it.
    writeFileSync(dest, "LocationID,Borough\n1,Bronxxxxx\n");
    assert.equal(statSync(dest).size, JSON.parse(readFileSync(`${dest}.fetch.json`, "utf8")).bytes);
    assert.equal(await readCachedDownload(dest, url, (l: string) => log.push(l)), null, "the cache is refused, and the file re-fetched");
    assert.match(log.join("\n"), /cached bytes hash [0-9a-f]{64}, the sidecar recorded [0-9a-f]{64}/);

    assert.equal(await readCachedDownload(dest, "https://example.invalid/other.csv"), null, "a different url is a different object");
    assert.equal(await readCachedDownload(join(dir, "absent.csv"), url), null);
  } finally { clean(); }
});

test("the sample key is money-cast, so membership does not depend on how a double prints", async () => {
  assert.deepEqual(sampleKeySql(TLC_SERVICES.yellow), [
    '"tpep_pickup_datetime"', '"tpep_dropoff_datetime"', '"PULocationID"', '"DOLocationID"', `"fare_amount"::${MONEY}`,
  ]);
  assert.equal(sampleKeySql(TLC_SERVICES.hvfhs).at(-1), `"base_passenger_fare"::${MONEY}`);
  assert.match(BUILDER_VERSION, /\/2\./, "the key changed, so the builder version says so");

  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();
  const row = (await connection.runAndReadAll(`
    select (0.1::DOUBLE + 0.2::DOUBLE)::VARCHAR as computed_double,
           0.3::DOUBLE::VARCHAR as stored_double,
           (0.1::DOUBLE + 0.2::DOUBLE)::${MONEY}::VARCHAR as computed_money,
           0.3::DOUBLE::${MONEY}::VARCHAR as stored_money`)).getRowObjectsJson()[0];
  connection.closeSync(); instance.closeSync();
  assert.notEqual(row.computed_double, row.stored_double, "two equal fares can render as different text as DOUBLE");
  assert.equal(row.computed_money, row.stored_money, "cast to the exact decimal, the same fare renders one way");
});

test("months before the supported floor are refused by name, not read as an empty month", () => {
  assert.equal(MIN_MONTH, "2021-01");
  assert.throws(() => parseArgs(["--from", "2020-12"]), /before 2021-01/);
  assert.throws(() => parseArgs(["--to", "2019-06"]), /before 2021-01/);
  assert.throws(() => monthRange("2020-01", "2021-06"), /--from 2020-01 is before 2021-01/);
  assert.throws(() => monthRange("2020-01", "2021-06"), /starttime\/stoptime\/usertype/);
  assert.deepEqual(monthRange("2021-01", "2021-02"), ["2021-01", "2021-02"], "the floor itself is supported");
});

test("the control object refusing is named as throttling, and never compared with itself", async () => {
  const control = CONTROL_URL["d37ci6vzurychx.cloudfront.net"];
  await assert.rejects(confirmNotPublished(control, 403), (error: any) => {
    assert.match(error.message, /control object for d37ci6vzurychx\.cloudfront\.net/);
    assert.doesNotMatch(error.message, /is refused too/, "the message must not compare the control with itself");
    assert.ok(!(error instanceof NotPublished), "the control certainly exists, so a refusal is never 'not published'");
    return true;
  });
  await assert.rejects(confirmNotPublished("https://example.invalid/x.parquet", 404), /x\.parquet -> 404/);
});

test("--append plans months rather than windows, and refuses a database it would make untrue", () => {
  // Why --append exists: a window is contiguous, so January 2024 against January 2025 otherwise costs the
  // twelve months between them — about 12 GB streamed for the two that are wanted. The plan is over months,
  // and it reports what it skipped rather than silently rebuilding it.
  const want = ["2024-01", "2024-12", "2025-01", "2025-02"];
  assert.deepEqual(appendPlan([], ["2024-12", "2025-01", "2025-02"]), { build: ["2024-12", "2025-01", "2025-02"], skipped: [] }, "no existing months means a plain build");
  assert.deepEqual(appendPlan(["2024-12", "2025-01", "2025-02"], ["2024-01"]), { build: ["2024-01"], skipped: [] });
  assert.deepEqual(appendPlan(["2024-12", "2025-01", "2025-02"], ["2024-12", "2025-01"]), { build: [], skipped: ["2024-12", "2025-01"] }, "a window already held costs no fetch at all");

  assert.deepEqual(mergeMonths(["2024-12", "2025-01", "2025-02"], ["2024-01"]), want, "the recorded months are sorted and deduplicated");
  assert.deepEqual(mergeMonths(["2024-01"], ["2024-01"]), ["2024-01"], "re-adding a month does not duplicate it");

  // `months` is the authority on what a database holds; from..to is the fallback for one written before the
  // key existed, where the window was contiguous by construction.
  assert.deepEqual(monthsOf({ months: "2024-01,2024-12", from: "2024-01", to: "2024-12" }), ["2024-01", "2024-12"]);
  assert.deepEqual(monthsOf({ from: "2024-01", to: "2024-03" }), ["2024-01", "2024-02", "2024-03"]);
  assert.deepEqual(monthsOf({}), [], "a database recording neither is treated as holding nothing, never as holding everything");

  const same = { sources: SOURCES.join(","), sample_rate: String(SAMPLE_RATE), builder_version: BUILDER_VERSION };
  assert.equal(appendMismatch(same, { sources: [...SOURCES], sampleRate: SAMPLE_RATE }), null);
  assert.equal(appendMismatch(same, { sources: [...SOURCES].reverse(), sampleRate: SAMPLE_RATE }), null, "the source list is a set, not an order");
  assert.match(String(appendMismatch(same, { sources: ["yellow"], sampleRate: SAMPLE_RATE })), /cannot honestly record both/);
  assert.match(String(appendMismatch(same, { sources: [...SOURCES], sampleRate: 500 })), /two different rules/);
  assert.match(String(appendMismatch(same, { sources: [...SOURCES], sampleRate: SAMPLE_RATE, builderVersion: "build-data.mjs/9.9.9" })), /rebuild without --append/);

  // The version check is not bookkeeping: 1.x sampled by a different key, so a 1.1.0 file is refused by name
  // and the refusal says why rather than leaving the user to guess which of the two files is wrong.
  const older = { ...same, builder_version: "build-data.mjs/1.1.0" };
  const refusal = String(appendMismatch(older, { sources: [...SOURCES], sampleRate: SAMPLE_RATE }));
  assert.match(refusal, /written by build-data\.mjs\/1\.1\.0 and this is build-data\.mjs\/2\.0\.0/);
  assert.match(refusal, /trips_sample key changed in build-data\.mjs\/2\.0\.0/);
  assert.match(refusal, /DECIMAL\(18,4\)/);
  assert.match(refusal, /rebuild without --append/);
});

test("the skip record follows the file: a month since built drops out, one still missing stays", () => {
  const previous = JSON.stringify([
    { source: "citibike", month: "2024-02", reason: "not published" },
    { source: "yellow", month: "2024-03", reason: "not published" },
  ]);
  const merged = mergeSkips(previous, [{ source: "yellow", month: "2024-04", reason: "not published" }],
    { citibike: ["2024-01", "2024-02"], yellow: ["2024-01"] });
  assert.deepEqual(merged, [
    { source: "yellow", month: "2024-03", reason: "not published" },
    { source: "yellow", month: "2024-04", reason: "not published" },
  ], "the citibike month an append filled in is no longer missing, so it leaves the record");

  assert.deepEqual(mergeSkips(undefined, [], {}), [], "no previous record is an empty one, not a crash");
  assert.deepEqual(mergeSkips("not json", [], {}), []);
  assert.deepEqual(
    mergeSkips(JSON.stringify([{ source: "yellow", month: "2024-03", reason: "not published" }]),
      [{ source: "yellow", month: "2024-03", reason: "the archive holds no CSV member" }], {}),
    [{ source: "yellow", month: "2024-03", reason: "the archive holds no CSV member" }],
    "a month this run decided again is this run's answer, recorded once",
  );

  // Per-source built months come from the file's own key; the fallback is for a build_meta without one.
  assert.deepEqual(monthsBuiltOf({ "months_built:citibike": "2024-01,2024-03" }, "citibike"), ["2024-01", "2024-03"]);
  assert.deepEqual(monthsBuiltOf({ "months_built:citibike": "" }, "citibike", ["2024-09"]), [], "an empty value is 'none', not 'unknown'");
  assert.deepEqual(monthsBuiltOf({ months: "2024-09" }, "citibike", ["2024-09"]), ["2024-09"]);
});

test("--append adds the months the file lacks, and its record describes the file rather than the run", async () => {
  const { dir, clean } = scratch();
  try {
    const served = ["2024-01", "2024-03"];
    await build(fakeArgs(dir, ["--to", "2024-01"]), () => {}, fakeNetwork({ citibikeMonths: served }));

    const sql: string[] = [];
    const log: string[] = [];
    const args = fakeArgs(dir, ["--from", "2024-03", "--to", "2024-03", "--append"]);
    const appended = await build(args, (l: string) => log.push(l), fakeNetwork({ citibikeMonths: served, sqlLog: sql }));

    assert.equal(appended.appended, true);
    assert.deepEqual(appended.held, ["2024-01", "2024-03"], "the file holds both months, which are not a range");
    assert.deepEqual(appended.monthsBuilt, { citibike: ["2024-03"] }, "the return describes this run");
    assert.equal(appended.incomplete, false);
    assert.ok(log.some((l) => /citibike: 1 of 1 month built this run, 2 in the file/.test(l)), `no cumulative summary in:\n${log.join("\n")}`);

    const meta = await readMeta(args.out);
    assert.equal(meta.months, "2024-01,2024-03");
    assert.equal(meta["months_built:citibike"], "2024-01,2024-03", "build_meta describes the file, so it is cumulative");
    assert.equal(meta.from, "2024-01");
    assert.equal(meta.to, "2024-03");
    assert.deepEqual(JSON.parse(meta.months_skipped), []);
    assert.equal(meta.builder_version, BUILDER_VERSION);

    // Staging is per month on the append path too, and the appended month is aggregated once.
    assert.equal(sql.filter((s) => /create temp table "stg_cb_daily"/.test(s)).length, 1);
    assert.equal(sql.filter((s) => /delete from stg_cb/i.test(s)).length, 0);
    const verified = await verifyDatabase(args.out);
    assert.equal(verified.find((r: any) => r.table === "citibike_daily")?.rows, 4, "two ride days a month, two months");
    assert.equal(verified.find((r: any) => r.table === "citibike_stations")?.rows, 8);
    assert.equal(verified.find((r: any) => r.table === "taxi_zones")?.rows, CRZ_ZONE_IDS.length, "the zone rows are kept, not re-fetched and re-inserted");
  } finally { clean(); }
});

test("a month --append asks for and does not get is a shortfall, and the file it already had survives", async () => {
  const { dir, clean } = scratch();
  try {
    await build(fakeArgs(dir, ["--to", "2024-01"]), () => {}, fakeNetwork({ citibikeMonths: ["2024-01"] }));

    const args = fakeArgs(dir, ["--from", "2024-02", "--to", "2024-02", "--append"]);
    const appended = await build(args, () => {}, fakeNetwork({ citibikeMonths: ["2024-01"] }));

    assert.deepEqual(appended.skipped, [{ source: "citibike", month: "2024-02", reason: "not published" }]);
    assert.equal(appended.incomplete, true, "an explicit window fell short, on the append path as on any other");
    assert.deepEqual(appended.held, ["2024-01"], "a month nothing served is not recorded as held, so a later append retries it");

    const meta = await readMeta(args.out);
    assert.equal(meta.months, "2024-01");
    assert.equal(meta["months_built:citibike"], "2024-01");
    assert.deepEqual(JSON.parse(meta.months_skipped), [{ source: "citibike", month: "2024-02", reason: "not published" }]);
    const verified = await verifyDatabase(args.out);
    assert.equal(verified.find((r: any) => r.table === "citibike_daily")?.rows, 2, "the month the file already held is still there");
  } finally { clean(); }
});

test("--append against a database written by an older builder is refused, and that database is untouched", async () => {
  const { dir, clean } = scratch();
  try {
    const args = fakeArgs(dir, ["--to", "2024-01"]);
    await build(args, () => {}, fakeNetwork({ citibikeMonths: ["2024-01", "2024-02"] }));

    // Age the file: a 1.1.0 build sampled by the pre-DECIMAL key.
    const instance = await DuckDBInstance.create(args.out);
    const connection = await instance.connect();
    await connection.run("update build_meta set value = 'build-data.mjs/1.1.0' where key = 'builder_version'");
    await connection.run("checkpoint");
    connection.closeSync(); instance.closeSync();
    const before = readFileSync(args.out);

    await assert.rejects(
      build(fakeArgs(dir, ["--from", "2024-02", "--to", "2024-02", "--append"]), () => {}, fakeNetwork({ citibikeMonths: ["2024-01", "2024-02"] })),
      /--append refused .*trips_sample key changed in build-data\.mjs\/2\.0\.0/s,
    );
    assert.deepEqual(readFileSync(args.out), before, "the older database is left exactly as it was");
    assert.equal(existsSync(`${args.out}.building`), false);
  } finally { clean(); }
});
