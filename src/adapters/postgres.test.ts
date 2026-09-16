// Seam-2 contract tests, Postgres. Same behaviours as src/adapters/duckdb.test.ts, on a disposable instance the
// test provisions itself with initdb/pg_ctl. Without those binaries every server-backed test is SKIPPED with the
// reason printed; nothing here is faked, and the capability matrix in docs/contracts/adapters.md cites this file.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgresAdapter, bindNamed, findBinary, guard, openRetained, provisionDisposablePostgres, type DisposablePostgres } from "./postgres.ts";
import { AdapterError } from "./contract.ts";
import { serializeResult } from "./serialize.ts";

const SKIP = findBinary("initdb") && findBinary("pg_ctl")
  ? false
  : "no local Postgres runtime: initdb/pg_ctl were not found on PATH or AFTERGRID_PG_BINDIR, so the Postgres contract is not exercised here";

const WAREHOUSE = fileURLToPath(new URL("../../fixtures/instance/data/", import.meta.url));
const scratch = (p: string) => mkdtempSync(join(tmpdir(), p));

async function pgClient(url: string): Promise<any> {
  const m: any = await import("pg");
  const { Client } = m.default ?? m;
  const c = new Client({ connectionString: url });
  await c.connect();
  return c;
}

type Source = { instance: DisposablePostgres; reader: string; writer: string };
let source: Source | undefined;

/** One disposable source Postgres for the whole file: the fixture warehouse, a writable role and a read-only role. */
async function warehouse(): Promise<Source> {
  if (source) return source;
  const instance = await provisionDisposablePostgres();
  const admin = await pgClient(instance.url("postgres"));
  try { await admin.query("CREATE DATABASE warehouse"); } finally { await admin.end(); }
  const c = await pgClient(instance.url("warehouse"));
  try {
    await c.query("create table users (user_id text not null, signed_up_at timestamptz not null, platform text, onboarding_variant text, country text)");
    await c.query("create table subscriptions (subscription_id text not null, user_id text not null, started_at timestamptz not null, canceled_at timestamptz, plan_price_cents integer not null)");
    await c.query("create table platforms (platform text not null, label text not null)");
    // Lossless CSV round-trip fixture: null, empty string, comma, quotes, CR/LF.
    await c.query("create table roundtrip (id integer not null, value text, amount numeric, at timestamptz not null)");
    for (const t of ["users", "subscriptions", "platforms"]) {
      await c.query(`COPY ${t} FROM '${join(WAREHOUSE, t + ".csv")}' WITH (FORMAT csv, HEADER, NULL '')`);
    }
    await c.query(`insert into roundtrip values
      (1, null, 1.50, '2026-01-02T03:04:05Z'), (2, '', 0.001, '2026-01-02T03:04:05Z'), (3, 'a,b', -2, '2026-01-02T03:04:05Z'),
      (4, 'say "hi"', 3e-7, '2026-01-02T03:04:05Z'), (5, E'line\\r\\nbreak', 7, '2026-01-02T03:04:05Z')`);
    // PUBLIC keeps CREATE on schema public and CONNECT/TEMP on the database in Postgres 14; take both away first.
    await c.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    await c.query("REVOKE ALL ON DATABASE warehouse FROM PUBLIC");
    for (const role of ["wh_writer", "wh_reader"]) {
      await c.query(`CREATE ROLE ${role} LOGIN`);
      await c.query(`GRANT CONNECT ON DATABASE warehouse TO ${role}`);
      await c.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    }
    await c.query("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO wh_writer");
    await c.query("GRANT SELECT ON ALL TABLES IN SCHEMA public TO wh_reader");
    await c.query("ANALYZE"); // without statistics the planner estimates from page counts, which admission would read as noise
  } finally { await c.end(); }
  source = { instance, reader: instance.url("warehouse", "wh_reader"), writer: instance.url("warehouse", "wh_writer") };
  process.env.AG_TEST_PG_READER = source.reader;
  process.env.AG_TEST_PG_WRITER = source.writer;
  return source;
}

// Everything this file opens is closed at the end, including whatever a failing assertion left behind, so that a
// failure is reported as a failure instead of a hung run holding a connection open.
const opened: { close(): unknown }[] = [];
const track = <T extends { close(): unknown }>(x: T): T => { opened.push(x); return x; };
after(async () => {
  for (const o of opened) { try { await o.close(); } catch { /* already gone */ } }
  source?.instance.stop();
});

