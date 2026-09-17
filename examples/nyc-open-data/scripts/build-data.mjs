#!/usr/bin/env node
// Builds the bounded demo database for examples/nyc-open-data from three public sources.
//
// The sources are far larger than an Instance should hold, so nothing here copies a month. Every TLC month is
// read once, column-projected, and reduced in DuckDB to a daily aggregate plus a deterministic 1-in-N sample;
// every Citi Bike month is streamed entry-by-entry out of its remote zip with HTTP range requests, aggregated,
// and deleted. The only whole files that ever land on disk are the yellow parquet months, the GHCN station
// history and the taxi zone lookup — the three that are small enough to hash (see `fetch_mode` in
// `build_provenance`, and scripts/README.md for the rule per source).
//
// Determinism: the sample is a hash of the trip's own fields (md5, not DuckDB's `hash()`, so it does not move
// with the engine version), never a random draw or a row number. Two builds against the same fetched bytes
// produce identical table hashes; `--verify` prints them. Row *order* inside a table is not promised — the
// content hash is a sum over rows and does not depend on it.
//
// Idempotence: the build writes a fresh temporary database and renames it over `--out` only once it is complete.
// The rename replaces the old file in one step — the old database is never unlinked first, so `--out` is either
// the previous build or this one and never briefly absent. A failed build leaves any previous file untouched.
//
// `--append` is the one way a database gains months without being rebuilt. A window is a contiguous range, so
// two far-apart months (January 2024 against January 2025) otherwise cost every month between them — 14 months
// of streamed HVFHS and Citi Bike for the two that are wanted. Append copies the existing file, builds only the
// months `build_meta.months` does not already list, and refuses outright when the run's sources, sample rate or
// builder version differ from the ones the file was written with, because a database that mixed those would
// make its own `build_meta` untrue.
//
// A skipped month is not a success: every month a source does not serve is recorded in `build_meta`
// (`months_built:<source>` and `months_skipped`), summarised in the log, and — when the window was stated with
// an explicit `--to` — exits 1. That holds on the append path too: a month asked for and not served is a
// shortfall whether the run built one month or thirty. A build (or append) whose result would hold no months at
// all for a requested source refuses to replace an existing `--out`, rather than putting an empty database
// where a good one was. A month the file already holds is not a skip of this kind: it is reported as already
// built and changes nothing.
//
// Hashes rendered from DOUBLE: `trips_sample` keeps the source's own DOUBLE money columns, so its *content hash*
// (not its membership) is rendered by DuckDB's double formatting and is only comparable across builds on the
// same engine. The sample *key* is money-cast to DECIMAL(18,4) and does not have that dependency.
import { createWriteStream, createReadStream, copyFileSync, mkdirSync, rmSync, existsSync, statSync, renameSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createInflateRaw } from "node:zlib";
// The Engine's own SQL limits, imported rather than copied so the two cannot drift apart.
import { DEFAULT_LIMITS, runBounded } from "../../../scripts/lib/sql-runner.mjs";

// 2.0.0: the sample key casts money to DECIMAL(18,4) (see `sampleKeySql`), so `trips_sample` membership differs
// from a 1.x build of the same bytes. Everything else about the schema is unchanged — and `--append` refuses a
// file written by any other version, so the two keys never meet inside one database.
export const BUILDER_VERSION = "build-data.mjs/2.0.0";
const USER_AGENT = `aftergrid-nyc-open-data-demo (${BUILDER_VERSION}; https://github.com/aftergrid)`;

/** One trip in SAMPLE_RATE lands in `trips_sample`. See scripts/README.md for how this number was chosen. */
export const SAMPLE_RATE = 1000;

export const DEFAULT_FROM = "2024-01";
export const GHCN_STATION = "USW00094728"; // New York City, Central Park
export const SOURCES = ["yellow", "hvfhs", "ghcn", "citibike"];
/** The per-month sources — the ones a window can be missing a month of. GHCN and the zone lookup are not per-month. */
export const MONTHLY_SOURCES = Object.freeze(["yellow", "hvfhs", "citibike"]);

/**
 * The earliest month this builder reads. The Citi Bike reader requires `started_at`, `ended_at`, `member_casual`
 * and `rideable_type` (see `buildCitibikeEntry`) — the column shape the archives carry from 2021 onward. The
 * 2020-and-earlier archives use the legacy `starttime` / `stoptime` / `usertype` names, and `read_csv` would fail
 * on them with a column error rather than say what was actually wrong. An earlier month is refused here, by name.
 * The exact changeover file inside 2021 has not been re-verified against the archives by this build; 2021-01 is
 * the stated floor, not a measured boundary.
 */
export const MIN_MONTH = "2021-01";

const TLC_BASE = "https://d37ci6vzurychx.cloudfront.net/trip-data/";
const ZONE_LOOKUP_URL = "https://d37ci6vzurychx.cloudfront.net/misc/taxi_zone_lookup.csv";
const GHCN_URL = `https://noaa-ghcn-pds.s3.amazonaws.com/csv/by_station/${GHCN_STATION}.csv`;
const CITIBIKE_BASE = "https://s3.amazonaws.com/tripdata/";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = join(SCRIPT_DIR, "..", "demo.duckdb");
const DEFAULT_RAW = join(SCRIPT_DIR, "..", "data", "raw");

// The DuckDB limits the Engine reads this file under. This is the Engine's own DEFAULT_LIMITS object, imported
// and not copied — a copy drifts silently, and `--verify` claiming "the Instance's own limits" would then be a
// claim about a number nobody else uses. `--verify` opens the built database under exactly these, timeout
// included, so "the Instance can query it" is checked and not assumed.
export const INSTANCE_LIMITS = DEFAULT_LIMITS;
// Building is not querying: reduction of a 20M-row month needs more room than an Instance query does.
const BUILD_LIMITS = Object.freeze({ memory_limit: "2GB", threads: "4" });

// ---------------------------------------------------------------------------------------------------------
// The Congestion Relief Zone
// ---------------------------------------------------------------------------------------------------------
// The CRZ is Manhattan south of 60th Street. The taxi zone lookup carries no geometry and no street bounds, so
// this list is NOT derived from it — it is a hand-checked list of the Manhattan zones that lie below 60th St on
// the TLC taxi zone map, and `deriveCrzZones` only validates it against the lookup (every id must exist and be
// in Manhattan). Two independent checks are recorded here rather than left implicit:
//
//   1. Map check. Every zone below was read off the TLC taxi zone map. The boundary cases are all excluded and
//      named: Central Park (43), Lincoln Square East/West (142/143), Lenox Hill East/West (140/141), Upper East
//      Side South (237) and Upper West Side South (239) all start at or above 60th St. Roosevelt Island (202),
//      Randalls Island (194) and Governor's/Ellis/Liberty Island (103/104/105) are outside the road cordon.
//   2. Fee check (2026-09-16, yellow_tripdata_2025-03.parquet). The 2025 TLC files carry `cbd_congestion_fee`,
//      charged on trips that touch the zone. Grouped by dropoff zone over zones with >= 500 trips, every id in
//      this list has >= 94.1% of dropoffs carrying the fee; the highest share outside it is Newark Airport at
//      88.8%. The excluded Manhattan boundary zones that were measured are Central Park 58.2%, Lincoln Square
//      East 57.5%, Upper East Side South 52.8%, Lenox Hill East 51.0%, Upper West Side South 42.2%, Upper East
//      Side North 38.9% and Upper West Side North 34.5% — every one far under the list's 94.1% floor. (The other
//      excluded zones were not measured, so no band is claimed over them.) The gap between 94.1% and 88.8% is
//      the list's edge.
//
// The fee check is evidence, not the definition: the fee is charged for touching the zone, so a zone outside it
// can carry the fee on a trip that crossed. The definition is the map.
export const CRZ_ZONE_IDS = Object.freeze([
  4, 12, 13, 45, 48, 50, 68, 79, 87, 88, 90, 100, 107, 113, 114, 125, 137, 144, 148, 158,
  161, 162, 163, 164, 170, 186, 209, 211, 224, 229, 230, 231, 232, 233, 234, 246, 249, 261,
]);

// ---------------------------------------------------------------------------------------------------------
// Months
// ---------------------------------------------------------------------------------------------------------
export function parseMonth(text, what = "month") {
  const m = /^(\d{4})-(\d{2})$/.exec(String(text ?? ""));
  if (!m) throw new Error(`${what} must be YYYY-MM, got ${JSON.stringify(text)}`);
  const year = Number(m[1]), month = Number(m[2]);
  if (month < 1 || month > 12) throw new Error(`${what} has no month ${m[2]}: ${text}`);
  if (year < 2009 || year > 2100) throw new Error(`${what} is outside 2009..2100: ${text}`);
  return { year, month };
}

