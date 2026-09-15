// Seam-2 contract tests, DuckDB. The same behaviours are meant to run on Postgres (ag-postgres-adapter-dna).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DuckDbAdapter, openRetained } from "./duckdb.ts";
import { AdapterError } from "./contract.ts";
import { serializeResult } from "./serialize.ts";

const WAREHOUSE = fileURLToPath(new URL("../../fixtures/instance/data/", import.meta.url));
function scratchWarehouse(): string { const d = mkdtempSync(join(tmpdir(), "ag-wh-")); cpSync(WAREHOUSE, d, { recursive: true }); return d; }
const adapter = (path: string, extra = {}) => new DuckDbAdapter({ source: { kind: "csv_dir", path }, ...extra });

test("capability matrix is honest: role probe unsupported, limits partial, units never inferred", async () => {
  const a = adapter(scratchWarehouse());
  const caps = a.capabilities();
  assert.equal(caps.privilege_probe.status, "unsupported");
  assert.equal(caps.resource_limits.status, "partial");
  assert.equal((await a.probePrivileges()).status, "unsupported");
  const cat = await a.catalog();
  assert.ok(cat.some((t) => t.name === "users" && t.columns.some((c) => c.name === "user_id" && c.sql_type === "VARCHAR")));
  await a.close();
});

test("execute returns typed JSON-safe cells; decimals as strings, timestamps in UTC, null distinct from zero", async () => {
  const a = adapter(scratchWarehouse());
  const r = await a.execute("select 1.5::decimal(10,4) as d, 3::bigint as i, date '2026-01-02' as day, timestamptz '2026-01-02 03:04:05+00' as ts, null::varchar as t, true as b, count(*) as n from users", {});
  assert.equal(r.rows[0]!.d, "1.5000"); assert.equal(r.rows[0]!.i, "3"); assert.equal(r.rows[0]!.ts, "2026-01-02 03:04:05+00"); assert.equal(r.rows[0]!.t, null); assert.equal(r.rows[0]!.b, true);
  const ser = serializeResult(r, { result_id: "x", execution_id: "e", row_key: "i", columns: [{ name: "d", type: "decimal" }, { name: "i", type: "integer" }, { name: "day", type: "date" }, { name: "ts", type: "timestamp" }, { name: "t", type: "text", nullable: true }, { name: "b", type: "boolean" }, { name: "n", type: "integer" }] });
  assert.equal(ser.object.rows[0]!.i, 3); assert.equal(ser.object.rows[0]!.d, "1.5000"); assert.equal(ser.object.rows[0]!.t, null);
  assert.throws(() => serializeResult(r, { result_id: "x", execution_id: "e", row_key: "i", columns: [{ name: "d", type: "integer" }] }), (e: any) => e.category === "result_shape");
  assert.equal(r.admission.decision, "admitted");
  await a.close();
});

test("statement guard rejects DDL, DML, multiple statements and undeclared parameters; the source stays unchanged", async () => {
  const dir = scratchWarehouse(); const before = readFileSync(join(dir, "users.csv"));
  const a = adapter(dir);
  for (const sql of ["create table t as select 1", "insert into users select * from users", "delete from users", "select 1; select 2", "copy (select 1) to '/tmp/x.csv'"]) {
    await assert.rejects(a.execute(sql, {}), (e: any) => e instanceof AdapterError && ["sql_policy", "sql_error", "admission"].includes(e.category), sql);
  }
  await assert.rejects(a.execute("select * from users where user_id = $who", {}), (e: any) => e.category === "sql_parameter");
  await assert.rejects(a.execute("select * from read_csv('/etc/passwd')", {}), (e: any) => ["sql_error", "sql_policy"].includes(e.category), "external access is disabled");
  assert.deepEqual(readFileSync(join(dir, "users.csv")), before);
  await a.close();
});

