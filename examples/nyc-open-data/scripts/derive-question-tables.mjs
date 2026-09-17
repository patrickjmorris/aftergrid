#!/usr/bin/env node
// Derives the bounded per-Question tables this Instance's Questions need, inside the Instance's own DuckDB
// file, from the tables `build-data.mjs` already wrote. This is the Operator's artifact, not the Engine's:
// aftergrid has no ingest command and is not asking for one (docs/contracts/adapters.md, "Large sources: the
// windowed Instance pattern").
//
// Why it exists. `aftergrid capture` copies whole tables, so the admission cap that bounds `execute` bounds
// `capture` too, and `trips_daily` at this window is 5,390,695 rows against a cap of 5,000,000 — refused, with
// nothing written. The answer the contract gives is not a narrower capture but a narrower *table*: build the
// table the Question actually needs, outside aftergrid, beside a provenance row, and capture that.
//
// What it writes. One table, `crz_daily`: one row per pickup date × service × `in_crz`, where `in_crz` is true
// when the trip's pickup zone **or** its dropoff zone is one of the 38 zones in `crz_zones` — the `crz_trip`
// definition's rule, evaluated here once instead of in every Analysis. `trips`, `fare_sum`, `tip_sum` and
// `distance_sum` are summed from `trips_daily` and keep its `DECIMAL(18,4)` types: decimal addition is exact
// and order-independent, so two derivations of the same `trips_daily` produce the same content hash, which a
// parallel `sum(DOUBLE)` would not (scripts/README.md, "Units").
//
// What it does not write. No `crz_share_daily`. A share is `crz / all` over whatever window the Analysis
// states, and `crz_daily` already carries both sides of it at the day grain — one `sum(trips) filter (where
// in_crz)` over `sum(trips)` in the analysis SQL. A stored daily share would be a third number to keep true,
// a DOUBLE in a file that otherwise sums in decimal, and a divide-by-zero policy fixed here rather than where
// the Claim is made.
//
// What it is not. It is not a window: `crz_daily` holds every date `trips_daily` holds. The analytical window
// still lives in the analysis SQL, which is what keeps an edge day a decision of the SQL rather than of how
// wide the derived table happened to be. It is a smaller *grain*, not a smaller period.
//
// Honesty about the Snapshot. A Finding that captures `crz_daily` retains the derived table, not the raw TLC
// files: a rerun reproduces the analysis over `crz_daily`. The `build_provenance` row this script writes says
// so — `fetch_mode` is `derived`, nothing was fetched, and `bytes`/`sha256` are NULL because no bytes were
// read over a network and no sha256 of any file exists to record. The content hash of the table is what
// identifies it, and `--verify` prints it.
//
// Idempotence. `crz_daily` is dropped and recreated, and the provenance row and `build_meta` key are replaced
// rather than appended, so a second run leaves exactly one of each. Everything happens in one transaction, so
// a failure leaves the database as it was. The derived table's content hash is identical across runs; the
// `build_provenance` and `build_meta` rows carry the derivation time and therefore move, which is why
// build-data.mjs marks those two tables volatile and never compares their hashes.
import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const DERIVER_VERSION = "derive-question-tables.mjs/1.0.0";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
/** The Instance reads `demo.duckdb` inside its own root; `analytics/aftergrid.yaml` names it. */
const DEFAULT_OUT = join(SCRIPT_DIR, "..", "analytics", "demo.duckdb");

/** The limits the Engine reads this file under (scripts/lib/sql-runner.mjs DEFAULT_LIMITS). `--verify` uses them. */
export const INSTANCE_LIMITS = Object.freeze({ memory_limit: "256MB", threads: 2 });
/** Deriving is not querying: one pass over 5.4M rows reducing to a few hundred groups gets more room. */
const DERIVE_LIMITS = Object.freeze({ memory_limit: "1GB", threads: "4" });

/** The tables this script reads. Missing ones are named rather than discovered mid-statement. */
export const SOURCE_TABLES = Object.freeze(["trips_daily", "crz_zones"]);
/** The tables this script needs in order to record what it did. */
export const PROVENANCE_TABLES = Object.freeze(["build_provenance", "build_meta"]);

export const DERIVED_TABLE = "crz_daily";
export const DERIVED_SOURCE = `derived:${DERIVED_TABLE}`;
/** Column order the content hash is taken over — the create order below. */
export const CRZ_DAILY_COLUMNS = Object.freeze(["pickup_date", "service", "in_crz", "trips", "fare_sum", "tip_sum", "distance_sum"]);
/** Same money/distance type as trips_daily: exact, order-independent addition. */
export const MONEY = "DECIMAL(18,4)";

export const CRZ_DAILY_SCHEMA = `create table ${DERIVED_TABLE} (
  pickup_date DATE not null, service VARCHAR not null, in_crz BOOLEAN not null,
  trips BIGINT not null, fare_sum ${MONEY}, tip_sum ${MONEY}, distance_sum ${MONEY}
)`;

