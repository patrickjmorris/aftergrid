// Seam-2 contract tests, DuckDB. The same behaviours are meant to run on Postgres (ag-postgres-adapter-dna).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, cpSync, rmSync, existsSync, statSync } from "node:fs";
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

test("both source kinds are sealed: external file reads are refused, and a failed open never leaks an unsealed connection", async () => {
  const sentinel = join(mkdtempSync(join(tmpdir(), "ag-sent-")), "sentinel.txt"); writeFileSync(sentinel, "secret");
  const { DuckDBInstance } = await import("@duckdb/node-api");
  const file = join(mkdtempSync(join(tmpdir(), "ag-db-")), "w.duckdb");
  const db = await DuckDBInstance.create(file); const c = await db.connect(); await c.run("create table s as select 1 as v"); c.closeSync(); db.closeSync();
  for (const a of [new DuckDbAdapter({ source: { kind: "duckdb_file", path: file } }), adapter(scratchWarehouse())]) {
    await assert.rejects(a.execute(`select content from read_text('${sentinel}')`, {}), (e: any) => ["sql_error", "sql_policy", "admission"].includes(e.category), "external read must be refused");
    await a.close();
  }
  const broken = new DuckDbAdapter({ source: { kind: "csv_dir", path: join(tmpdir(), "does-not-exist-" + Date.now()) } });
  await assert.rejects(broken.execute("select 1", {}), (e: any) => e.category === "missing_file");
  await assert.rejects(broken.execute(`select content from read_text('${sentinel}')`, {}), (e: any) => e.category === "missing_file", "retry must fail the same way, not run on a half-open connection");
  const a2 = adapter(scratchWarehouse());
  const [r1, r2] = await Promise.all([a2.execute("select 1 as x", {}), a2.execute("select 2 as x", {})]);
  assert.equal(Number(r1.rows[0]!.x) + Number(r2.rows[0]!.x), 3, "concurrent first opens share one sealed connection");
  await a2.close();
});

test("capture round-trips null, empty string, quotes, commas, CR/LF, decimals and timestamps losslessly", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ag-rt-"));
  writeFileSync(join(dir, "t.csv"), 'id,value,amount,at\n1,,1.50,2026-01-02T03:04:05Z\n2,"",0.001,2026-01-02T03:04:05Z\n3,"a,b",-2,2026-01-02T03:04:05Z\n4,"say ""hi""",3e-7,2026-01-02T03:04:05Z\n5,"line\r\nbreak",7,2026-01-02T03:04:05Z\n');
  const a = adapter(dir);
  const dest = mkdtempSync(join(tmpdir(), "ag-rt-cap-"));
  const [inp] = await a.capture(["t"], dest);
  const text = readFileSync(join(dest, inp!.path), "utf8");
  assert.ok(text.startsWith("id,value,amount,at\n1,,1.50,") && text.includes('\n2,"",0.001,'), text);
  await a.close();
  const s = await openRetained(dest, [inp!]);
  const r = await s.execute("select id, value is null as is_null, value = '' as is_empty, value from t order by id", {});
  assert.deepEqual(r.rows.map((x) => [Number(x.id), x.is_null, x.is_empty]), [[1, true, null], [2, false, true], [3, false, false], [4, false, false], [5, false, false]]);
  assert.equal(r.rows[2]!.value, "a,b"); assert.equal(r.rows[3]!.value, 'say "hi"'); assert.equal(r.rows[4]!.value, "line\r\nbreak");
  const amounts = await s.execute("select amount from t order by id", {});
  assert.deepEqual(amounts.rows.map((x) => x.amount), ["1.50", "0.001", "-2", "3e-7", "7"]);
  await s.close();
});

test("utcText floors before the epoch; scientific-notation decimals follow the shared contract", async () => {
  // @ts-ignore
  const { utcText } = await import("../../scripts/lib/sql-runner.mjs");
  assert.equal(utcText(-1n), "1969-12-31 23:59:59.999999+00");
  assert.equal(utcText(0n), "1970-01-01 00:00:00+00");
  assert.equal(utcText(1_500_000n), "1970-01-01 00:00:01.5+00");
  assert.equal(utcText(-1_000_000n), "1969-12-31 23:59:59+00");
  const { coerceCell } = await import("./serialize.ts");
  assert.equal(coerceCell("1e-7", "decimal", "x"), "1e-7");
  assert.throws(() => coerceCell("abc", "decimal", "x"), (e: any) => e.category === "value_type");
});