const reader = (extra = {}) => track(new PostgresAdapter({ connection_string_env: "AG_TEST_PG_READER", ...extra }));

// ---------------------------------------------------------------------------------------------------------------
// The statement guard is pure and runs everywhere, with or without a server.
// ---------------------------------------------------------------------------------------------------------------

test("statement guard: one SELECT only, comments and literals are not statements, $name maps to $1..$n", () => {
  assert.equal(guard("select 1 as one").statements, 1);
  assert.equal(guard("with x as (select 1 as n) select n from x").firstWord, "with");
  assert.equal(guard("select 1;").statements, 1, "a trailing semicolon is still one statement");
  assert.equal(guard("select 1 -- ; select 2\n").statements, 1, "a line comment is not a statement break");
  assert.equal(guard("select /* ; */ 1").statements, 1);
  assert.equal(guard("select ';drop table t' as s").statements, 1, "a semicolon inside a literal is not a break");
  assert.equal(guard("select $$a;b$$ as s").statements, 1, "dollar quoting is understood");
  for (const sql of ["select 1; select 2", "insert into users select * from users", "delete from users",
    "create table t as select 1", "drop table users", "update users set country = 'x'", "truncate users",
    "copy (select 1) to '/tmp/x.csv'", "select * into t from users", "explain select 1",
    "select pg_read_file('/etc/passwd')", "select dblink('', 'select 1')", "select set_config('x','y',false)",
    "select query_to_xml('select 1', false, false, '')", "select 1 as e'x'", "", "   "]) {
    assert.throws(() => guard(sql), (e: any) => e instanceof AdapterError && ["sql_policy", "sql_parameter"].includes(e.category), JSON.stringify(sql));
  }
  assert.throws(() => guard("select $1 as x"), (e: any) => e.category === "sql_parameter");
  const sql = "select * from users where country = $country and platform = $platform and country <> $country";
  const bound = bindNamed(sql, guard(sql), { country: "US", platform: "ios", unused: 1 });
  assert.equal(bound.text, "select * from users where country = $1 and platform = $2 and country <> $1");
  assert.deepEqual(bound.values, ["US", "ios"], "only parameters the statement declares are bound");
  assert.throws(() => bindNamed("select $who as x", guard("select $who as x"), {}), (e: any) => e.category === "sql_parameter" && /\$who/.test(e.message));
});

test("an adapter never accepts a literal connection string, only the name of an environment variable", () => {
  assert.throws(() => new PostgresAdapter({ connection_string_env: "postgresql://user:secret@host/db" }), (e: any) => e.category === "missing_credential");
  const a = new PostgresAdapter({ connection_string_env: "AG_TEST_PG_ABSENT" });
  return assert.rejects(a.execute("select 1", {}), (e: any) => e.category === "missing_credential" && /AG_TEST_PG_ABSENT/.test(e.message) && !/postgresql:/.test(e.message));
});

// ---------------------------------------------------------------------------------------------------------------
// Server-backed contract
// ---------------------------------------------------------------------------------------------------------------

test("capability matrix is honest: privilege probe supported, limits partial, open_retained needs a local runtime", { skip: SKIP }, async () => {
  await warehouse();
  const a = reader();
  const caps = a.capabilities();
  assert.equal(caps.privilege_probe.status, "supported");
  assert.equal(caps.resource_limits.status, "partial");
  assert.match(caps.resource_limits.note, /work_mem is per-operation tuning/);
  assert.equal(caps.open_retained.status, "partial");
  assert.match(caps.open_retained.note, /never falls back to the live source/);
  const cat = await a.catalog();
  assert.ok(cat.some((t) => t.name === "users" && t.columns.some((c) => c.name === "user_id" && c.sql_type === "text")), JSON.stringify(cat));
  assert.ok(cat.some((t) => t.name === "subscriptions" && t.columns.some((c) => c.name === "started_at" && c.sql_type === "timestamp with time zone")));
  await a.close();
});