// ---------------------------------------------------------------------------------------------------------
// SQL helpers — deliberately a local copy
// ---------------------------------------------------------------------------------------------------------
// The hash rule below is the same rule build-data.mjs `--verify` prints, reimplemented here rather than
// imported: two scripts agreeing because they share a line is weaker evidence than two scripts agreeing
// because they compute the same thing, and this one must be able to check a database the other one wrote.
export const sqlString = (s) => "'" + String(s).replace(/'/g, "''") + "'";
export const ident = (name) => '"' + String(name).replace(/"/g, '""') + '"';
/** 'YYYY-MM-DD HH:MM:SS' in UTC — what a DuckDB TIMESTAMP literal takes. */
export const utcStamp = (date = new Date()) => date.toISOString().slice(0, 19).replace("T", " ");

/** A row rendered as one string. NULL renders as a character no VARCHAR cast produces, so it never collides. */
export function canonicalExpr(columns) {
  return columns.map((c) => `coalesce(${ident(c)}::VARCHAR, '\\N')`).join(" || '|' || ");
}

/** Order-independent content hash of a table: rows, plus the sum of each row's md5 taken as a 64-bit number. */
export function tableHashSql(table, columns) {
  return `select count(*)::BIGINT as rows, coalesce(sum(md5_number_lower(${canonicalExpr(columns)})::HUGEINT), 0)::VARCHAR as content_hash from ${ident(table)}`;
}

/**
 * The derivation itself. `in_crz` is the `crz_trip` rule: pickup zone or dropoff zone in `crz_zones`. A NULL
 * zone id (the TLC publishes them, and 264/265 mean "unknown") makes `in (…)` NULL, so each side is coalesced
 * to false before the `or` — an unknown end is not in the zone, and the row stays in the table either way.
 */
export const CRZ_DAILY_INSERT = `insert into ${DERIVED_TABLE}
with crz as (select location_id from crz_zones),
flagged as (
  select t.pickup_date, t.service,
         coalesce(t.pu_location_id in (select location_id from crz), false)
           or coalesce(t.do_location_id in (select location_id from crz), false) as in_crz,
         t.trips, t.fare_sum, t.tip_sum, t.distance_sum
  from trips_daily t
)
select pickup_date, service, in_crz,
       sum(trips)::BIGINT as trips,
       sum(fare_sum)::${MONEY} as fare_sum,
       sum(tip_sum)::${MONEY} as tip_sum,
       sum(distance_sum)::${MONEY} as distance_sum
from flagged
group by 1, 2, 3
order by 1, 2, 3`;

// ---------------------------------------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------------------------------------
export function parseArgs(argv) {
  const args = { out: DEFAULT_OUT, verify: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out") {
      const v = argv[++i];
      if (v === undefined) throw new Error("--out needs a value");
      args.out = v;
    } else if (arg === "--verify") args.verify = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  return args;
}

const USAGE = `Usage: node examples/nyc-open-data/scripts/derive-question-tables.mjs [options]

Derives ${DERIVED_TABLE} from trips_daily and crz_zones inside an existing demo.duckdb, and records the
derivation in build_provenance and build_meta. Idempotent: rerunning replaces the table and those two rows.

  --out PATH   the Instance database to derive into (default examples/nyc-open-data/analytics/demo.duckdb)
  --verify     do not derive: print every table's row count and content hash from --out and exit
`;

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

/** Table names in `main`, sorted. */
export async function tablesOf(connection) {
  return (await rowsOf(connection, "select table_name from information_schema.tables where table_schema='main' order by table_name")).map((r) => r.table_name);
}

/** A table's columns in declaration order — the order its content hash is taken over. */
export async function columnsOf(connection, table) {
  const rows = await rowsOf(connection, `select column_name from information_schema.columns where table_schema='main' and table_name=${sqlString(table)} order by ordinal_position`);
  return rows.map((r) => r.column_name);
}

/** Row count and content hash of one table, read with the column order the catalog reports. */
export async function hashTable(connection, table, columns = null) {
  const cols = columns ?? (await columnsOf(connection, table));
  if (!cols.length) throw new Error(`no such table ${table}`);
  const row = await oneOf(connection, tableHashSql(table, cols));
  return { table, rows: Number(row.rows), content_hash: String(row.content_hash) };
}

/** Every table's row count and content hash, keyed by table name. */
export async function hashAllTables(connection) {
  const out = {};
  for (const table of await tablesOf(connection)) out[table] = await hashTable(connection, table);
  return out;
}

/**
 * The `build_provenance` row for a derived table. Nothing was fetched, so the columns that describe a fetch
 * are NULL — except `url`, which the built schema declares NOT NULL: rather than leave it blank or fill it
 * with a URL that was never requested, it names what was read, the database and the two tables. `bytes` and
 * `sha256` stay NULL because there are no bytes and no file: `sha256` is the hash of a fetched file's bytes
 * everywhere else in this table, and putting a row hash there would make the column mean two things. The
 * derived table's content hash is printed by `--verify` instead.
 */
export function derivedProvenanceRow({ database, period = null, fetchedAt }) {
  return {
    source: DERIVED_SOURCE,
    url: `${basename(database)}#${SOURCE_TABLES.join(",")}`,
    period,
    bytes: null,
    sha256: null,
    fetch_mode: "derived",
    http_etag: null,
    http_last_modified: null,
    fetched_at: fetchedAt,
    builder_version: DERIVER_VERSION,
  };
}

const literal = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : sqlString(v));

/**
 * Derive `crz_daily` into an open, writable connection, and record it. One transaction: a failure leaves the
 * database as it was. Returns what was written, so a caller can print it without reopening anything.
 */
export async function deriveQuestionTables(connection, { database = ":memory:", now = new Date() } = {}) {
  const present = new Set(await tablesOf(connection));
  const missing = [...SOURCE_TABLES, ...PROVENANCE_TABLES].filter((t) => !present.has(t));
  if (missing.length) {
    throw new Error(`${database} has no ${missing.join(", ")}: this derives from a database built by build-data.mjs, and does not build one`);
  }

  const fetchedAt = utcStamp(now);
  const iso = now.toISOString();
  // `period` is inherited, not invented: the months the source database says it holds. A database written
  // before `build_meta.months` existed leaves it NULL rather than guessing from the data.
  const metaMonths = await oneOf(connection, "select value from build_meta where key='months'");
  const period = metaMonths?.value ? String(metaMonths.value) : null;
  const provenance = derivedProvenanceRow({ database, period, fetchedAt });

  await connection.run("begin transaction");
  try {
    await connection.run(`drop table if exists ${ident(DERIVED_TABLE)}`);
    await connection.run(CRZ_DAILY_SCHEMA);
    await connection.run(CRZ_DAILY_INSERT);
    await connection.run(`delete from build_provenance where source = ${sqlString(DERIVED_SOURCE)}`);
    const columns = Object.keys(provenance);
    await connection.run(
      `insert into build_provenance (${columns.map(ident).join(",")}) values (${columns.map((c) => literal(provenance[c])).join(",")})`,
    );
    await connection.run(`delete from build_meta where key = ${sqlString(DERIVED_SOURCE)}`);
    await connection.run(`insert into build_meta (key, value) values (${sqlString(DERIVED_SOURCE)}, ${sqlString(iso)})`);
    await connection.run("commit");
  } catch (e) {
    await connection.run("rollback");
    throw e;
  }

  const hashed = await hashTable(connection, DERIVED_TABLE, [...CRZ_DAILY_COLUMNS]);
  return { ...hashed, derived_at: iso, provenance };
}

/** Open `path` read-write, derive, and return the summary. */
export async function deriveIntoDatabase(path, { now = new Date() } = {}) {
  if (!existsSync(path)) throw new Error(`no database at ${path}: run build-data.mjs first, this script derives from one`);
  const handle = await openDuckDb(path, DERIVE_LIMITS);
  try {
    return await deriveQuestionTables(handle.connection, { database: path, now });
  } finally { handle.close(); }
}

/**
 * Every table's row count and content hash, read READ_ONLY under the Instance's own limits — so "an Instance
 * can query this" is checked rather than assumed. `build_meta` and `build_provenance` record the build and the
 * derivation rather than the data; their hashes move every run and are marked volatile, never compared.
 */
export async function verifyDatabase(path) {
  if (!existsSync(path)) throw new Error(`no database at ${path}`);
  const handle = await openDuckDb(path, {
    access_mode: "READ_ONLY", memory_limit: INSTANCE_LIMITS.memory_limit, threads: String(INSTANCE_LIMITS.threads),
  });
  try {
    const out = [];
    for (const table of await tablesOf(handle.connection)) {
      const started = Date.now();
      const hashed = await hashTable(handle.connection, table);
      out.push({ ...hashed, volatile: PROVENANCE_TABLES.includes(table), derived: table === DERIVED_TABLE, ms: Date.now() - started });
    }
    return out;
  } finally { handle.close(); }
}

// ---------------------------------------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------------------------------------
const log = (line = "") => process.stdout.write(`${line}\n`);

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) { process.stdout.write(USAGE); return; }

  if (args.verify) {
    log(`(read under the Instance's own limits: ${INSTANCE_LIMITS.memory_limit}, ${INSTANCE_LIMITS.threads} threads)`);
    for (const r of await verifyDatabase(args.out)) {
      const note = r.derived ? "  (derived by this script)" : r.volatile ? "  (volatile: records the build, not the data)" : "";
      log(`  ${r.table.padEnd(20)} ${String(r.rows).padStart(12)} rows  ${r.content_hash.padStart(41)}  ${String(r.ms).padStart(5)}ms${note}`);
    }
    return;
  }

  const started = Date.now();
  const result = await deriveIntoDatabase(args.out);
  log(`${DERIVED_TABLE}: ${result.rows} rows  content hash ${result.content_hash}  ${Date.now() - started}ms`);
  log(`build_provenance: ${result.provenance.source}  fetch_mode ${result.provenance.fetch_mode}  period ${result.provenance.period ?? "NULL"}  fetched_at ${result.provenance.fetched_at}`);
  log(`build_meta: ${DERIVED_SOURCE} = ${result.derived_at}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { process.stderr.write(`${e?.stack ?? e}\n`); process.exitCode = 1; });
}