test("close during a first open leaves no connection behind, and overlapping calls are serialised rather than cross-cancelled", async () => {
  const a = adapter(scratchWarehouse());
  const pending = a.execute("select 1 as n", {});
  await a.close();
  await pending.catch(() => undefined);
  assert.equal((a as any).conn, undefined, "no connection published after close");
  assert.equal((a as any).db, undefined);
  const b = adapter(scratchWarehouse(), { estimate_cap_rows: 1e15 });
  const slow = b.execute("select count(*) from range(3000000000) x, range(1000) y", {}, { timeout_ms: 300 }).catch((e) => e);
  const quick = b.execute("select 7 as seven", {});
  const [s, qres] = await Promise.all([slow, quick]);
  assert.equal((s as any).category, "cancelled");
  assert.equal(Number(qres.rows[0]!.seven), 7, "the quick call ran after the slow one, untouched by its interrupt");
  await b.close();
});

// A whole-table capture IS a scan of the whole table, so the cap that bounds `execute` bounds `capture`
// (docs/contracts/adapters.md, "Large sources: the windowed Instance pattern"). The cap is lowered here through
// the same `estimate_cap_rows` seam the admission tests above use, rather than by generating a source big enough
// to cross the 5,000,000-row default: what is under test is the rule, not DuckDB's ability to read a large file.
test("capture is refused for a table over the admission cap, before anything is read or written", async () => {
  const a = adapter(scratchWarehouse(), { estimate_cap_rows: 4 });
  const dest = mkdtempSync(join(tmpdir(), "ag-cap-big-"));
  const over = await a.estimate("select * from users", {});
  assert.equal(over.status, "estimated");
  const scan = over.status === "estimated" ? over.scan_rows : 0;
  assert.ok(scan > 4, `the fixture table must be over the lowered cap, got ${scan}`);

  await assert.rejects(a.capture(["users"], dest), (e: any) =>
    e instanceof AdapterError && e.category === "admission"
    && e.location === "users"
    // The observed scan estimate and the limit are both in the message.
    && new RegExp(`whole-table scan of ${scan} rows`).test(e.message) && /admission limit of 4 rows/.test(e.message)
    && /no window, predicate or row-bound flag/.test(e.message)
    && /nothing was read and nothing was written/.test(e.message));
  assert.equal(existsSync(join(dest, "inputs")), false, "a refused capture does not even create inputs/");

  // A multi-table capture is all-or-nothing: the small table is not written because the large one is refused.
  await assert.rejects(a.capture(["platforms", "users"], dest), (e: any) => e.category === "admission" && e.location === "users");
  assert.equal(existsSync(join(dest, "inputs")), false, "no table is captured when any named table is over the cap");

  // The same table, under a cap that admits it, captures normally: the refusal is the cap, not the table.
  const ok = adapter(scratchWarehouse(), { estimate_cap_rows: 1e9 });
  const captured = await ok.capture(["users"], dest);
  assert.equal(captured.length, 1);
  assert.ok(existsSync(join(dest, captured[0]!.path)));
  await ok.close();
  await a.close();
});

test("tableAdmissions reports scan rows, source bytes and admissibility without reading or writing anything", async () => {
  const dir = scratchWarehouse();
  const a = adapter(dir, { estimate_cap_rows: 4 });
  const rows = await a.tableAdmissions(["users", "platforms"]);
  assert.deepEqual(rows.map((r) => r.table), ["users", "platforms"]);
  for (const r of rows) {
    assert.equal(r.estimate.status, "estimated");
    if (r.estimate.status === "estimated") assert.equal(r.estimate.unit, "estimated_rows");
    // A CSV source states its own size; this is the file on disk, never inferred from the row estimate.
    assert.equal(r.bytes, statSync(join(dir, `${r.table}.csv`)).size);
  }
  assert.equal(rows[0]!.admission.decision, "rejected", "users is over the lowered cap");
  await assert.rejects(a.tableAdmissions(["not_a_table"]), (e: any) => e.category === "unresolved_reference");
  assert.equal(existsSync(join(dir, "inputs")), false);
  await a.close();
});