test("privilege probe reports effective privileges: the writable role can write, the read-only role cannot", { skip: SKIP }, async () => {
  await warehouse();
  const ro = reader();
  const rw = track(new PostgresAdapter({ connection_string_env: "AG_TEST_PG_WRITER" }));
  const p1 = await ro.probePrivileges();
  const p2 = await rw.probePrivileges();
  assert.equal(p1.status, "supported");
  if (p1.status === "supported") {
    assert.equal(p1.can_write, false);
    assert.equal(p1.can_ddl, false);
    assert.match(p1.detail, /role wh_reader/);
    assert.match(p1.detail, /default_transaction_read_only=on/);
  }
  if (p2.status === "supported") { assert.equal(p2.can_write, true); assert.equal(p2.can_ddl, false, "a writable role without CREATE is not a DDL role"); }
  await ro.close(); await rw.close();
});

test("execute returns typed JSON-safe cells; decimals as strings, timestamps in UTC, null distinct from zero", { skip: SKIP }, async () => {
  await warehouse();
  const a = reader();
  const r = await a.execute("select 1.5::numeric(10,4) as d, 3::bigint as i, date '2026-01-02' as day, timestamptz '2026-01-02 03:04:05+00' as ts, null::text as t, true as b, count(*) as n from users", {});
  assert.equal(r.rows[0]!.d, "1.5000");
  assert.equal(r.rows[0]!.i, 3, "integers arrive as numbers when they are safe integers");
  assert.equal(r.rows[0]!.day, "2026-01-02");
  assert.equal(r.rows[0]!.ts, "2026-01-02 03:04:05+00");
  assert.equal(r.rows[0]!.t, null);
  assert.equal(r.rows[0]!.b, true);
  assert.equal(r.columns.find((c) => c.name === "d")!.sql_type, "numeric");
  const declared = { result_id: "x", execution_id: "e", row_key: "i", columns: [{ name: "d", type: "decimal" as const }, { name: "i", type: "integer" as const }, { name: "day", type: "date" as const }, { name: "ts", type: "timestamp" as const }, { name: "t", type: "text" as const, nullable: true }, { name: "b", type: "boolean" as const }, { name: "n", type: "integer" as const }] };
  const ser = serializeResult(r, declared);
  assert.equal(ser.object.rows[0]!.i, 3);
  assert.equal(ser.object.rows[0]!.d, "1.5000");
  assert.equal(ser.object.rows[0]!.t, null);
  assert.throws(() => serializeResult(r, { ...declared, columns: [{ name: "d", type: "integer" }] }), (e: any) => e.category === "result_shape");
  // A UTC session renders every instant the same way, whatever the client's zone.
  const tz = await a.execute("select timestamptz '2026-01-02 03:04:05-05' as ts, timestamptz '2026-07-01 12:00:00.5+00' as frac", {});
  assert.equal(tz.rows[0]!.ts, "2026-01-02 08:04:05+00");
  assert.equal(tz.rows[0]!.frac, "2026-07-01 12:00:00.5+00");
  assert.equal(r.admission.decision, "admitted");
  await a.close();
});

test("statement guard rejects DDL, DML, multiple statements and undeclared parameters; the source stays unchanged", { skip: SKIP }, async () => {
  const src = await warehouse();
  const a = reader();
  const before = (await a.execute("select count(*) as n from users", {})).rows[0]!.n;
  for (const sql of ["create table t as select 1", "insert into users select * from users", "delete from users",
    "select 1; select 2", "copy (select 1) to '/tmp/x.csv'", "select * into t from users",
    "select pg_read_file('/etc/passwd')", "vacuum users", "grant select on users to wh_reader"]) {
    await assert.rejects(a.execute(sql, {}), (e: any) => e instanceof AdapterError && ["sql_policy", "sql_error", "admission"].includes(e.category), sql);
  }
  await assert.rejects(a.execute("select * from users where user_id = $who", {}), (e: any) => e.category === "sql_parameter");
  assert.equal((await a.execute("select count(*) as n from users", {})).rows[0]!.n, before);
  // The server is the boundary, not the guard: the extended protocol refuses multiple commands even unguarded.
  const bypass = await pgClient(src.reader);
  try {
    await assert.rejects(bypass.query({ text: "select 1; select 2", values: [], queryMode: "extended" }), (e: any) => /cannot insert multiple commands/i.test(e.message));
  } finally { await bypass.end(); }
  await a.close();
});

