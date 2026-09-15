#!/usr/bin/env node
// Fixture tooling for Finding directories. Two commands:
//   build <finding-dir>     run the Finding's queries and Checks against its retained inputs with DuckDB,
//                           write results/*.json, pin every content hash and the content digest into manifest.yaml.
//   validate <finding-dir>  schema, hashes, references, memo template, chart subset, digest, readiness.
// This is fixture tooling for ag-finding-exemplars-a2f. The real `aftergrid check` (ag-skeleton-fixtures-6yk)
// supersedes `validate`; `build` mimics what the DuckDB adapter and `new finding` will do. It never claims
// publication readiness: only a verified github_pr_review can, and this tool cannot verify one.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { safePath, validateStructure, validateResult, ContractError, sqlString, fail } from "./fixture-safety.mjs";
import { findInstanceRoot, canon, definitionHash, digestOf, schemaErrors, validateFinding } from "./lib/validate-finding.mjs";
import { join, dirname, resolve } from "node:path";
import { parseDocument, parse as parseYaml } from "yaml";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [cmd, dirArg] = process.argv.slice(2);
if (!cmd || !dirArg) { console.error("usage: fixture-tool.mjs <build|validate> <finding-dir>"); process.exit(2); }
const DIR = resolve(dirArg);
const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const rd = (p) => readFileSync(p);
const H = (buf) => ({ algorithm: "sha256", value: sha(buf) });
let INSTANCE;

async function openDb(manifest, dir, inputIds) {
  const { DuckDBInstance } = await import("@duckdb/node-api");
  const db = await DuckDBInstance.create(":memory:", {
    autoload_known_extensions: "false", autoinstall_known_extensions: "false",
    allow_community_extensions: "false", allow_unsigned_extensions: "false",
    memory_limit: "256MB", threads: "2", max_temp_directory_size: "0B"
  });
  const c = await db.connect();
  try {
    await c.run("SET TimeZone='UTC'");
    for (const inp of manifest.snapshot.inputs.filter(i => inputIds.includes(i.id))) {
      if (inp.kind !== "extract") throw new Error("fixture tool only supports extract inputs (CSV)");
      // Materialize declared inputs before disabling all external access. Queries can only read these tables.
      await c.run(`create table "${inp.id}" as select * from read_csv(${sqlString(safePath(dir, inp.path))}, header=true, all_varchar=true)`);
    }
    await c.run("SET enable_external_access=false");
    await c.run("SET lock_configuration=true");
    return { c, close: () => { c.closeSync(); db.closeSync(); } };
  } catch (e) { c.closeSync(); db.closeSync(); throw e; }
}
async function runSql(c, sql, params) {
  const { StatementType } = await import("@duckdb/node-api");
  const timer = setTimeout(() => c.interrupt(), 10000);
  let p;
  try {
    const statements = await c.extractStatements(sql);
    if (statements.count !== 1) fail("sql_policy", "SQL", "exactly one SELECT statement is allowed");
    p = await statements.prepare(0);
    if (p.statementType !== StatementType.SELECT) fail("sql_policy", "SQL", "only SELECT statements are allowed");
    const bindings = Object.create(null);
    for (let i = 1; i <= p.parameterCount; i++) {
      const name = p.parameterName(i);
      if (!Object.hasOwn(params, name)) fail("sql_parameter", name, "missing named SQL parameter");
      bindings[name] = params[name];
    }
    if (p.parameterCount) p.bind(bindings);
    const r = await p.runAndReadAll();
    return { names: r.columnNames(), rows: r.getRowObjectsJson() };
  } finally { clearTimeout(timer); p?.destroySync(); }
}
function coerce(v, type) {
  if (v === null) return null;
  if (v === undefined) fail("value_type", "result", "missing value");
  if (type === "integer") { const n = Number(v); if (!Number.isSafeInteger(n)) fail("value_type", "result", "integer exceeds safe JSON integer range"); return n; }
  if (type === "boolean") { if (typeof v !== "boolean") fail("value_type", "result", "expected SQL boolean"); return v; }
  return String(v);
}
function checkExecution(manifest, check) {
  return (check.execution_id ? manifest.executions.find(e => e.id === check.execution_id) : manifest.executions[0]) ?? { parameters: { analytical_timezone: "UTC" }, input_ids: [] };
}