test("admission: estimate under cap admits, an over-cap scan is rejected even with LIMIT 1, unknown falls back to enforced limits", async () => {
  const a = adapter(scratchWarehouse(), { estimate_cap_rows: 100 });
  const est = await a.estimate("select count(*) from (select * from range(1000000) limit 1)", {});
  assert.equal(est.status, "estimated");
  if (est.status === "estimated") assert.ok(est.scan_rows >= 1000000, JSON.stringify(est));
  await assert.rejects(a.execute("select count(*) from (select * from range(1000000) limit 1)", {}), (e: any) => e.category === "admission" && /exceeds the cap/.test(e.message));
  const small = await a.execute("select count(*) as n from (select * from range(10))", {});
  assert.equal(small.admission.decision, "admitted"); if (small.admission.decision === "admitted") assert.equal(small.admission.basis, "estimate_under_cap");
  await a.close();
});

test("cancellation: a runaway statement is interrupted by the timeout and the connection stays usable", async () => {
  const a = adapter(scratchWarehouse(), { estimate_cap_rows: 1e15 });
  const t0 = Date.now();
  await assert.rejects(a.execute("select count(*) from range(3000000000) x, range(1000) y", {}, { timeout_ms: 300 }), (e: any) => e.category === "cancelled");
  assert.ok(Date.now() - t0 < 5000);
  const ok = await a.execute("select 1 as one", {});
  assert.equal(Number(ok.rows[0]!.one), 1);
  await a.close();
});

test("capture produces stable hashes; a rerun on retained inputs is unchanged after the source is mutated; missing or corrupt inputs are explicit errors", async () => {
  const dir = scratchWarehouse();
  const a = adapter(dir);
  const dest = mkdtempSync(join(tmpdir(), "ag-cap-"));
  const inputs = await a.capture(["subscriptions"], dest);
  const again = await a.capture(["subscriptions"], mkdtempSync(join(tmpdir(), "ag-cap2-")));
  assert.equal(inputs[0]!.content_hash.value, again[0]!.content_hash.value, "capture is deterministic");
  assert.equal(inputs[0]!.source.consistency, "single_transaction");
  const sql = "select count(*) as n from subscriptions where canceled_at <> ''";
  const live = await a.execute(sql, {});
  await a.close();
  // Mutate the live source after capture.
  writeFileSync(join(dir, "subscriptions.csv"), readFileSync(join(dir, "subscriptions.csv"), "utf8") + "s_zz,u_zz,2026-09-01T00:00:00Z,2026-09-02T00:00:00Z,999\n");
  const b = adapter(dir);
  const mutated = await b.execute(sql, {}); await b.close();
  assert.notEqual(mutated.rows[0]!.n, live.rows[0]!.n, "the live source changed");
  const session = await openRetained(dest, inputs);
  const rerun = await session.execute(sql, {});
  assert.equal(rerun.rows[0]!.n, live.rows[0]!.n, "the retained rerun reproduces the captured answer");
  await assert.rejects(session.execute("select count(*) from users", {}), (e: any) => e.category === "sql_error", "undeclared tables are not visible");
  await session.close();
  // Corrupt and missing retained inputs.
  writeFileSync(join(dest, inputs[0]!.path), "subscription_id\n");
  await assert.rejects(openRetained(dest, inputs), (e: any) => e.category === "hash_mismatch");
  rmSync(join(dest, inputs[0]!.path));
  await assert.rejects(openRetained(dest, inputs), (e: any) => e.category === "missing_file" && /will not read a live source/.test(e.message));
});

test("a READ_ONLY DuckDB file source refuses writes at the engine, independent of the guard", async () => {
  const { DuckDBInstance } = await import("@duckdb/node-api");
  const file = join(mkdtempSync(join(tmpdir(), "ag-db-")), "w.duckdb");
  const db = await DuckDBInstance.create(file); const c = await db.connect();
  await c.run("create table s as select 1 as v"); c.closeSync(); db.closeSync();
  const a = new DuckDbAdapter({ source: { kind: "duckdb_file", path: file } });
  assert.equal(Number((await a.execute("select v from s", {})).rows[0]!.v), 1);
  await assert.rejects(a.execute("insert into s values (2)", {}), (e: any) => e.category === "sql_policy");
  assert.equal((await a.probePrivileges()).status, "unsupported");
  await a.close();
});
