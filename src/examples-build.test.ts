// The offline half of examples/nyc-open-data/scripts/build-data.mjs: everything the build decides before, or
// independently of, the network. Nothing here fetches anything — the sampling rule, the content hash and the
// verify path are exercised against a DuckDB built in a temporary file from literal rows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import {
  BUILDER_VERSION, CRZ_ZONE_IDS, DEFAULT_FROM, INSTANCE_LIMITS, MONEY, PROVENANCE_COLUMNS, SAMPLE_RATE, SOURCES, TABLES,
  appendMismatch, appendPlan, canonicalExpr, deriveCrzZones, mergeMonths, monthBounds, monthRange, monthsOf,
  nextMonth, parseArgs, parseMonth, provenanceRow, sampleFilterSql, tableHashSql, utcStamp, verifyDatabase,
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
  assert.match(String(appendMismatch(same, { sources: [...SOURCES], sampleRate: SAMPLE_RATE, builderVersion: "build-data.mjs/9.9.9" })), /rebuild rather than append/);
});