test("the read-only role refuses writes at the server even when the guard is bypassed", { skip: SKIP }, async () => {
  const src = await warehouse();
  const ro = await pgClient(src.reader);
  try {
    await assert.rejects(ro.query("insert into users values ('u_x', now(), 'ios', null, 'US')"), (e: any) => e.code === "42501", "the role holds no INSERT privilege");
    await assert.rejects(ro.query("create table t (x int)"), (e: any) => e.code === "42501");
  } finally { await ro.end(); }
  // And the session setting the adapter applies stops writes even for a role that holds the privilege.
  const rw = await pgClient(src.writer);
  try {
    await rw.query("SET default_transaction_read_only = on");
    await assert.rejects(rw.query("insert into users values ('u_x', now(), 'ios', null, 'US')"), (e: any) => e.code === "25006");
  } finally { await rw.end(); }
});

test("admission: an over-cap scan is rejected even with LIMIT 1, under-cap is admitted, unknown is recorded honestly", { skip: SKIP }, async () => {
  await warehouse();
  const a = reader({ estimate_cap_rows: 100 });
  const est = await a.estimate("select count(*) from (select * from generate_series(1,1000000) x limit 1) t", {});
  assert.equal(est.status, "estimated");
  if (est.status === "estimated") {
    assert.equal(est.unit, "planner_cost");
    assert.ok(est.scan_rows >= 1_000_000, JSON.stringify(est));
    assert.equal(est.rows, 1, "the plan's output row count is separate from the planned scan");
    assert.ok(typeof est.cost === "number");
  }
  await assert.rejects(a.execute("select count(*) from (select * from generate_series(1,1000000) x limit 1) t", {}), (e: any) => e.category === "admission" && /exceeds the cap/.test(e.message));
  await assert.rejects(a.execute("select user_id from users limit 1", {}), (e: any) => e.category === "admission", "a row LIMIT never bounds admission on a real table");
  const small = await a.execute("select count(*) as n from platforms", {});
  assert.equal(small.admission.decision, "admitted");
  if (small.admission.decision === "admitted") assert.equal(small.admission.basis, "estimate_under_cap");
  // Unknown is a state, never a zero: a statement the planner refuses reports why.
  const unknown = await a.estimate("select * from does_not_exist", {});
  assert.equal(unknown.status, "unknown");
  if (unknown.status === "unknown") assert.match(unknown.reason, /does_not_exist/);
  await a.close();
});

test("cancellation: a runaway statement is stopped by the timeout and the session stays usable", { skip: SKIP }, async () => {
  await warehouse();
  const a = reader({ estimate_cap_rows: 1e15 });
  const t0 = Date.now();
  await assert.rejects(a.execute("select count(*) from generate_series(1,2000000000)", {}, { timeout_ms: 300 }), (e: any) => e.category === "cancelled" && /statement_timeout/.test(e.message));
  assert.ok(Date.now() - t0 < 15000, "cancelled well inside the test budget");
  const ok = await a.execute("select 1 as one", {});
  assert.equal(ok.rows[0]!.one, 1);
  await a.close();
});

test("capture is deterministic; a rerun on retained inputs is unchanged after the source is mutated; missing or corrupt inputs are explicit errors", { skip: SKIP }, async () => {
  const src = await warehouse();
  const a = reader();
  const dest = scratch("ag-pgcap-");
  const inputs = await a.capture(["subscriptions"], dest);
  const again = await a.capture(["subscriptions"], scratch("ag-pgcap2-"));
  assert.equal(inputs[0]!.content_hash.value, again[0]!.content_hash.value, "capture is deterministic");
  assert.equal(inputs[0]!.source.consistency, "single_transaction");
  assert.equal(inputs[0]!.source.adapter, "postgres");
  assert.match(inputs[0]!.source.method, /REPEATABLE READ READ ONLY/);
  assert.match(inputs[0]!.description, /postgres 1[0-9]/, "the server version is recorded");
  assert.match(inputs[0]!.description, /plan_price_cents int4 not null/, "the schema requirements are recorded");
  assert.equal(inputs[0]!.runtime!.columns.find((c) => c.name === "canceled_at")!.sql_type, "timestamptz");
  await assert.rejects(a.capture(["not_a_table"], scratch("ag-pgcap3-")), (e: any) => e.category === "unresolved_reference");

  const sql = "select count(*) as n from subscriptions where canceled_at is not null";
  const live = await a.execute(sql, {});
  await a.close();

  const rw = await pgClient(src.writer);
  try { await rw.query("insert into subscriptions values ('s_zz','u_zz', now(), now(), 999)"); } finally { await rw.end(); }
  const b = reader();
  const mutated = await b.execute(sql, {});
  await b.close();
  assert.notEqual(mutated.rows[0]!.n, live.rows[0]!.n, "the live source changed after capture");

  const session = track(await openRetained(dest, inputs));
  const rerun = await session.execute(sql, {});
  assert.equal(rerun.rows[0]!.n, live.rows[0]!.n, "the retained rerun reproduces the captured answer");
  assert.equal(rerun.admission.decision, "admitted");
  if (rerun.admission.decision === "admitted") {
    assert.equal(rerun.admission.basis, "unknown_estimate_with_enforced_limits");
    assert.ok(rerun.admission.limits.statement_timeout_ms > 0, "the fallback names the limits that admitted it");
  }
  await assert.rejects(session.execute("select count(*) from users", {}), (e: any) => e.category === "sql_error", "undeclared tables are not visible");
  await assert.rejects(session.execute("insert into subscriptions values ('s_yy','u_yy', now(), null, 1)", {}), (e: any) => e.category === "sql_policy");
  await session.close();

  writeFileSync(join(dest, inputs[0]!.path), "subscription_id\n");
  await assert.rejects(openRetained(dest, inputs), (e: any) => e.category === "hash_mismatch");
  rmSync(join(dest, inputs[0]!.path));
  await assert.rejects(openRetained(dest, inputs), (e: any) => e.category === "missing_file" && /will not read a live source/.test(e.message));
});