async function build() {
  const doc = parseDocument(readFileSync(safePath(DIR, "manifest.yaml"), "utf8"));
  const manifest = doc.toJS();
  const schemaProblems = schemaErrors(manifest, REPO);
  if (schemaProblems.length) { report.errors.push(...schemaProblems); return finish(manifest); }
  validateStructure(manifest, DIR, INSTANCE);
  // Detect missing source files before staging any generated output.
  rd(safePath(DIR, "memo.md"));
  for (const ch of manifest.charts) rd(safePath(DIR, ch.spec_path));
  // Separate databases enforce each execution's declared input boundary, including dynamic SQL.
  const databases = new Map();
  const connectionFor = async (inputIds) => {
    const key = JSON.stringify([...new Set(inputIds)].sort());
    if (!databases.has(key)) databases.set(key, await openDb(manifest, DIR, inputIds));
    return databases.get(key).c;
  };
  const staged = [];
  try {
    const set = (path, v) => doc.setIn(path, v);
    manifest.snapshot.inputs.forEach((inp, i) => set(["snapshot", "inputs", i, "content_hash"], H(rd(safePath(DIR, inp.path)))));
    manifest.definitions.forEach((d, i) => {
      const p = safePath(INSTANCE, d.path); const text = readFileSync(p, "utf8"); const h = definitionHash(text);
      set(["definitions", i, "content_hash"], h);
    });
    manifest.queries.forEach((q, i) => set(["queries", i, "content_hash"], H(rd(safePath(DIR, q.path)))));
    mkdirSync(safePath(DIR, "results"), { recursive: true });
    for (const [i, ex] of manifest.executions.entries()) {
      const q = manifest.queries.find((x) => x.id === ex.query_id);
      const sql = readFileSync(safePath(DIR, q.path), "utf8");
      set(["executions", i, "sql_hash"], H(Buffer.from(sql, "utf8")));
      const rIdx = manifest.results.findIndex((r) => r.id === ex.result_id);
      const res = manifest.results[rIdx];
      const { names, rows } = await runSql(await connectionFor(ex.input_ids), sql, ex.parameters);
      const declared = res.columns.map((x) => x.name);
      if (canon(names) !== canon(declared)) throw new Error(`${ex.id}: result columns ${names} do not match declared ${declared}`);
      const out = { result_id: res.id, execution_id: ex.id, row_key: res.row_key, columns: declared,
        rows: rows.map((row) => Object.fromEntries(res.columns.map((col) => [col.name, coerce(row[col.name], col.type)]))) };
      const bytes = Buffer.from(JSON.stringify(out, null, 2) + "\n", "utf8");
      validateResult(out, { ...res, row_count: out.rows.length });
      staged.push([safePath(DIR, res.path), bytes]);
      set(["results", rIdx, "content_hash"], H(bytes)); set(["results", rIdx, "row_count"], out.rows.length);
      set(["executions", i, "result_hash"], H(bytes));
      set(["executions", i, "executed_at"], new Date().toISOString().replace(/\.\d{3}Z$/, "Z"));
      console.log(`ran ${ex.id}: ${out.rows.length} rows`);
    }
    for (const [i, ck] of manifest.checks.entries()) {
      const sql = readFileSync(safePath(DIR, ck.path), "utf8");
      set(["checks", i, "content_hash"], H(Buffer.from(sql, "utf8")));
      let outcome, detail = "";
      try {
        const ex = checkExecution(manifest, ck);
        const { names, rows } = await runSql(await connectionFor(ex.input_ids), sql, ex.parameters);
        if (rows.length !== 1 || !names.includes("pass") || names.some(n => !["pass", "detail"].includes(n)) ||
            (rows[0].pass !== null && typeof rows[0].pass !== "boolean") ||
            (names.includes("detail") && rows[0].detail !== null && typeof rows[0].detail !== "string")) {
          fail("check_shape", ck.path, "Check must return exactly one row with a boolean/null pass and optional text detail");
        }
        const p = rows[0].pass; detail = rows[0].detail ?? "";
        outcome = p === null ? "not_run" : p ? "pass" : "fail";
      } catch (e) { throw new ContractError(e.category ?? "check_error", ck.path, e.message); }
      set(["checks", i, "outcome"], outcome);
      set(["checks", i, "executed_at"], new Date().toISOString().replace(/\.\d{3}Z$/, "Z"));
      console.log(`check ${ck.id}: ${outcome} (${detail})`);
    }
    // Write only after every query and Check completed successfully. Approvals are never rewritten.
    for (const [path, bytes] of staged) writeFileSync(path, bytes);
    const m2 = doc.toJS();
    const d = digestOf(m2, DIR);
    set(["content_digest"], d);
    writeFileSync(safePath(DIR, "manifest.yaml"), doc.toString({ lineWidth: 0 }));
    console.log("pinned digest", d.value);
  } finally { for (const database of databases.values()) database.close(); }
}

// ---------------- validate (delegated to scripts/lib/validate-finding.mjs) ----------------
const report = { errors: [], warnings: [], info: [] };
const err = (category, location, message, remedy) => report.errors.push({ category, location, message, remedy });

function finish(manifest, summary) {
  const out = { finding: manifest?.finding?.id ? `${manifest.finding.id} r${manifest.finding.revision}` : null, state: manifest?.finding?.state, outcome: manifest?.finding?.outcome, ...(summary || {}), errors: report.errors, warnings: report.warnings, info: report.info };
  console.log(JSON.stringify(out, null, 2));
  process.exit(report.errors.length ? 1 : 0);
}

try {
  INSTANCE = findInstanceRoot(DIR);
  if (cmd === "build") await build();
  else if (cmd === "validate") { const out = validateFinding(DIR, { instanceRoot: INSTANCE, repoRoot: REPO }); console.log(JSON.stringify(out, null, 2)); process.exit(out.errors.length ? 1 : 0); }
  else { console.error("unknown command"); process.exitCode = 2; }
} catch (e) {
  err(e.category ?? (e.code === "ENOENT" ? "missing_file" : "invalid_artifact"), e.location ?? e.path ?? dirArg, e.message, "correct the artifact and retry");
  if (cmd === "validate") finish(null, { evidence: "invalid", executionAvailability: "artifact_only", sqlExecution: "not_performed (artifact verification)", readiness: "not_ready" });
  else { console.error(JSON.stringify({ errors: report.errors }, null, 2)); process.exitCode = 1; }
}