export const monthKey = (year, month) => `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;

export function nextMonth(key) {
  const { year, month } = parseMonth(key);
  return month === 12 ? monthKey(year + 1, 1) : monthKey(year, month + 1);
}

/**
 * Refuse a month this builder cannot honestly read. Stated as a floor rather than discovered as a column error
 * halfway through a long build. See MIN_MONTH for what the floor is about.
 */
export function assertSupportedMonth(key, what = "month") {
  if (String(key) < MIN_MONTH) {
    throw new Error(`${what} ${key} is before ${MIN_MONTH}, the first month this builder supports: the Citi Bike ` +
      `archives before it use the legacy starttime/stoptime/usertype columns this reader does not know. ` +
      `Build from ${MIN_MONTH} onward.`);
  }
}

/** Inclusive list of months from `from` to `to`. Refuses a backwards range rather than returning nothing. */
export function monthRange(from, to) {
  parseMonth(from, "--from"); parseMonth(to, "--to");
  assertSupportedMonth(from, "--from"); assertSupportedMonth(to, "--to");
  if (to < from) throw new Error(`--to ${to} is before --from ${from}`);
  const out = [];
  for (let key = from; key <= to; key = nextMonth(key)) out.push(key);
  return out;
}

/** First instant of a month, and of the month after it, as SQL TIMESTAMP literals. */
export function monthBounds(key) {
  return { start: `${key}-01 00:00:00`, end: `${nextMonth(key)}-01 00:00:00` };
}

// ---------------------------------------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------------------------------------
export function parseArgs(argv) {
  const args = { from: DEFAULT_FROM, to: null, sources: [...SOURCES], out: DEFAULT_OUT, rawDir: DEFAULT_RAW, verify: false, sampleRate: SAMPLE_RATE, keepRaw: false, append: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => { const v = argv[++i]; if (v === undefined) throw new Error(`${arg} needs a value`); return v; };
    if (arg === "--from") { const v = value(); parseMonth(v, "--from"); assertSupportedMonth(v, "--from"); args.from = v; }
    else if (arg === "--to") { const v = value(); parseMonth(v, "--to"); assertSupportedMonth(v, "--to"); args.to = v; }
    else if (arg === "--out") args.out = value();
    else if (arg === "--raw-dir") args.rawDir = value();
    else if (arg === "--sources") {
      args.sources = value().split(",").map((s) => s.trim()).filter(Boolean);
      const unknown = args.sources.filter((s) => !SOURCES.includes(s));
      if (unknown.length) throw new Error(`unknown source(s) ${unknown.join(", ")}; known: ${SOURCES.join(", ")}`);
      if (!args.sources.length) throw new Error("--sources needs at least one source");
    } else if (arg === "--sample-rate") {
      args.sampleRate = Number(value());
      if (!Number.isInteger(args.sampleRate) || args.sampleRate < 1) throw new Error(`--sample-rate must be a positive integer, got ${argv[i]}`);
    } else if (arg === "--verify") args.verify = true;
    else if (arg === "--append") args.append = true;
    else if (arg === "--keep-raw") args.keepRaw = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  if (args.to !== null && args.to < args.from) throw new Error(`--to ${args.to} is before --from ${args.from}`);
  // --verify does not build, so an --append beside it is a instruction that would be silently dropped.
  if (args.append && args.verify) throw new Error("--append and --verify cannot be combined: --verify does not build");
  return args;
}

/**
 * Which months of a requested window an `--append` run must build, and which the database already holds.
 * Pure, so the decision is testable without a database: the caller supplies the months already recorded.
 * A fresh build passes no existing months and gets the whole window back.
 */
export function appendPlan(existingMonths, windowMonths) {
  const have = new Set(existingMonths);
  return { build: windowMonths.filter((m) => !have.has(m)), skipped: windowMonths.filter((m) => have.has(m)) };
}

/** Every month the database will hold after this run: sorted, no duplicates. Written to `build_meta.months`. */
export function mergeMonths(existingMonths, added) {
  return [...new Set([...existingMonths, ...added])].sort();
}

/**
 * The months a previous run recorded. `months` is the authority; `from`..`to` is the fallback for a database
 * written before this key existed, where the window was contiguous by construction.
 */
export function monthsOf(meta) {
  const listed = meta?.months;
  if (typeof listed === "string" && listed.trim()) return listed.split(",").map((s) => s.trim()).filter(Boolean);
  if (typeof meta?.from === "string" && typeof meta?.to === "string") return monthRange(meta.from, meta.to);
  return [];
}

/**
 * The months a previous run recorded as built for one source. A database written by this builder always carries
 * the key — `--append` refuses any other builder version — so the fallback is for a hand-made or truncated
 * `build_meta`: the file's own month list, which is what "this source was requested and the file holds it" meant
 * before the key existed. An empty value is an answer (none), not a missing key.
 */
export function monthsBuiltOf(meta, source, fallback = []) {
  const listed = meta?.[`months_built:${source}`];
  if (typeof listed === "string") return listed.split(",").map((s) => s.trim()).filter(Boolean);
  return [...fallback];
}

/**
 * The skip record a database should carry after this run: the skips of this run, plus the ones a previous run
 * recorded that are still true. A month since built is dropped from the record — it is no longer missing — and
 * a (source, month) this run decided again is decided by this run. `builtBySource` is `{source: [months]}` as
 * the finished file holds them.
 */
export function mergeSkips(previousJson, current, builtBySource = {}) {
  let previous = [];
  try { const parsed = JSON.parse(previousJson ?? "[]"); if (Array.isArray(parsed)) previous = parsed; } catch { previous = []; }
  const decidedNow = new Set(current.map((s) => `${s.source} ${s.month}`));
  const kept = previous.filter((s) => s && typeof s.source === "string" && typeof s.month === "string" &&
    !decidedNow.has(`${s.source} ${s.month}`) && !(builtBySource[s.source] ?? []).includes(s.month));
  return [...kept, ...current];
}

/**
 * Why an `--append` run must not touch this database, or null when it may. Appending under a different sample
 * rate, a different source list or a different builder would leave one file holding two rules and one
 * `build_meta` describing only the last run — so it is refused rather than recorded.
 */
export function appendMismatch(meta, { sources, sampleRate, builderVersion = BUILDER_VERSION }) {
  const was = String(meta?.sources ?? "").split(",").map((s) => s.trim()).filter(Boolean).sort().join(",");
  const now = [...sources].sort().join(",");
  if (was && was !== now) return `it was built from sources ${was} and this run asks for ${now}; one file cannot honestly record both`;
  if (meta?.sample_rate && String(meta.sample_rate) !== String(sampleRate)) return `it samples 1 trip in ${meta.sample_rate} and this run asks for 1 in ${sampleRate}; trips_sample would hold two different rules`;
  // The version is not bookkeeping: the trips_sample key changed in 2.0.0 (money is cast to DECIMAL(18,4) before
  // it is hashed), so months written by a 1.x builder and months written by this one were sampled by two
  // different rules. One file holding both would have a `sample_rate` that describes neither half honestly.
  if (meta?.builder_version && meta.builder_version !== builderVersion) {
    return `it was written by ${meta.builder_version} and this is ${builderVersion}; the trips_sample key changed ` +
      `in build-data.mjs/2.0.0 (money is cast to DECIMAL(18,4) before hashing), so the two runs would sample by ` +
      `different rules — rebuild without --append rather than append across versions`;
  }
  return null;
}

const USAGE = `Usage: node examples/nyc-open-data/scripts/build-data.mjs [options]

  --from YYYY-MM       first month to build (default ${DEFAULT_FROM}; ${MIN_MONTH} is the earliest supported)
  --to YYYY-MM         last month; default is the latest month the TLC CDN serves, found by HEAD requests
                       walking forward from --from and stopping at the first missing month
  --sources a,b,c      any of ${SOURCES.join(",")} (default: all)
  --out PATH           output database (default examples/nyc-open-data/demo.duckdb)
  --raw-dir PATH       where downloaded and streamed files land (default examples/nyc-open-data/data/raw)
  --sample-rate N      one trip in N enters trips_sample (default ${SAMPLE_RATE})
  --append             add to an existing --out the months of this window it does not already hold, instead of
                       rebuilding it. Refused when --out was built with different sources, a different sample
                       rate or a different builder version. Cannot be combined with --verify
  --keep-raw           keep the streamed Citi Bike CSVs instead of deleting each after it is aggregated
  --verify             do not build: print each table's row count and content hash from --out and exit