test("capture round-trips null, empty string, quotes, commas, CR/LF, decimals and timestamps losslessly", { skip: SKIP }, async () => {
  await warehouse();
  const a = reader();
  const dest = scratch("ag-pgrt-");
  const [inp] = await a.capture(["roundtrip"], dest);
  const text = readFileSync(join(dest, inp!.path), "utf8");
  assert.ok(text.startsWith("id,value,amount,at\n1,,1.50,") && text.includes('\n2,"",0.001,'), text);
  await a.close();
  const s = track(await openRetained(dest, [inp!]));
  const r = await s.execute("select id, value is null as is_null, value = '' as is_empty, value from roundtrip order by id", {});
  assert.deepEqual(r.rows.map((x) => [x.id, x.is_null, x.is_empty]), [[1, true, null], [2, false, true], [3, false, false], [4, false, false], [5, false, false]]);
  assert.equal(r.rows[2]!.value, "a,b");
  assert.equal(r.rows[3]!.value, 'say "hi"');
  assert.equal(r.rows[4]!.value, "line\r\nbreak");
  const amounts = await s.execute("select amount from roundtrip order by id", {});
  assert.deepEqual(amounts.rows.map((x) => x.amount), ["1.50", "0.001", "-2", "0.0000003", "7"], "numeric text, including trailing zeros, survives the round trip exactly");
  await s.close();
});

test("without a local Postgres runtime, rerun is refused with a reason and never falls back to the live source", { skip: SKIP }, async () => {
  await warehouse();
  const a = reader();
  const dest = scratch("ag-pgna-");
  const inputs = await a.capture(["platforms"], dest);
  await a.close();
  const emptyDir = scratch("ag-nobin-");
  const path = process.env.PATH;
  const bindir = process.env.AFTERGRID_PG_BINDIR;
  process.env.PATH = emptyDir;
  delete process.env.AFTERGRID_PG_BINDIR;
  try {
    await assert.rejects(openRetained(dest, inputs), (e: any) =>
      e.category === "runtime_unavailable" && /initdb/.test(e.message) && /artifact replay remains possible/.test(e.message) && /mode artifact/.test(e.message));
  } finally {
    process.env.PATH = path;
    if (bindir) process.env.AFTERGRID_PG_BINDIR = bindir;
  }
  // An extract captured by an adapter that records no column types is restored as all text, and says so.
  const untyped = inputs.map(({ runtime, ...rest }) => rest);
  const s = track(await openRetained(dest, untyped));
  const r = await s.execute("select platform, label from platforms order by 1", {});
  assert.equal(r.columns[0]!.sql_type, "text");
  assert.ok(r.rows.length >= 3);
  if (r.admission.decision === "admitted" && r.admission.estimate.status === "unknown") {
    assert.match(r.admission.estimate.reason, /all-text columns because no column types were recorded: platforms/);
  } else assert.fail("a retained rerun records the fallback that admitted it");
  await s.close();
});
