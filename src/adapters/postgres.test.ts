// Seam-2 contract tests, Postgres. Same behaviours as src/adapters/duckdb.test.ts, on a disposable instance the
// test provisions itself with initdb/pg_ctl. Without those binaries every server-backed test is SKIPPED with the
// reason printed; nothing here is faked, and the capability matrix in docs/contracts/adapters.md cites this file.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgresAdapter, bindNamed, findBinary, guard, openRetained, provisionDisposablePostgres, workMem, type DisposablePostgres } from "./postgres.ts";
import { openRetained as openRetainedDuckdb } from "./duckdb.ts";
import { retainedOpenerFor } from "../commands/check.ts";
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

/** Engine-side setup for a test's own fixtures, as the instance superuser. */
async function onSource(url: string, ...statements: string[]) {
  const c = await pgClient(url);
  try { for (const s of statements) await c.query(s); } finally { await c.end(); }
}

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

test("quoting an identifier does not exempt a denied function from the guard", () => {
  // Postgres resolves "pg_read_file" and pg_read_file to the same function, so a guard that only saw bare words
  // admitted the quoted form — a server-side file read, and a query-running function that walks straight past the
  // admission cap because EXPLAIN only ever plans the call.
  for (const sql of [`select "pg_read_file"('/etc/hosts')`, `select "dblink"('', 'select 1')`,
    `select "query_to_xml"('select count(*) from users', false, false, '')::text as x`,
    `select "pg_sleep"(10)`, `select "pg_catalog"."pg_read_file"('/etc/hosts')`,
    `select "PG_READ_FILE"('/etc/hosts')`, `select "lo_import"('/etc/hosts')`]) {
    assert.throws(() => guard(sql), (e: any) => e instanceof AdapterError && e.category === "sql_policy", sql);
  }
  // Double quoting stays the documented escape hatch for a column named after a *keyword*.
  assert.equal(guard(`select "end", "into" from t`).statements, 1);
  assert.deepEqual(guard(`select "a""b" from t`).quoted, ['a"b'], "a quoted identifier is unescaped before it is checked");
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
  assert.match(caps.resource_limits.note, /work_mem, which is per-operation tuning, not a total memory cap/);
  assert.match(caps.resource_limits.note, /refused rather than dropped/);
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
  // The cap cannot be walked past by running the scan inside a query-running function, quoted or bare: EXPLAIN
  // plans the function call, not the SQL string it runs, so the guard has to refuse it outright.
  for (const sql of [`select query_to_xml('select count(*) from users', false, false, '')::text as x`,
    `select "query_to_xml"('select count(*) from users', false, false, '')::text as x`]) {
    await assert.rejects(a.execute(sql, {}), (e: any) => e.category === "sql_policy" && /reaches outside the query/.test(e.message), sql);
  }
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
  // The 2e9-row scan would take minutes if it ran to completion; the budget only has to prove the statement was
  // cut short. GitHub-hosted runners have shown ~16 s here where Docker Postgres 16 on the same query takes <1 s.
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 60000, `cancelled within the test budget (took ${elapsed} ms; a full scan takes minutes)`);
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

// ---------------------------------------------------------------------------------------------------------------
// Findings from the 2026-09-15 adapter review
// ---------------------------------------------------------------------------------------------------------------

test("a dropped connection is an adapter error, and a provisioned instance is stopped even if the process never closes it", { skip: SKIP }, async () => {
  const before = process.listenerCount("exit");
  const inst = await provisionDisposablePostgres();
  assert.equal(process.listenerCount("exit"), before + 1, "provisioning registers an exit hook so a crash leaves no postmaster behind");
  process.env.AG_TEST_PG_DROP = inst.url("postgres");
  const a = track(new PostgresAdapter({ connection_string_env: "AG_TEST_PG_DROP" }));
  assert.equal((await a.execute("select 1 as x", {})).rows[0]!.x, 1);
  // The server goes away under an idle connection. Without an 'error' listener on the Client this is an unhandled
  // 'error' event, which kills the whole process instead of producing an AdapterError.
  inst.stop();
  await new Promise((r) => setTimeout(r, 750));
  await assert.rejects(a.execute("select 1 as x", {}), (e: any) => e instanceof AdapterError && e.category === "runtime_unavailable", "a lost connection is a runtime state, not a sql_error");
  await a.close();
  assert.equal(process.listenerCount("exit"), before, "stop() removes the hook it installed");
  delete process.env.AG_TEST_PG_DROP;
});

test("privilege probe: a role that can write the source through a view is not reported as unable to write", { skip: SKIP }, async () => {
  const src = await warehouse();
  await onSource(src.instance.url("warehouse"),
    "create table probe_base (id int not null, v text)",
    "create view probe_view as select * from probe_base",
    "create role wh_viewer login",
    "grant connect on database warehouse to wh_viewer",
    "grant usage on schema public to wh_viewer",
    "grant select on probe_base to wh_viewer",
    "grant select, insert, update, delete on probe_view to wh_viewer");
  process.env.AG_TEST_PG_VIEWER = src.instance.url("warehouse", "wh_viewer");
  const a = track(new PostgresAdapter({ connection_string_env: "AG_TEST_PG_VIEWER" }));
  const p = await a.probePrivileges();
  assert.equal(p.status, "supported");
  if (p.status === "supported") {
    assert.equal(p.can_write, true, JSON.stringify(p));
    assert.match(p.detail, /views or materialised views/);
  }
  await a.close();
  // The probe's answer is the truth about this role: it really does write the base table through the view.
  const c = await pgClient(process.env.AG_TEST_PG_VIEWER!);
  try {
    await c.query("insert into probe_view values (1, 'written-through-view')");
    assert.equal((await c.query("select count(*)::int as n from probe_base")).rows[0].n, 1);
  } finally { await c.end(); }
  delete process.env.AG_TEST_PG_VIEWER;
});

test("capture refuses a column a rerun could not restore, and a type the rerun instance lacks is restored as text and recorded", { skip: SKIP }, async () => {
  const src = await warehouse();
  await onSource(src.instance.url("warehouse"),
    "create type mood as enum ('ok','bad')",
    "create table moods (id int not null, m mood not null)",
    "insert into moods values (1,'ok'), (2,'bad')",
    `create table odd_names (id int not null, "userId" text)`,
    "grant select on moods, odd_names to wh_reader");
  const a = reader();
  const dest = scratch("ag-pgenum-");
  const [inp] = await a.capture(["moods"], dest);
  assert.equal(inp!.runtime!.columns.find((c) => c.name === "m")!.sql_type, "mood");
  await assert.rejects(a.capture(["odd_names"], scratch("ag-pgodd-")), (e: any) =>
    e.category === "unsafe_identifier" && e.location === "odd_names.userId" && /column names must match/.test(e.message),
    "a hashed extract whose rerun could never restore it is refused at capture, naming the column");
  await a.close();
  const s = track(await openRetained(dest, [inp!]));
  const r = await s.execute("select id, m from moods order by id", {});
  assert.deepEqual(r.rows.map((x) => x.m), ["ok", "bad"], "the extract still reruns: the enum column is restored as its text rendering");
  assert.equal(r.columns.find((c) => c.name === "m")!.sql_type, "text");
  if (r.admission.decision === "admitted" && r.admission.estimate.status === "unknown") {
    assert.match(r.admission.estimate.reason, /not a built-in type on the rerun instance: moods\.m \(mood\)/);
  } else assert.fail("the substitution is recorded in the admission, never silent");
  await s.close();
});

test("an untyped extract with a comma inside a column name is reported as an unrestorable column, not torn into extra columns", { skip: SKIP }, async () => {
  const dir = scratch("ag-pghdr-");
  mkdirSync(join(dir, "inputs"));
  const csv = 'id,"has,comma",tail\n1,x,y\n';
  writeFileSync(join(dir, "inputs/odd.csv"), csv);
  const value = createHash("sha256").update(Buffer.from(csv, "utf8")).digest("hex");
  await assert.rejects(openRetained(dir, [{ id: "odd", kind: "extract", path: "inputs/odd.csv", content_hash: { value } }]),
    (e: any) => e.category === "unsafe_identifier" && e.location === "odd.has,comma");
});

test("a column type with no ordering operator is captured, and a statement that fails mid-capture leaves the session usable", { skip: SKIP }, async () => {
  const src = await warehouse();
  await onSource(src.instance.url("warehouse"),
    "create table docs (id int not null, payload json)",
    `insert into docs values (1, '{"a":1}'), (2, null)`,
    "create view boom as select id, 1 / (id - id) as x from docs",
    "grant select on docs, boom to wh_reader");
  const a = reader();
  const dest = scratch("ag-pgjson-");
  const [inp] = await a.capture(["docs"], dest);
  assert.match(inp!.source.method, /"payload"::text/, "a column Postgres cannot sort is ordered by its text rendering, and the method says so");
  const again = await a.capture(["docs"], scratch("ag-pgjson2-"));
  assert.equal(inp!.content_hash.value, again[0]!.content_hash.value, "the fallback ordering is still deterministic");
  // A server error inside the capture transaction leaves it aborted; it has to be rolled back, not left open.
  await assert.rejects(a.capture(["boom"], scratch("ag-pgboom-")), (e: any) => e.category === "sql_error" && /division by zero/.test(e.message));
  assert.equal((await a.execute("select 1 as one", {})).rows[0]!.one, 1, "the session answers the next statement instead of failing with 25P02");
  await a.close();
  const s = track(await openRetained(dest, [inp!]));
  assert.deepEqual((await s.execute("select id, payload::text as p from docs order by id", {})).rows.map((x) => x.p), ['{"a":1}', null]);
  await s.close();
});

test("memory_limit is applied as work_mem or refused, never silently dropped", { skip: SKIP }, async () => {
  await warehouse();
  assert.equal(workMem("256 MB"), "256MB");
  assert.equal(workMem("262144"), "256MB", "a bare number is kB, as Postgres reads it");
  assert.equal(workMem("1 GB"), "1GB");
  for (const bad of ["banana", "", "2TB", "1kB"]) {
    assert.throws(() => new PostgresAdapter({ connection_string_env: "AG_TEST_PG_READER", limits: { memory_limit: bad } }),
      (e: any) => e instanceof AdapterError && e.category === "resource_limit" && /work_mem/.test(e.message), bad);
  }
  const a = reader({ limits: { memory_limit: "256 MB" } });
  assert.equal((await a.execute("select current_setting('work_mem') as w", {})).rows[0]!.w, "256MB");
  const dest = scratch("ag-pgmem-");
  const inputs = await a.capture(["platforms"], dest);
  await a.close();
  const s = track(await openRetained(dest, inputs, { memory_limit: "1 GB" }));
  const r = await s.execute("select current_setting('work_mem') as w", {});
  assert.equal(r.rows[0]!.w, "1GB");
  if (r.admission.decision === "admitted" && r.admission.basis === "unknown_estimate_with_enforced_limits") {
    assert.equal(r.admission.limits.memory_limit, "1GB", "the admission records the limit the session actually applied");
  } else assert.fail("a retained rerun is admitted on its enforced limits");
  await s.close();
});

test("capture is one snapshot across tables: a commit landing between two extracts is invisible to the later one", { skip: SKIP }, async () => {
  const src = await warehouse();
  const admin = src.instance.url("warehouse");
  await onSource(admin,
    "create table conc_a (id int not null)", "insert into conc_a values (1), (2)",
    "create table conc_b (id int not null)", "insert into conc_b values (1)",
    "grant select on conc_a, conc_b to wh_reader");
  const writer = await pgClient(admin);
  const a = reader();
  const dest = scratch("ag-pgconc-");
  let inputs;
  try {
    // The writer holds conc_b, so the capture reads conc_a, then blocks; the insert commits while it waits.
    await writer.query("begin");
    await writer.query("lock table conc_b in access exclusive mode");
    const capturing = a.capture(["conc_a", "conc_b"], dest);
    await new Promise((r) => setTimeout(r, 300));
    await writer.query("insert into conc_b values (999)");
    await writer.query("commit");
    inputs = await capturing;
  } finally { await writer.end(); }
  assert.equal(readFileSync(join(dest, inputs[1]!.path), "utf8"), "id\n1\n", "the later table is read in the snapshot the capture opened, before that insert committed");
  assert.equal(inputs[0]!.captured_at, inputs[1]!.captured_at);
  assert.equal(inputs[1]!.source.consistency, "single_transaction");
  assert.equal((await a.execute("select count(*) as n from conc_b", {})).rows[0]!.n, 2, "the source really did change while the capture was running");
  await a.close();
});

test("rerun opens a snapshot with the adapter that captured it; DuckDB stays the default", () => {
  assert.equal(retainedOpenerFor([{ id: "a", source: { adapter: "postgres" } }]), openRetained);
  assert.equal(retainedOpenerFor([{ id: "a", source: { adapter: "duckdb" } }]), openRetainedDuckdb);
  assert.equal(retainedOpenerFor([{ id: "a" }]), openRetainedDuckdb, "an input that records no adapter reruns on DuckDB, exactly as before");
  assert.equal(retainedOpenerFor([{ id: "a", source: { adapter: "synthetic" } }]), openRetainedDuckdb, "a CSV extract from any other source still reruns on DuckDB");
  assert.equal(retainedOpenerFor([]), openRetainedDuckdb);
  assert.throws(() => retainedOpenerFor([{ source: { adapter: "duckdb" } }, { source: { adapter: "postgres" } }]), (e: any) => e.category === "not_implemented");
});

test("a Postgres-captured snapshot reruns on Postgres, not through DuckDB's types and dialect", { skip: SKIP }, async () => {
  await warehouse();
  const a = reader();
  const dest = scratch("ag-pgsel-");
  const inputs = await a.capture(["platforms"], dest);
  await a.close();
  assert.equal(inputs[0]!.source.adapter, "postgres");
  const s = track(await retainedOpenerFor(inputs)(dest, inputs));
  assert.match(String((await s.execute("select version() as v", {})).rows[0]!.v), /PostgreSQL/);
  await s.close();
});

// The same rule as DuckDB (docs/contracts/adapters.md, "Large sources: the windowed Instance pattern"): a
// whole-table capture is a scan of the whole table, so the admission cap bounds `capture` too, and the refusal
// arrives from the planner before the capture transaction opens.
test("capture is refused for a table over the admission cap, before the transaction opens; tableAdmissions reports it first", { skip: SKIP }, async () => {
  await warehouse();
  const a = reader({ estimate_cap_rows: 10 });
  const dest = scratch("ag-pg-cap-big-");

  const [users, platforms] = await a.tableAdmissions(["users", "platforms"]);
  assert.equal(users!.estimate.status, "estimated");
  if (users!.estimate.status === "estimated") assert.equal(users!.estimate.unit, "planner_cost");
  assert.ok(typeof users!.bytes === "number" && users!.bytes! > 0, "pg_table_size states the heap and its TOAST");
  assert.equal(users!.admission.decision, "rejected");
  assert.equal(platforms!.admission.decision, "admitted");

  await assert.rejects(a.capture(["users"], dest), (e: any) =>
    e.category === "admission" && e.location === "users"
    && /whole-table scan of \d+ rows/.test(e.message) && /admission limit of 10 rows/.test(e.message)
    && /nothing was read and nothing was written/.test(e.message));
  assert.equal(existsSync(join(dest, "inputs")), false, "a refused capture does not even create inputs/");
  // All-or-nothing across tables: the small one is not written because the large one is refused.
  await assert.rejects(a.capture(["platforms", "users"], dest), (e: any) => e.category === "admission" && e.location === "users");
  assert.equal(existsSync(join(dest, "inputs")), false);

  // The session is not left in an aborted transaction by the refusal.
  const ok = await a.execute("select count(*) as n from platforms", {});
  assert.ok(Number(ok.rows[0]!.n) >= 0);
  await a.close();
});