Exit status: 1 when a month inside an explicit --to window was not served, so a shortened build (or append) is
not mistaken for a complete one. A month --append finds already built is not one of those. A run whose result
would hold no month at all of a requested source refuses to replace an existing --out.
`;

// ---------------------------------------------------------------------------------------------------------
// SQL helpers
// ---------------------------------------------------------------------------------------------------------
export const sqlString = (s) => "'" + String(s).replace(/'/g, "''") + "'";
/** 'YYYY-MM-DD HH:MM:SS' in UTC — what a DuckDB TIMESTAMP literal takes. */
export const utcStamp = (date = new Date()) => date.toISOString().slice(0, 19).replace("T", " ");
export const ident = (name) => '"' + String(name).replace(/"/g, '""') + '"';

/**
 * A row rendered as one string, so a hash of it is a hash of the row. NULL is rendered as a character no
 * DuckDB VARCHAR cast produces, so NULL and the empty string never collide.
 */
export function canonicalExpr(columns) {
  return columns.map((c) => `coalesce(${ident(c)}::VARCHAR, '\\N')`).join(" || '|' || ");
}

/** Sampling predicate: a function of the trip's own values only. `exprs` are already-quoted SQL expressions. */
export function sampleFilterSql(exprs, rate) {
  if (!Number.isInteger(rate) || rate < 1) throw new Error(`sample rate must be a positive integer, got ${rate}`);
  const canon = exprs.map((e) => `coalesce((${e})::VARCHAR, '\\N')`).join(" || '|' || ");
  return `(md5_number_lower(${canon}) % ${rate}) = 0`;
}

/** Order-independent content hash of a table: rows, plus the sum of each row's md5 taken as a 64-bit number. */
export function tableHashSql(table, columns) {
  return `select count(*)::BIGINT as rows, coalesce(sum(md5_number_lower(${canonicalExpr(columns)})::HUGEINT), 0)::VARCHAR as content_hash from ${ident(table)}`;
}

export const PROVENANCE_COLUMNS = Object.freeze(["source", "url", "period", "bytes", "sha256", "fetch_mode", "http_etag", "http_last_modified", "fetched_at", "builder_version"]);

// The tables the build writes, with the column order their content hash is taken over. A `volatile` table
// records the fetch rather than the data — its hash moves every run, so it is printed and never compared.
export const TABLES = Object.freeze([
  { name: "trips_daily", columns: ["pickup_date", "service", "pu_location_id", "do_location_id", "trips", "fare_sum", "tip_sum", "distance_sum", "congestion_surcharge_sum", "cbd_congestion_fee_sum"] },
  { name: "trips_sample", columns: ["service", "pickup_datetime", "dropoff_datetime", "pu_location_id", "do_location_id", "trip_distance", "fare_amount", "tip_amount", "tolls_amount", "congestion_surcharge", "cbd_congestion_fee", "passenger_count", "payment_type"] },
  { name: "weather_daily", columns: ["observation_date", "station_id", "tmax_c", "tmin_c", "prcp_mm", "snow_mm"] },
  { name: "citibike_daily", columns: ["ride_date", "member_casual", "rideable_type", "rides", "duration_seconds_sum"] },
  { name: "citibike_stations", columns: ["month", "station_id", "station_name", "latitude", "longitude", "starts", "ends", "first_seen", "last_seen"] },
  { name: "taxi_zones", columns: ["location_id", "borough", "zone", "service_zone"] },
  { name: "crz_zones", columns: ["location_id", "zone", "borough"] },
  { name: "build_meta", columns: ["key", "value"], volatile: true },
  { name: "build_provenance", columns: PROVENANCE_COLUMNS, volatile: true },
]);

/**
 * One `build_provenance` row. Streamed sources are never hashed — we never hold their bytes — so a sha256 on a
 * streamed row would be a claim the build cannot make, and is refused here rather than filled with a lie. What a
 * streamed row must carry instead is *something* that identifies the bytes: the size, the ETag or the
 * Last-Modified. A streamed row with none of the three identifies nothing at all — it would say only that a URL
 * was read at some time — so it is refused too, for the same reason the sha256 is.
 */
export function provenanceRow({ source, url, period, bytes, sha256 = null, fetchMode, etag = null, lastModified = null, fetchedAt }) {
  if (!["tlc_yellow", "tlc_hvfhs", "tlc_zones", "ghcn", "citibike"].includes(source)) throw new Error(`unknown provenance source ${source}`);
  if (!["downloaded", "streamed"].includes(fetchMode)) throw new Error(`fetch_mode must be downloaded or streamed, got ${fetchMode}`);
  if (fetchMode === "streamed" && sha256 !== null) throw new Error(`${url} is streamed, so it has no sha256 of its own bytes`);
  if (fetchMode === "downloaded" && !/^[0-9a-f]{64}$/.test(String(sha256))) throw new Error(`${url} was downloaded, so it needs a sha256`);
  if (fetchMode === "streamed" && (bytes === null || bytes === undefined) && etag === null && lastModified === null) {
    throw new Error(`${url} is streamed and carries no bytes, etag or last-modified: nothing in the row identifies what was read`);
  }
  return { source, url, period, bytes: bytes === null ? null : Number(bytes), sha256, fetch_mode: fetchMode, http_etag: etag, http_last_modified: lastModified, fetched_at: fetchedAt, builder_version: BUILDER_VERSION };
}

/**
 * Validate the hand-checked CRZ list against the taxi zone lookup. This is the only part of the zone definition
 * a machine can check: that every id exists and is in Manhattan. Whether a zone is below 60th St is the map's
 * answer, recorded in CRZ_ZONE_IDS above.
 */
export function deriveCrzZones(lookupRows, ids = CRZ_ZONE_IDS) {
  const byId = new Map(lookupRows.map((r) => [Number(r.location_id), r]));
  const rows = [];
  for (const id of ids) {
    const row = byId.get(Number(id));
    if (!row) throw new Error(`CRZ zone ${id} is not in the taxi zone lookup — the lookup changed, re-check the list against the TLC map`);
    if (row.borough !== "Manhattan") throw new Error(`CRZ zone ${id} (${row.zone}) is in ${row.borough}, not Manhattan — re-check the list against the TLC map`);
    rows.push({ location_id: Number(id), zone: row.zone, borough: row.borough });
  }
  const seen = new Set(rows.map((r) => r.location_id));
  if (seen.size !== rows.length) throw new Error("the CRZ zone list has a duplicate id");
  return rows.sort((a, b) => a.location_id - b.location_id);
}

// ---------------------------------------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The CDNs in front of these files rate-limit and occasionally answer 403 or 5xx to a request they would serve a
 * moment later, so a discouraging status is retried with backoff. What this does NOT do is decide what a final
 * 403 or 404 means: it hands the last response back so the caller can classify it (see `confirmNotPublished`).
 * Only a transport failure — no response at all — is thrown from here.
 */
async function fetchWithRetry(url, init = {}, attempts = 5) {
  let lastError, lastResponse;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, { redirect: "follow", ...init, headers: { "user-agent": USER_AGENT, ...(init.headers ?? {}) } });
      if (res.ok || res.status === 206 || res.status === 404 || res.status === 416) return res;
      await lastResponse?.body?.cancel().catch(() => {});
      lastResponse = res; lastError = null;
    } catch (error) { lastError = error; }
    if (attempt < attempts) await sleep(1000 * 2 ** (attempt - 1));
  }
  if (lastResponse) return lastResponse;
  throw lastError;
}

/** Thrown when the publisher does not serve a month at all, which is an answer and not a failure. */
export class NotPublished extends Error {
  constructor(url) { super(`${url} is not published`); this.name = "NotPublished"; }
}

// A small object on the same host that certainly exists, used to tell "absent" apart from "throttled".
export const CONTROL_URL = Object.freeze({ "d37ci6vzurychx.cloudfront.net": ZONE_LOOKUP_URL, "s3.amazonaws.com": CITIBIKE_BASE });

/**
 * CloudFront answers **403, not 404**, for an object that is not there — the TLC bucket grants no ListBucket —
 * and it answers 403 when it is rate-limiting too. One response cannot tell those apart, and guessing either way
 * is a real error: read as "absent" it silently shortens the build window, read as "throttled" it stalls on a
 * month that will never exist. So a missing-looking answer is confirmed against a control object on the same
 * host that certainly exists. Control served -> this month is genuinely not published. Control refused too ->
 * the build is being throttled, and it says so rather than quietly dropping a month.
 */
export async function confirmNotPublished(url, status) {
  const control = CONTROL_URL[new URL(url).host];
  if (!control) throw new Error(`${url} -> ${status}`);
  // The control object refusing *is* the throttling signal, and there is nothing behind it to check it against:
  // saying "and <control> is refused too" here would name the same URL twice. Say what it means instead.
  if (control === url) {
    throw new Error(`${url} -> ${status}. This is the control object for ${new URL(url).host} — it certainly exists, ` +
      `so a refusal means the host is rate-limiting this build rather than missing the file. ` +
      `Wait a few minutes and run again — finished downloads in --raw-dir are kept and not re-fetched.`);
  }
  let served = false;
  try { served = (await fetchWithRetry(control, { method: "HEAD" })).ok; } catch { served = false; }
  if (!served) {
    throw new Error(`${url} -> ${status}, and ${control} is refused too: the host is rate-limiting this build, not missing the file. ` +
      `Wait a few minutes and run again — finished downloads in --raw-dir are kept and not re-fetched.`);
  }
  // The control being served is suggestive, not conclusive: a throttle can refuse a 500 MB object's HEAD while
  // still serving a 12 KB one. Declaring a month absent drops it from the build silently, so the object itself
  // gets one more full-budget look before that conclusion is drawn.
  let final;
  try { final = await fetchWithRetry(url, { method: "HEAD" }); } catch { final = null; }
  if (final?.ok) throw new Error(`${url} answered ${status} and then 200: the host is throttling intermittently. Run again.`);
  throw new NotPublished(url);
}

async function head(url) {
  const res = await fetchWithRetry(url, { method: "HEAD" });
  return {
    ok: res.ok, status: res.status,
    bytes: res.headers.get("content-length") === null ? null : Number(res.headers.get("content-length")),
    etag: res.headers.get("etag"), lastModified: res.headers.get("last-modified"),
  };
}

async function sha256File(path) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

/** Where the record of a download's fetch lives, beside the bytes it describes. */
const sidecarPath = (dest) => `${dest}.fetch.json`;

/**
 * Record what the server said about bytes that have just landed, and return their provenance row. The row is
 * built first: an unsound row throws here, before a sidecar claiming it is written for the next run to trust.
 */
export function recordDownload(dest, saved) {
  const row = provenanceRow(saved);
  writeFileSync(sidecarPath(dest), JSON.stringify(saved, null, 2) + "\n");
  return row;
}

/**
 * The provenance row for an already-downloaded file, or null when the cache cannot be trusted.
 *
 * The sidecar's sha256 is a claim about the bytes on disk, and `build_provenance` publishes it as if the build
 * had read them. So the bytes are re-hashed here rather than the claim being taken on the url and size alone: a
 * file edited in place, truncated and rewritten, or corrupted by a half-finished copy keeps its length and its
 * sidecar, and would otherwise be published under a hash it no longer has. Hashing is cheap next to the fetch
 * it avoids (16-64 MB, tens of milliseconds); a mismatch is logged and the file is re-fetched.
 */
export async function readCachedDownload(dest, url, log = () => {}) {
  const sidecar = sidecarPath(dest);
  if (!existsSync(dest) || !existsSync(sidecar)) return null;
  let saved;
  try { saved = JSON.parse(readFileSync(sidecar, "utf8")); }
  catch { log(`    ${dest}: its .fetch.json is unreadable — re-fetching`); return null; }
  if (saved.url !== url || saved.bytes !== statSync(dest).size) return null;
  const actual = await sha256File(dest);
  if (actual !== saved.sha256) {
    log(`    ${dest}: cached bytes hash ${actual}, the sidecar recorded ${saved.sha256} — the cached file changed under us, re-fetching`);
    return null;
  }
  return provenanceRow(saved);
}

/**
 * Download a whole file once and keep it, with a sidecar recording what the server said at the moment the
 * bytes landed. A rerun re-hashes the kept file and reads the sidecar instead of asking again: that is both one
 * less request against a rate-limited CDN and the honest answer, because `fetched_at` then names when these
 * bytes were fetched rather than when this build ran. Delete the file (or the whole --raw-dir) to force a fresh
 * fetch.
 */
async function download(url, dest, { source, period }, log = () => {}) {
  const cached = await readCachedDownload(dest, url, log);
  if (cached) return { path: dest, cached: true, row: cached };
  const res = await fetchWithRetry(url);
  if (!res.ok) await confirmNotPublished(url, res.status); // always throws: NotPublished, or a throttling error
  const partial = `${dest}.part`;
  await pipeline(Readable.fromWeb(res.body), createWriteStream(partial));
  renameSync(partial, dest);
  const saved = {
    source, url, period, bytes: statSync(dest).size, sha256: await sha256File(dest), fetchMode: "downloaded",
    etag: res.headers.get("etag"), lastModified: res.headers.get("last-modified"), fetchedAt: utcStamp(),
  };
  return { path: dest, cached: false, row: recordDownload(dest, saved) };
}

// ---------------------------------------------------------------------------------------------------------
// Remote zip, read with HTTP range requests
// ---------------------------------------------------------------------------------------------------------
// The Citi Bike monthly archives are hundreds of megabytes and hold two to four CSVs each. Nothing here
// downloads the archive: the central directory is read from the tail, and each member is then fetched as its
// own byte range, aggregated and deleted.
async function readRange(url, start, end) {
  const res = await fetchWithRetry(url, { headers: { Range: `bytes=${start}-${end}` } });
  if (res.status !== 206) throw new Error(`range GET ${url} bytes=${start}-${end} -> ${res.status} (the host must support range requests)`);
  return Buffer.from(await res.arrayBuffer());
}

export async function zipDirectory(url) {
  const meta = await head(url);
  if (!meta.ok) await confirmNotPublished(url, meta.status);
  if (!meta.bytes) throw new Error(`HEAD ${url} gave no content-length; the zip directory cannot be located`);
  const tailLength = Math.min(meta.bytes, 65557); // max comment (65535) + EOCD record (22)
  const tail = await readRange(url, meta.bytes - tailLength, meta.bytes - 1);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error(`${url} has no end-of-central-directory record`);
  const count = tail.readUInt16LE(eocd + 10), size = tail.readUInt32LE(eocd + 12), offset = tail.readUInt32LE(eocd + 16);
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) throw new Error(`${url} is a zip64 archive, which this reader does not implement`);
  const dir = await readRange(url, offset, offset + size - 1);
  const entries = [];
  let p = 0;
  while (p < dir.length && dir.readUInt32LE(p) === 0x02014b50) {
    const nameLength = dir.readUInt16LE(p + 28), extraLength = dir.readUInt16LE(p + 30), commentLength = dir.readUInt16LE(p + 32);
    entries.push({
      name: dir.subarray(p + 46, p + 46 + nameLength).toString("utf8"),
      method: dir.readUInt16LE(p + 10),
      compressedSize: dir.readUInt32LE(p + 20),
      uncompressedSize: dir.readUInt32LE(p + 24),
      localHeaderOffset: dir.readUInt32LE(p + 42),
    });
    p += 46 + nameLength + extraLength + commentLength;
  }
  if (entries.length !== count) throw new Error(`${url}: central directory declared ${count} entries, ${entries.length} parsed`);
  return { ...meta, entries };
}

async function extractZipEntry(url, entry, dest) {
  const header = await readRange(url, entry.localHeaderOffset, entry.localHeaderOffset + 29);
  if (header.readUInt32LE(0) !== 0x04034b50) throw new Error(`${url}: ${entry.name} has no local file header`);
  const dataStart = entry.localHeaderOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
  const res = await fetchWithRetry(url, { headers: { Range: `bytes=${dataStart}-${dataStart + entry.compressedSize - 1}` } });
  if (res.status !== 206) throw new Error(`range GET of ${entry.name} -> ${res.status}`);
  const stages = [Readable.fromWeb(res.body)];
  if (entry.method === 8) stages.push(createInflateRaw());
  else if (entry.method !== 0) throw new Error(`${entry.name} uses zip compression method ${entry.method}, which this reader does not implement`);
  stages.push(createWriteStream(dest));
  await pipeline(...stages);
  return statSync(dest).size;
}

// ---------------------------------------------------------------------------------------------------------
// DuckDB
// ---------------------------------------------------------------------------------------------------------
async function openDuckDb(path, config) {
  const { DuckDBInstance } = await import("@duckdb/node-api");
  const db = await DuckDBInstance.create(path, config);
  const connection = await db.connect();
  await connection.run("SET TimeZone='UTC'");
  return { db, connection, close: () => { connection.closeSync(); db.closeSync(); } };
}

const rowsOf = async (connection, sql) => (await connection.runAndReadAll(sql)).getRowObjectsJson();
const oneOf = async (connection, sql) => (await rowsOf(connection, sql))[0];

/** Insert literal rows without building a giant statement: values are rendered, in the declared column order. */
async function insertRows(connection, table, columns, rows, chunk = 500) {
  for (let i = 0; i < rows.length; i += chunk) {
    const values = rows.slice(i, i + chunk).map((row) => "(" + columns.map((c) => {
      const v = row[c];
      if (v === null || v === undefined) return "NULL";
      return typeof v === "number" ? String(v) : sqlString(v);
    }).join(",") + ")").join(",");
    await connection.run(`insert into ${ident(table)} (${columns.map(ident).join(",")}) values ${values}`);
  }
}

// ---------------------------------------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------------------------------------
/**
 * Row count and content hash per table, read under the Instance's own limits so the result proves queryability.
 * All three limits, not two: each query runs through the Engine's own `runBounded`, so a table that cannot be
 * hashed inside `statement_timeout_ms` is cancelled and named here rather than hashed at whatever speed a
 * builder's machine happens to manage. A table the Instance cannot scan in time is not a table it can query.
 */
export async function verifyDatabase(path) {
  if (!existsSync(path)) throw new Error(`no database at ${path}`);
  const handle = await openDuckDb(path, {
    access_mode: "READ_ONLY", memory_limit: INSTANCE_LIMITS.memory_limit, threads: String(INSTANCE_LIMITS.threads),
  });
  const bounded = async (sql, what) =>
    await (await runBounded(handle.connection, sql, INSTANCE_LIMITS.statement_timeout_ms, what)).getRowObjectsJson();
  try {
    const present = new Set((await bounded("select table_name from information_schema.tables where table_schema='main'", "listing tables")).map((r) => r.table_name));
    const out = [];
    for (const table of TABLES) {
      if (!present.has(table.name)) { out.push({ table: table.name, rows: null, content_hash: null, volatile: !!table.volatile, missing: true }); continue; }
      const started = Date.now();
      const row = (await bounded(tableHashSql(table.name, table.columns), `hashing ${table.name}`))[0];
      out.push({ table: table.name, rows: Number(row.rows), content_hash: String(row.content_hash), volatile: !!table.volatile, ms: Date.now() - started });
    }
    return out;
  } finally { handle.close(); }
}

// ---------------------------------------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------------------------------------
// Every summed column is an exact decimal, never a DOUBLE. Floating-point addition is not associative, so a
// parallel `sum(DOUBLE)` lands on a different last bit depending on how the scan was partitioned — two builds
// of the same bytes then disagree in `trips_daily`, which is exactly what the determinism acceptance forbids.
// DECIMAL addition is integer addition: exact, and independent of the order the groups were combined in.
// (18,4) holds a per-group sum far past anything the TLC publishes, including its outlier fares.
export const MONEY = "DECIMAL(18,4)";

const SCHEMA = `
create table trips_daily (
  pickup_date DATE not null, service VARCHAR not null,
  pu_location_id INTEGER, do_location_id INTEGER,
  trips BIGINT not null, fare_sum ${MONEY}, tip_sum ${MONEY}, distance_sum ${MONEY},
  congestion_surcharge_sum ${MONEY}, cbd_congestion_fee_sum ${MONEY}
);
create table trips_sample (
  service VARCHAR not null, pickup_datetime TIMESTAMP, dropoff_datetime TIMESTAMP,
  pu_location_id INTEGER, do_location_id INTEGER, trip_distance DOUBLE,
  fare_amount DOUBLE, tip_amount DOUBLE, tolls_amount DOUBLE,
  congestion_surcharge DOUBLE, cbd_congestion_fee DOUBLE,
  passenger_count BIGINT, payment_type VARCHAR
);
create table weather_daily (
  observation_date DATE not null, station_id VARCHAR not null,
  tmax_c DOUBLE, tmin_c DOUBLE, prcp_mm DOUBLE, snow_mm DOUBLE
);
create table citibike_daily (
  ride_date DATE not null, member_casual VARCHAR, rideable_type VARCHAR,
  rides BIGINT not null, duration_seconds_sum BIGINT
);
create table citibike_stations (
  month VARCHAR not null, station_id VARCHAR not null, station_name VARCHAR,
  latitude DOUBLE, longitude DOUBLE, starts BIGINT, ends BIGINT, first_seen DATE, last_seen DATE
);
create table taxi_zones (location_id INTEGER not null, borough VARCHAR, zone VARCHAR, service_zone VARCHAR);
create table crz_zones (location_id INTEGER not null, zone VARCHAR, borough VARCHAR);
create table build_meta (key VARCHAR not null, value VARCHAR);
create table build_provenance (
  source VARCHAR not null, url VARCHAR not null, period VARCHAR, bytes BIGINT, sha256 VARCHAR,
  fetch_mode VARCHAR not null, http_etag VARCHAR, http_last_modified VARCHAR,
  fetched_at TIMESTAMP not null, builder_version VARCHAR not null
);
`;

// ---------------------------------------------------------------------------------------------------------
// TLC
// ---------------------------------------------------------------------------------------------------------
// Per service: the parquet columns this build reads, and nothing else. `fare` is each service's own base fare
// field — yellow's metered `fare_amount` and the HVFHS `base_passenger_fare` are different quantities and
// scripts/README.md says so; they are summed per service and never added together.
export const TLC_SERVICES = {
  yellow: { file: (m) => `yellow_tripdata_${m}.parquet`, pickup: "tpep_pickup_datetime", dropoff: "tpep_dropoff_datetime", fare: "fare_amount", tip: "tip_amount", tolls: "tolls_amount", distance: "trip_distance", passengers: "passenger_count", payment: "payment_type", provenance: "tlc_yellow" },
  hvfhs: { file: (m) => `fhvhv_tripdata_${m}.parquet`, pickup: "pickup_datetime", dropoff: "dropoff_datetime", fare: "base_passenger_fare", tip: "tips", tolls: "tolls", distance: "trip_miles", passengers: null, payment: null, provenance: "tlc_hvfhs" },
};

/**
 * The expressions the sample decision is taken over. The key is rendered to text before it is hashed, so a
 * DOUBLE in it would make membership depend on how DuckDB prints a double — shortest round-trip formatting, an
 * engine decision and not a property of the trip, so `0.1 + 0.2` and `0.3` are two different trips to it. The
 * fare is cast to the same exact decimal the sums use, and the rendering is then fixed by the type. This is what
 * BUILDER_VERSION 2.x names: a 1.x build of the same bytes put a slightly different set of trips in the sample.
 */
export function sampleKeySql(spec) {
  return [ident(spec.pickup), ident(spec.dropoff), ident("PULocationID"), ident("DOLocationID"), `${ident(spec.fare)}::${MONEY}`];
}

/** Columns a parquet file actually has: the pre-2025 files carry no `cbd_congestion_fee`. Reads the footer only. */
async function parquetColumns(connection, source) {
  const rows = await rowsOf(connection, `describe select * from read_parquet(${sqlString(source)}) limit 0`);
  return new Set(rows.map((r) => r.column_name));
}

const optional = (columns, name, type = "DOUBLE") => (columns.has(name) ? ident(name) : `NULL::${type}`);
/** An exact-decimal sum of a parquet column that may not exist in this month's file. */
const sumOf = (columns, name) => `sum((${optional(columns, name)})::${MONEY})`;

/**
 * Reduce one TLC month in a single pass: a daily origin-destination aggregate, carrying the sampled trips of
 * each group as a list so the file is never scanned twice.
 */
async function buildTlcMonth(connection, service, month, source, sampleRate, log) {
  const spec = TLC_SERVICES[service];
  const columns = await parquetColumns(connection, source);
  for (const required of [spec.pickup, spec.dropoff, "PULocationID", "DOLocationID", spec.fare]) {
    if (!columns.has(required)) throw new Error(`${source} has no column ${required}; the TLC changed the ${service} schema`);
  }
  const { start, end } = monthBounds(month);
  const cbd = optional(columns, "cbd_congestion_fee");
  const congestion = optional(columns, "congestion_surcharge");
  const sampleKey = sampleKeySql(spec);
  const sample = `{
      pickup_datetime: ${ident(spec.pickup)}, dropoff_datetime: ${ident(spec.dropoff)},
      trip_distance: ${optional(columns, spec.distance)}, fare_amount: ${ident(spec.fare)},
      tip_amount: ${optional(columns, spec.tip)}, tolls_amount: ${optional(columns, spec.tolls)},
      congestion_surcharge: ${congestion}, cbd_congestion_fee: ${cbd},
      passenger_count: ${spec.passengers && columns.has(spec.passengers) ? `${ident(spec.passengers)}::BIGINT` : "NULL::BIGINT"},
      payment_type: ${spec.payment && columns.has(spec.payment) ? `${ident(spec.payment)}::VARCHAR` : "NULL::VARCHAR"}
    }`;
  await connection.run("drop table if exists stg_tlc");
  await connection.run(`
    create temp table stg_tlc as
    select
      cast(${ident(spec.pickup)} as DATE) as pickup_date,
      "PULocationID"::INTEGER as pu_location_id,
      "DOLocationID"::INTEGER as do_location_id,
      count(*)::BIGINT as trips,
      sum(${ident(spec.fare)}::${MONEY}) as fare_sum,
      ${sumOf(columns, spec.tip)} as tip_sum,
      ${sumOf(columns, spec.distance)} as distance_sum,
      sum((${congestion})::${MONEY}) as congestion_surcharge_sum,
      sum((${cbd})::${MONEY}) as cbd_congestion_fee_sum,
      list(${sample}) filter (where ${sampleFilterSql(sampleKey, sampleRate)}) as samples
    from read_parquet(${sqlString(source)})
    where ${ident(spec.pickup)} >= TIMESTAMP ${sqlString(start)} and ${ident(spec.pickup)} < TIMESTAMP ${sqlString(end)}
    group by 1, 2, 3`);
  await connection.run(`insert into trips_daily select pickup_date, ${sqlString(service)}, pu_location_id, do_location_id, trips, fare_sum, tip_sum, distance_sum, congestion_surcharge_sum, cbd_congestion_fee_sum from stg_tlc`);
  await connection.run(`
    insert into trips_sample
    select ${sqlString(service)}, s.pickup_datetime, s.dropoff_datetime, q.pu_location_id, q.do_location_id,
           s.trip_distance, s.fare_amount, s.tip_amount, s.tolls_amount, s.congestion_surcharge,
           s.cbd_congestion_fee, s.passenger_count, s.payment_type
    from (select pu_location_id, do_location_id, unnest(samples) as s from stg_tlc where samples is not null) q`);
  const summary = await oneOf(connection, "select count(*)::BIGINT as groups, sum(trips)::BIGINT as trips, coalesce(sum(len(samples)),0)::BIGINT as sampled from stg_tlc");
  await connection.run("drop table stg_tlc");
  log(`    ${service} ${month}: ${Number(summary.trips).toLocaleString("en-US")} trips -> ${Number(summary.groups).toLocaleString("en-US")} daily rows, ${Number(summary.sampled).toLocaleString("en-US")} sampled`);
}

// ---------------------------------------------------------------------------------------------------------
// Citi Bike
// ---------------------------------------------------------------------------------------------------------
const CITIBIKE_CSV = (path) => `read_csv(${sqlString(path)}, header=true, all_varchar=true, ignore_errors=false)`;

// The two month-scoped staging tables, and the only way they are emptied.
//
// `delete from` is not that way. DuckDB's deletes are tombstones: the row groups stay, and a month's rows are
// still paying for themselves while the next month's are appended beside them. Measured over six one-month
// cycles the process grew 135 MB -> 808 MB with `delete`, monotonically, on data that is the same size every
// cycle. Dropping the table releases its row groups; recreating it costs one DDL statement a month.
export const CITIBIKE_STAGING = Object.freeze([
  ["stg_cb_daily", "ride_date DATE, member_casual VARCHAR, rideable_type VARCHAR, rides BIGINT, duration_seconds_sum BIGINT"],
  ["stg_cb_stations", "station_id VARCHAR, station_name VARCHAR, latitude DOUBLE, longitude DOUBLE, is_start BOOLEAN, seen_on DATE"],
]);

/** Empty the Citi Bike staging tables by replacing them — called once per month, before that month's inserts. */
export async function recreateCitibikeStaging(connection) {
  for (const [name, columns] of CITIBIKE_STAGING) {
    await connection.run(`drop table if exists ${ident(name)}`);
    await connection.run(`create temp table ${ident(name)} (${columns})`);
  }
}

async function buildCitibikeEntry(connection, month, path) {
  const { start, end } = monthBounds(month);
  const inWindow = `s >= TIMESTAMP ${sqlString(start)} and s < TIMESTAMP ${sqlString(end)}`;
  await connection.run("drop table if exists stg_cb");
  await connection.run(`
    create temp table stg_cb as
    select try_cast(started_at as TIMESTAMP) as s, try_cast(ended_at as TIMESTAMP) as e,
           member_casual, rideable_type,
           start_station_id, start_station_name, try_cast(start_lat as DOUBLE) as start_lat, try_cast(start_lng as DOUBLE) as start_lng,
           end_station_id, end_station_name, try_cast(end_lat as DOUBLE) as end_lat, try_cast(end_lng as DOUBLE) as end_lng
    from ${CITIBIKE_CSV(path)}`);
  const counts = await oneOf(connection, `select count(*)::BIGINT as total, count(*) filter (where s is null or e is null or e < s)::BIGINT as unusable, count(*) filter (where s is not null and not (${inWindow}))::BIGINT as outside from stg_cb`);
  await connection.run(`
    insert into stg_cb_daily
    select cast(s as DATE), member_casual, rideable_type, count(*)::BIGINT, sum(date_diff('second', s, e))::BIGINT
    from stg_cb where s is not null and e is not null and e >= s and ${inWindow} group by 1, 2, 3`);
  await connection.run(`
    insert into stg_cb_stations
    select station_id, station_name, latitude, longitude, is_start, cast(seen_on as DATE) from (
      select start_station_id as station_id, start_station_name as station_name, start_lat as latitude, start_lng as longitude, true as is_start, s as seen_on from stg_cb where s is not null and ${inWindow}
      union all
      select end_station_id, end_station_name, end_lat, end_lng, false, s from stg_cb where s is not null and ${inWindow}
    ) x where station_id is not null and station_id <> ''`);
  await connection.run("drop table stg_cb");
  return { total: Number(counts.total), unusable: Number(counts.unusable), outside: Number(counts.outside) };
}

async function finishCitibikeMonth(connection, month) {
  await connection.run(`
    insert into citibike_daily
    select ride_date, member_casual, rideable_type, sum(rides)::BIGINT, sum(duration_seconds_sum)::BIGINT
    from stg_cb_daily group by 1, 2, 3`);
  await connection.run(`
    insert into citibike_stations
    select ${sqlString(month)}, station_id, max(station_name),
           round(median(latitude), 6), round(median(longitude), 6),
           count(*) filter (where is_start)::BIGINT, count(*) filter (where not is_start)::BIGINT,
           min(seen_on), max(seen_on)
    from stg_cb_stations group by station_id`);
}

// ---------------------------------------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------------------------------------
async function probeLatestMonth(from, log) {
  let latest = null;
  for (let month = from, probes = 0; probes < 240; month = nextMonth(month), probes++) {
    const url = TLC_BASE + TLC_SERVICES.yellow.file(month);
    const meta = await head(url);
    if (!meta.ok) {
      try { await confirmNotPublished(url, meta.status); }
      catch (error) { if (!(error instanceof NotPublished)) throw error; }
      log(`  the CDN stops at ${latest ?? "(nothing)"}: it does not serve ${month}`);
      break;
    }
    latest = month;
  }
  if (!latest) throw new Error(`the TLC CDN serves no yellow file for ${from}; pass --to explicitly`);
  return latest;
}

/** `build_meta` of an existing database, as a plain object. Read-only, under the Instance's own limits. */
async function readBuildMeta(path) {
  const handle = await openDuckDb(path, {
    access_mode: "READ_ONLY", memory_limit: INSTANCE_LIMITS.memory_limit, threads: String(INSTANCE_LIMITS.threads),
  });
  try {
    const rows = await rowsOf(handle.connection, "select key, value from build_meta");
    return Object.fromEntries(rows.map((r) => [String(r.key), String(r.value)]));
  } finally { handle.close(); }
}

/**
 * Everything this build reaches the network (or the disk it opens a database on) through. `build` takes these as
 * an argument so the offline tests can walk a whole window — skipped months, refusals, the staging tables — with
 * no fetch at all. Nothing else in the file is injectable, and nothing here is a mock in production use.
 */
export const BUILD_DEPS = Object.freeze({ download, head, confirmNotPublished, zipDirectory, extractZipEntry, probeLatestMonth, openDatabase: openDuckDb });

export async function build(args, log = console.log, injected = {}) {
  const { download, head, confirmNotPublished, zipDirectory, extractZipEntry, probeLatestMonth, openDatabase } = { ...BUILD_DEPS, ...injected };
  const started = Date.now();
  const to = args.to ?? await probeLatestMonth(args.from, log);
  const window = monthRange(args.from, to);
  log(`building ${args.out}`);
  log(`  window ${args.from}..${to} (${window.length} month${window.length === 1 ? "" : "s"}), sources ${args.sources.join(",")}, sample 1 in ${args.sampleRate}`);

  mkdirSync(args.rawDir, { recursive: true });
  mkdirSync(dirname(args.out), { recursive: true });
  const temporary = `${args.out}.building`;
  for (const stale of [temporary, `${temporary}.wal`]) rmSync(stale, { force: true });

  // --append against an existing file: work on a copy of it, and build only what it does not already hold.
  // Against no file it is not an error and not a silent no-op — it says so and builds the window.
  let previousMeta = null;
  let existingMonths = [];
  if (args.append) {
    if (!existsSync(args.out)) log(`  --append: no database at ${args.out} yet, so this run builds one`);
    else {
      previousMeta = await readBuildMeta(args.out);
      const refusal = appendMismatch(previousMeta, { sources: args.sources, sampleRate: args.sampleRate });
      if (refusal) throw new Error(`--append refused for ${args.out}: ${refusal}`);
      existingMonths = monthsOf(previousMeta);
      copyFileSync(args.out, temporary);
      log(`  --append: ${args.out} already holds ${existingMonths.length} month${existingMonths.length === 1 ? "" : "s"} (${existingMonths.join(",") || "none recorded"})`);
    }
  }
  const plan = appendPlan(existingMonths, window);
  const months = plan.build;
  for (const month of plan.skipped) log(`    ${month}: already built — skipped`);
  if (!months.length) log("  every month of this window is already here; only build_meta is rewritten");

  // What this run builds, per source, and every month a source would not serve. A month the publisher does not
  // serve is a fact about the window, not a line of log output that scrolls away: it is carried to build_meta
  // and to the exit status. A month the file already holds is not one of these — it is in `plan.skipped`, was
  // asked for once and answered once, and nothing about it fell short.
  const requestedMonthly = MONTHLY_SOURCES.filter((s) => args.sources.includes(s));
  const monthsBuilt = new Map(requestedMonthly.map((s) => [s, []]));
  const skipped = [];
  const skip = (source, month, reason) => { skipped.push({ source, month, reason }); log(`    ${month}: ${reason} — skipped`); };

  const handle = await openDatabase(temporary, { ...BUILD_LIMITS, temp_directory: join(args.rawDir, "duckdb-spill") });
  const connection = handle.connection;
  const provenance = [];
  let weatherCoverage = previousMeta?.weather_coverage ?? "not built";
  let held = [...existingMonths]; // every month the finished file holds; settled once the sources have run
  let complete = false;
  try {
    if (!previousMeta) for (const statement of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) await connection.run(statement);
    const needsHttp = args.sources.includes("hvfhs") && months.length > 0;
    if (needsHttp) { await connection.run("install httpfs"); await connection.run("load httpfs"); }

    // Taxi zones: 12 KB, downloaded and hashed. crz_zones is validated against it. They do not vary by month,
    // so an append leaves the rows — and the provenance of the fetch that produced them — exactly as they are.
    if (previousMeta) log("  taxi zones: already built — kept, with the provenance of the fetch that wrote them");
    else {
      log("  taxi zones");
      const zonePath = join(args.rawDir, "taxi_zone_lookup.csv");
      provenance.push((await download(ZONE_LOOKUP_URL, zonePath, { source: "tlc_zones", period: "static" }, log)).row);
      await connection.run(`insert into taxi_zones select "LocationID"::INTEGER, "Borough", "Zone", "service_zone" from read_csv(${sqlString(zonePath)}, header=true)`);
      const zoneRows = await rowsOf(connection, "select location_id, borough, zone from taxi_zones");
      const crz = deriveCrzZones(zoneRows.map((r) => ({ location_id: r.location_id, borough: r.borough, zone: r.zone })));
      await insertRows(connection, "crz_zones", ["location_id", "zone", "borough"], crz);
      log(`    ${zoneRows.length} zones, ${crz.length} in the Congestion Relief Zone`);
    }

    // TLC. Yellow months are downloaded and hashed; HVFHS months are streamed by DuckDB over httpfs.
    for (const service of ["yellow", "hvfhs"]) {
      if (!args.sources.includes(service) || !months.length) continue;
      log(`  TLC ${service}`);
      for (const month of months) {
        const url = TLC_BASE + TLC_SERVICES[service].file(month);
        let source = url;
        if (service === "yellow") {
          const local = join(args.rawDir, TLC_SERVICES.yellow.file(month));
          let file;
          try { file = await download(url, local, { source: "tlc_yellow", period: month }, log); }
          catch (error) { if (error instanceof NotPublished) { skip(service, month, "not published"); continue; } throw error; }
          provenance.push(file.row);
          source = local;
        } else {
          const meta = await head(url);
          if (!meta.ok) {
            try { await confirmNotPublished(url, meta.status); }
            catch (error) { if (!(error instanceof NotPublished)) throw error; }
            skip(service, month, "not published"); continue;
          }
          provenance.push(provenanceRow({ source: "tlc_hvfhs", url, period: month, bytes: meta.bytes, fetchMode: "streamed", etag: meta.etag, lastModified: meta.lastModified, fetchedAt: utcStamp() }));
        }
        await buildTlcMonth(connection, service, month, source, args.sampleRate, log);
        monthsBuilt.get(service).push(month);
      }
    }

    // GHCN: one 16 MB station history covers every month, so it is downloaded once and hashed.
    if (args.sources.includes("ghcn") && months.length) {
      log("  GHCN-Daily");
      const path = join(args.rawDir, `${GHCN_STATION}.csv`);
      // One file carries the station's whole history, so its period is not the build window.
      provenance.push((await download(GHCN_URL, path, { source: "ghcn", period: "station history" }, log)).row);
      // The months this run builds, not the whole requested window: an append fetches weather for the days it
      // is adding. The anti-join below is what makes a re-read of an overlapping range harmless.
      const first = months[0].replace("-", "") + "01";
      const afterLast = nextMonth(months[months.length - 1]).replace("-", "") + "01";
      // Q_FLAG is set when a value failed one of GHCN's quality checks; those values are dropped, not carried.
      await connection.run(`
        insert into weather_daily
        with day as (
          select strptime("DATE", '%Y%m%d')::DATE as observation_date, ${sqlString(GHCN_STATION)} as station_id,
                 max("DATA_VALUE") filter (where "ELEMENT" = 'TMAX') / 10.0 as tmax_c,
                 max("DATA_VALUE") filter (where "ELEMENT" = 'TMIN') / 10.0 as tmin_c,
                 max("DATA_VALUE") filter (where "ELEMENT" = 'PRCP') / 10.0 as prcp_mm,
                 max("DATA_VALUE") filter (where "ELEMENT" = 'SNOW') * 1.0 as snow_mm
          from read_csv(${sqlString(path)}, header=true, types={'ID':'VARCHAR','DATE':'VARCHAR','ELEMENT':'VARCHAR','DATA_VALUE':'BIGINT','M_FLAG':'VARCHAR','Q_FLAG':'VARCHAR','S_FLAG':'VARCHAR','OBS_TIME':'VARCHAR'})
          where "ID" = ${sqlString(GHCN_STATION)} and "ELEMENT" in ('TMAX','TMIN','PRCP','SNOW')
            and ("Q_FLAG" is null or "Q_FLAG" = '')
            and "DATE" >= ${sqlString(first)} and "DATE" < ${sqlString(afterLast)}
          group by 1
        )
        select * from day
        where observation_date not in (select observation_date from weather_daily)`);
      const days = await oneOf(connection, "select count(*)::BIGINT as n, min(observation_date)::VARCHAR as first, max(observation_date)::VARCHAR as last from weather_daily");
      weatherCoverage = Number(days.n) ? `${days.first}..${days.last}` : "none";
      log(`    ${Number(days.n)} days at ${GHCN_STATION} (${weatherCoverage})`);
      // The by_station file is a periodic export, not a live feed: as of 2026-09-17 it ends in February 2025.
      // A window that runs past its last day gets fewer weather days than trip days, and the build says so here
      // rather than leaving a Check to discover it as a silent gap.
      const lastMonth = months[months.length - 1];
      if (!Number(days.n)) log(`    WARNING: ${GHCN_STATION} has no observations in this window at all`);
      else if (String(days.last).slice(0, 7) < lastMonth) {
        log(`    WARNING: weather stops at ${days.last}, before the end of the build window. The by_station export`);
        log(`             is not updated daily; for later days read the by_year parquet (see scripts/README.md).`);
      }
    }

    // Citi Bike: streamed out of the remote monthly zip, one member CSV at a time.
    if (args.sources.includes("citibike") && months.length) {
      log("  Citi Bike");
      const scratch = join(args.rawDir, "citibike");
      mkdirSync(scratch, { recursive: true });
      for (const month of months) {
        const url = `${CITIBIKE_BASE}${month.replace("-", "")}-citibike-tripdata.zip`;
        let directory;
        try { directory = await zipDirectory(url); }
        catch (error) { if (error instanceof NotPublished) { skip("citibike", month, "not published"); continue; } throw error; }
        const members = directory.entries.filter((e) => /\.csv$/i.test(e.name) && !e.name.startsWith("__MACOSX/") && !/\/\._/.test(e.name));
        if (!members.length) { skip("citibike", month, "the archive holds no CSV member"); continue; }
        provenance.push(provenanceRow({ source: "citibike", url, period: month, bytes: directory.bytes, fetchMode: "streamed", etag: directory.etag, lastModified: directory.lastModified, fetchedAt: utcStamp() }));
        // Fresh staging tables per month: see CITIBIKE_STAGING for why they are replaced and not emptied.
        await recreateCitibikeStaging(connection);
        let total = 0, unusable = 0, outside = 0;
        for (const member of members) {
          const dest = join(scratch, member.name.replace(/[/\\]/g, "_"));
          await extractZipEntry(url, member, dest);
          try {
            const counts = await buildCitibikeEntry(connection, month, dest);
            total += counts.total; unusable += counts.unusable; outside += counts.outside;
          } finally { if (!args.keepRaw) rmSync(dest, { force: true }); }
        }
        await finishCitibikeMonth(connection, month);
        monthsBuilt.get("citibike").push(month);
        log(`    ${month}: ${members.length} CSV${members.length === 1 ? "" : "s"}, ${total.toLocaleString("en-US")} rides read (${unusable.toLocaleString("en-US")} unusable timestamps, ${outside.toLocaleString("en-US")} outside the month, both dropped)`);
      }
      for (const [name] of CITIBIKE_STAGING) await connection.run(`drop table if exists ${ident(name)}`);
      if (!args.keepRaw) rmSync(scratch, { recursive: true, force: true });
    }

    // What the window asked for against what it got, in the log and in the database. On an append the record is
    // about the file and not about the run, so this run's months are merged with the ones already recorded.
    const heldBySource = new Map([...monthsBuilt].map(([source, built]) =>
      [source, mergeMonths(monthsBuiltOf(previousMeta, source, existingMonths), built)]));
    for (const [source, built] of monthsBuilt) {
      const line = `  ${source}: ${built.length} of ${months.length} month${months.length === 1 ? "" : "s"} built`;
      log(previousMeta ? `${line} this run, ${heldBySource.get(source).length} in the file` : line);
    }
    if (skipped.length) {
      log(`  ${skipped.length} month${skipped.length === 1 ? "" : "s"} skipped:`);
      for (const s of skipped) log(`    ${s.source} ${s.month}: ${s.reason}`);
    }

    // A source the finished database holds no month of is an empty table, and an empty table quietly replacing
    // a good one is the worst outcome available here: the file is newer, smaller, and wrong. Refuse, and leave
    // what is already there. On an append the months the copy already carries count — they are still in it.
    const starved = [...heldBySource].filter(([, months]) => months.length === 0).map(([source]) => source);
    if (starved.length && existsSync(args.out)) {
      throw new Error(`every requested month of ${starved.join(", ")} was skipped, so this build carries no ` +
        `${starved.join("/")} data at all. ${args.out} already exists and is left exactly as it was; the new ` +
        `database has been discarded. Re-run when those months are published, or build to a different --out.`);
    }

    await insertRows(connection, "build_provenance", PROVENANCE_COLUMNS, provenance);
    // `months` is the authority on what the database holds; `from`/`to` are its outer bounds and, after an
    // append of two far-apart windows, are not a range every month between them is present for. A month no
    // per-month source served is not listed: it is not in here, and a later --append should retry it.
    const addedThisRun = requestedMonthly.length
      ? months.filter((month) => requestedMonthly.some((source) => monthsBuilt.get(source).includes(month)))
      : months;
    held = mergeMonths(existingMonths, addedThisRun);
    if (previousMeta) await connection.run("delete from build_meta");
    await insertRows(connection, "build_meta", ["key", "value"], [
      { key: "builder_version", value: BUILDER_VERSION },
      { key: "from", value: held[0] ?? args.from }, { key: "to", value: held[held.length - 1] ?? to },
      { key: "months", value: held.join(",") },
      { key: "to_source", value: args.to === null ? "probed" : "explicit" },
      { key: "sources", value: args.sources.join(",") },
      ...[...heldBySource].map(([source, built]) => ({ key: `months_built:${source}`, value: built.join(",") })),
      { key: "months_skipped", value: JSON.stringify(mergeSkips(previousMeta?.months_skipped, skipped, Object.fromEntries(heldBySource))) },
      { key: "sample_rate", value: String(args.sampleRate) },
      { key: "weather_coverage", value: weatherCoverage },
      { key: "built_at", value: new Date().toISOString() },
      { key: "duckdb_version", value: String((await oneOf(connection, "select version() as v")).v) },
    ]);
    await connection.run("checkpoint");
    complete = true;
  } finally {
    handle.close();
    // A half-built database is never left behind to be mistaken for a finished one.
    if (!complete) for (const partial of [temporary, `${temporary}.wal`]) rmSync(partial, { force: true });
  }

  // The old database is not removed first: rename replaces it in one step, so a reader either gets the previous
  // build or this one. Only the old write-ahead log — which belongs to the file being replaced — is removed.
  rmSync(`${args.out}.wal`, { force: true });
  renameSync(temporary, args.out);
  rmSync(`${temporary}.wal`, { force: true });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  log(`  wrote ${args.out} (${(statSync(args.out).size / 1e6).toFixed(1)} MB) in ${seconds}s — ${held.length} month${held.length === 1 ? "" : "s"}: ${held.join(",")}`);
  // A month asked for and not served is a shortfall against what was asked for, and the exit status says so —
  // on an append too, where the run is short but the request was just as explicit. A probed window ends where
  // the publisher ends, so a skip at its edge is not a shortfall. A month the file already held is not a skip.
  const incomplete = args.to !== null && skipped.length > 0;
  if (incomplete) log(`  the window was given explicitly and ${skipped.length} month${skipped.length === 1 ? " inside it was" : "s inside it were"} skipped: exit status 1`);
  return { out: args.out, months, window, held, to, seconds: Number(seconds), provenance, appended: !!previousMeta,
    monthsBuilt: Object.fromEntries(monthsBuilt), skipped, incomplete };
}

// ---------------------------------------------------------------------------------------------------------
async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) { process.stdout.write(USAGE); return; }
  if (args.verify) {
    const results = await verifyDatabase(args.out);
    process.stdout.write(`${args.out}\n`);
    process.stdout.write(`(read under the Instance's own limits: ${INSTANCE_LIMITS.memory_limit}, ${INSTANCE_LIMITS.threads} threads, ${INSTANCE_LIMITS.statement_timeout_ms} ms a statement)\n`);
    for (const r of results) {
      if (r.missing) { process.stdout.write(`  ${r.table.padEnd(20)} MISSING\n`); continue; }
      process.stdout.write(`  ${r.table.padEnd(20)} ${String(r.rows).padStart(12)} rows  ${r.content_hash.padStart(41)}  ${String(r.ms).padStart(5)}ms${r.volatile ? "  (volatile: records the fetch, not the data)" : ""}\n`);
    }
    return;
  }
  // A shortened build is not a successful one: the shortfall is in the log, in build_meta, and in the status.
  if ((await build(args)).incomplete) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => { console.error(`build-data: ${error.message}`); process.exitCode = 1; });
}
