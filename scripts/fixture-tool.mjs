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
import { join, dirname, resolve, relative } from "node:path";
import { parseDocument, parse as parseYaml } from "yaml";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const REPO = resolve(dirname(new URL(import.meta.url).pathname), "..");
const [cmd, dirArg] = process.argv.slice(2);
if (!cmd || !dirArg) { console.error("usage: fixture-tool.mjs <build|validate> <finding-dir>"); process.exit(2); }
const DIR = resolve(dirArg);
const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const rd = (p) => readFileSync(p);
const H = (buf) => ({ algorithm: "sha256", value: sha(buf) });
const ID = "[a-z][a-z0-9_]{0,63}", RK = "[A-Za-z0-9_-]{1,64}";
const TOKEN_RE = new RegExp(`\\{\\{(ref|derived|ext|literal):([^}]*)\\}\\}`, "g");
const VALUE_REF_RE = new RegExp(`^(?:ref:(${ID})\\.(${RK})\\.(${ID})|derived:(${ID})|ext:(${ID}))$`);

function findInstanceRoot(d) {
  let cur = d;
  for (let i = 0; i < 6; i++) { if (existsSync(join(cur, "aftergrid.yaml"))) return cur; cur = dirname(cur); }
  throw new Error("no aftergrid.yaml found above " + d);
}
const INSTANCE = findInstanceRoot(DIR);

// Canonical JSON: sorted keys, no whitespace.
function canon(v) {
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
  return JSON.stringify(v);
}
function definitionHash(text) {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!m) throw new Error("definition file has no front matter");
  const fm = parseYaml(m[1]); delete fm.approval;
  return H(Buffer.from(canon(fm) + "\n" + m[2], "utf8"));
}
function digestOf(manifest, dir) {
  const m = JSON.parse(JSON.stringify(manifest));
  delete m.content_digest; delete m.attestations; delete m.reviews; delete m.finding.generated_at; delete m.snapshot.drift_fingerprints;
  for (const e of m.executions) delete e.executed_at;
  for (const c of m.checks) delete c.executed_at;
  const files = {};
  const add = (id, p) => { files[id] = sha(rd(join(dir, p))); };
  add("memo", "memo.md");
  for (const q of m.queries) add("query:" + q.id, q.path);
  for (const c of m.checks) add("check:" + c.id, c.path);
  for (const c of m.charts) add("chart:" + c.id, c.spec_path);
  for (const r of m.results) add("result:" + r.id, r.path);
  return H(Buffer.from(canon({ manifest: m, files }), "utf8"));
}

async function openDb(manifest, dir) {
  const { DuckDBInstance } = await import("@duckdb/node-api");
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  await c.run("SET TimeZone='UTC'");
  for (const inp of manifest.snapshot.inputs) {
    if (inp.kind !== "extract") throw new Error("fixture tool only supports extract inputs (CSV)");
    await c.run(`create view "${inp.id}" as select * from read_csv('${join(dir, inp.path)}', header=true, all_varchar=true)`);
  }
  return c;
}
function bindable(sql, params) {
  const out = {};
  for (const [k, v] of Object.entries(params)) if (new RegExp("\\$" + k + "\\b").test(sql)) out[k] = v;
  return out;
}
async function runSql(c, sql, params) {
  const p = await c.prepare(sql);
  const b = bindable(sql, params);
  if (Object.keys(b).length) p.bind(b);
  const r = await p.runAndReadAll();
  return { names: r.columnNames(), rows: r.getRowObjectsJson() };
}
function coerce(v, type) {
  if (v === null || v === undefined) return null;
  if (type === "integer") return Number(v);
  if (type === "boolean") return v === true || v === "true";
  return String(v);
}
function firstExecParams(manifest, check) {
  const ex = check.execution_id ? manifest.executions.find((e) => e.id === check.execution_id) : manifest.executions[0];
  return ex ? ex.parameters : { analytical_timezone: "UTC" };
}

async function build() {
  const doc = parseDocument(readFileSync(join(DIR, "manifest.yaml"), "utf8"));
  const manifest = doc.toJS();
  const c = await openDb(manifest, DIR);
  const set = (path, v) => doc.setIn(path, v);
  manifest.snapshot.inputs.forEach((inp, i) => set(["snapshot", "inputs", i, "content_hash"], H(rd(join(DIR, inp.path)))));
  manifest.definitions.forEach((d, i) => {
    const p = join(INSTANCE, d.path); const text = readFileSync(p, "utf8"); const h = definitionHash(text);
    set(["definitions", i, "content_hash"], h);
    if (d.approval) {
      set(["definitions", i, "approval", "content_hash"], h);
      // Pin the same hash inside the definition file's approval block (fixture semantics: the approval was of this content).
      const fixed = text.replace(/(approval:[\s\S]*?content_hash:\n\s*algorithm: sha256\n\s*value: )"[a-f0-9]{64}"/, `$1"${h.value}"`);
      if (fixed !== text) writeFileSync(p, fixed);
    }
  });
  manifest.queries.forEach((q, i) => set(["queries", i, "content_hash"], H(rd(join(DIR, q.path)))));
  manifest.charts.forEach((ch, i) => void ch);
  mkdirSync(join(DIR, "results"), { recursive: true });
  for (const [i, ex] of manifest.executions.entries()) {
    const q = manifest.queries.find((x) => x.id === ex.query_id);
    const sql = readFileSync(join(DIR, q.path), "utf8");
    set(["executions", i, "sql_hash"], H(Buffer.from(sql, "utf8")));
    const rIdx = manifest.results.findIndex((r) => r.id === ex.result_id);
    const res = manifest.results[rIdx];
    const { names, rows } = await runSql(c, sql, ex.parameters);
    const declared = res.columns.map((x) => x.name);
    if (canon(names) !== canon(declared)) throw new Error(`${ex.id}: result columns ${names} do not match declared ${declared}`);
    const out = { result_id: res.id, execution_id: ex.id, row_key: res.row_key, columns: declared,
      rows: rows.map((row) => Object.fromEntries(res.columns.map((col) => [col.name, coerce(row[col.name], col.type)]))) };
    const bytes = Buffer.from(JSON.stringify(out, null, 2) + "\n", "utf8");
    writeFileSync(join(DIR, res.path), bytes);
    set(["results", rIdx, "content_hash"], H(bytes)); set(["results", rIdx, "row_count"], out.rows.length);
    set(["executions", i, "result_hash"], H(bytes));
    set(["executions", i, "executed_at"], new Date().toISOString().replace(/\.\d{3}Z$/, "Z"));
    console.log(`ran ${ex.id}: ${out.rows.length} rows`);
  }
  for (const [i, ck] of manifest.checks.entries()) {
    const sql = readFileSync(join(DIR, ck.path), "utf8");
    set(["checks", i, "content_hash"], H(Buffer.from(sql, "utf8")));
    let outcome, detail = "";
    try {
      const { rows } = await runSql(c, sql, firstExecParams(manifest, ck));
      const p = rows[0]?.pass; detail = rows[0]?.detail ?? "";
      outcome = p === null || p === undefined ? "not_run" : (p === true || p === "true") ? "pass" : "fail";
    } catch (e) { outcome = "error"; detail = String(e.message); }
    set(["checks", i, "outcome"], outcome);
    set(["checks", i, "executed_at"], new Date().toISOString().replace(/\.\d{3}Z$/, "Z"));
    console.log(`check ${ck.id}: ${outcome} (${detail})`);
  }
  // Digest, then bind reviews/attestations to it (fixture semantics).
  const m2 = doc.toJS();
  const d = digestOf(m2, DIR);
  set(["content_digest"], d);
  (m2.reviews || []).forEach((_, i) => set(["reviews", i, "content_digest"], d));
  (m2.attestations || []).forEach((_, i) => set(["attestations", i, "content_digest"], d));
  writeFileSync(join(DIR, "manifest.yaml"), doc.toString({ lineWidth: 0 }));
  console.log("pinned digest", d.value);
}

// ---------------- validate ----------------
const report = { errors: [], warnings: [], info: [] };
const err = (category, location, message, remedy) => report.errors.push({ category, location, message, remedy });
const warn = (category, location, message) => report.warnings.push({ category, location, message });

function resolveValueRef(manifest, ref, loc, results, seen = new Set()) {
  const m = VALUE_REF_RE.exec(ref);
  if (!m) { err("unresolved_reference", loc, `malformed reference '${ref}'`, "use ref:<result>.<row_key>.<column>, derived:<id> or ext:<id>"); return null; }
  if (m[1]) {
    const [, rid, rk, col] = m;
    const res = manifest.results.find((r) => r.id === rid);
    if (!res) { err("unresolved_reference", loc, `result '${rid}' not in manifest`, "add the result set or fix the id"); return null; }
    if (!res.columns.some((c) => c.name === col)) { err("missing_column", loc, `column '${col}' not declared on '${rid}'`, "declare the column or fix the reference"); return null; }
    const data = results[rid]; if (!data) return null;
    const rows = data.rows.filter((r) => String(r[res.row_key]) === rk);
    if (rows.length === 0) { err("unresolved_reference", loc, `row key '${rk}' not in '${rid}'`, "fix the key; keys are values of the row_key column"); return null; }
    if (rows.length > 1) { err("duplicate_row_key", loc, `row key '${rk}' matches ${rows.length} rows in '${rid}'`, "row keys must be unique"); return null; }
    const colDef = res.columns.find((c) => c.name === col);
    return { value: rows[0][col], unit: colDef.unit, display: colDef.display, provisional: !!res.provisional };
  }
  if (m[4]) {
    const id = m[4];
    if (seen.has(id)) { err("derived_cycle", loc, `derived '${id}' depends on itself`, "remove the cycle"); return null; }
    const d = manifest.derived.find((x) => x.id === id);
    if (!d) { err("unresolved_reference", loc, `derived '${id}' not in manifest`, "declare it under derived"); return null; }
    const ops = d.operands.map((o) => resolveValueRef(manifest, o, loc + " (derived " + id + ")", results, new Set([...seen, id])));
    if (ops.some((o) => o === null)) return null;
    if ((d.operation === "difference" || d.operation === "sum") && new Set(ops.map((o) => o.unit)).size > 1)
      err("unit_mismatch", loc, `derived '${id}' ${d.operation} over units ${ops.map((o) => o.unit).join(", ")}`, "operands of difference/sum need one unit");
    if (d.operation === "difference" && ops.length !== 2) err("unit_mismatch", loc, `derived '${id}' difference needs two operands`, "");
    const nums = ops.map((o) => (o.value === null ? null : Number(o.value)));
    let value = null;
    if (!nums.some((n) => n === null)) {
      const [a, b] = nums;
      if (d.operation === "difference") value = a - b;
      else if (d.operation === "sum") value = nums.reduce((x, y) => x + y, 0);
      else if (d.operation === "ratio") value = b === 0 ? null : a / b;
      else if (d.operation === "percent_of") value = b === 0 ? null : (100 * a) / b;
      else if (d.operation === "percent_change") value = b === 0 ? null : (100 * (a - b)) / b;
    }
    return { value, unit: d.unit, display: d.display, provisional: ops.some((o) => o.provisional) };
  }
  const e = manifest.external_sources.find((x) => x.id === m[5]);
  if (!e) { err("unresolved_reference", loc, `external source '${m[5]}' not in manifest`, "declare it under external_sources"); return null; }
  return { value: e.value, unit: e.unit, display: e.display, provisional: false };
}
function resolveTokensIn(manifest, text, loc, results) {
  let out = text;
  for (const m of text.matchAll(TOKEN_RE)) {
    if (m[1] === "literal") continue;
    resolveValueRef(manifest, m[1] + ":" + m[2], `${loc} token ${m[0]}`, results);
  }
  return out;
}

async function validate() {
  const manifest = parseYaml(readFileSync(join(DIR, "manifest.yaml"), "utf8"));
  // 1. schema
  const ajv = new Ajv2020({ allErrors: true, strict: false }); addFormats(ajv);
  const schema = JSON.parse(readFileSync(join(REPO, "schema/finding-manifest.schema.json"), "utf8"));
  const ok = ajv.validate(schema, manifest);
  if (!ok) for (const e of ajv.errors) err("schema", "manifest.yaml#" + e.instancePath, e.message + (e.params?.allowedValues ? " " + JSON.stringify(e.params.allowedValues) : ""), "fix the manifest against schema/finding-manifest.schema.json");
  if (!ok) return finish(manifest);
  // 2. hashes
  const checkHash = (p, expected, loc) => {
    const full = join(DIR, p);
    if (!existsSync(full)) { err("missing_file", loc, `${p} does not exist`, "restore the file or fix the path"); return; }
    const actual = sha(rd(full));
    if (actual !== expected.value) err("hash_mismatch", loc, `${p} hashes to ${actual.slice(0, 12)}…, manifest says ${expected.value.slice(0, 12)}…`, "content changed after pinning; rebuild or restore");
  };
  manifest.snapshot.inputs.forEach((i, n) => checkHash(i.path, i.content_hash, `manifest.yaml#/snapshot/inputs/${n}`));
  manifest.queries.forEach((q, n) => checkHash(q.path, q.content_hash, `manifest.yaml#/queries/${n}`));
  manifest.checks.forEach((c, n) => checkHash(c.path, c.content_hash, `manifest.yaml#/checks/${n}`));
  manifest.results.forEach((r, n) => checkHash(r.path, r.content_hash, `manifest.yaml#/results/${n}`));
  manifest.definitions.forEach((d, n) => {
    const p = join(INSTANCE, d.path);
    if (!existsSync(p)) return err("missing_file", `manifest.yaml#/definitions/${n}`, `${d.path} not in Instance`, "");
    const text = readFileSync(p, "utf8"); const h = definitionHash(text);
    if (h.value !== d.content_hash.value) err("hash_mismatch", `manifest.yaml#/definitions/${n}`, `definition ${d.id} content changed since pinned`, "re-pin the version or bump it");
    const fm = parseYaml(/^---\n([\s\S]*?)\n---/.exec(text)[1]);
    if (fm.id !== d.id || fm.version !== d.version) err("definition_version", `manifest.yaml#/definitions/${n}`, `file is ${fm.id} v${fm.version}, manifest pins ${d.id} v${d.version}`, "");
    if (d.approval) {
      if (d.approval.content_hash.value !== h.value) err("stale_attestation", `manifest.yaml#/definitions/${n}/approval`, `approval binds a different definition content`, "re-approve the definition");
      if (d.approval.source.type !== "github_pr_review") err("untrusted_attestation", `manifest.yaml#/definitions/${n}/approval`, "approval source is not a trusted type", "");
    }
    if (d.role === "decision_metric" && (d.kind !== "metric" || !d.approval)) err("definition_not_approved", `manifest.yaml#/definitions/${n}`, `decision metric ${d.id} lacks an approval or is not kind metric`, "approve the definition or mark the role supporting");
  });
  // 3. referential integrity + results
  const ids = (arr) => new Set(arr.map((x) => x.id));
  const qids = ids(manifest.queries), exids = ids(manifest.executions), rids = ids(manifest.results), cids = ids(manifest.claims), ckids = ids(manifest.checks), inids = ids(manifest.snapshot.inputs);
  const defOk = (ref) => manifest.definitions.some((d) => d.id === ref.id && d.version === ref.version);
  for (const [n, ex] of manifest.executions.entries()) {
    if (!qids.has(ex.query_id)) err("unresolved_reference", `manifest.yaml#/executions/${n}`, `query ${ex.query_id}`, "");
    if (!rids.has(ex.result_id)) err("unresolved_reference", `manifest.yaml#/executions/${n}`, `result ${ex.result_id}`, "");
    for (const i of ex.input_ids) if (!inids.has(i)) err("unresolved_reference", `manifest.yaml#/executions/${n}`, `input ${i}`, "");
    for (const d of ex.definition_refs) if (!defOk(d)) err("definition_version", `manifest.yaml#/executions/${n}`, `definition ${d.id} v${d.version} not pinned in definitions`, "");
    const res = manifest.results.find((r) => r.id === ex.result_id);
    if (res && res.content_hash.value !== ex.result_hash.value) err("hash_mismatch", `manifest.yaml#/executions/${n}`, `result_hash differs from results[].content_hash`, "");
    const q = manifest.queries.find((x) => x.id === ex.query_id);
    if (q && existsSync(join(DIR, q.path)) && sha(rd(join(DIR, q.path))) !== ex.sql_hash.value) err("hash_mismatch", `manifest.yaml#/executions/${n}`, `sql_hash differs from the query file`, "");
  }
  const results = {};
  for (const [n, res] of manifest.results.entries()) {
    if (!exids.has(res.execution_id)) err("unresolved_reference", `manifest.yaml#/results/${n}`, `execution ${res.execution_id}`, "");
    if (!existsSync(join(DIR, res.path))) continue;
    const data = JSON.parse(readFileSync(join(DIR, res.path), "utf8")); results[res.id] = data;
    if (canon(data.columns) !== canon(res.columns.map((c) => c.name))) err("schema", `${res.path}`, "file columns differ from declared columns", "");
    if (data.rows.length !== res.row_count) err("schema", `${res.path}`, `row_count ${res.row_count} but file has ${data.rows.length}`, "");
    if (!res.columns.some((c) => c.name === res.row_key)) err("missing_column", `manifest.yaml#/results/${n}`, `row_key ${res.row_key} not a column`, "");
    const keys = data.rows.map((r) => String(r[res.row_key]));
    if (new Set(keys).size !== keys.length) err("duplicate_row_key", res.path, "row keys are not unique", "");
    for (const k of keys) if (!new RegExp(`^${RK}$`).test(k)) err("schema", res.path, `row key '${k}' outside the allowed charset`, "");
    for (const col of res.columns) for (const [i, row] of data.rows.entries()) {
      const v = row[col.name];
      if (v === null && !col.nullable) err("null_value", `${res.path} row ${i}`, `null in non-nullable column ${col.name}`, "mark nullable or fix the query");
      if (v !== null && col.type === "integer" && !Number.isInteger(v)) err("schema", `${res.path} row ${i}`, `${col.name} not an integer`, "");
      if (v !== null && col.type === "decimal" && typeof v !== "string") err("schema", `${res.path} row ${i}`, `${col.name} decimal must be a string to preserve precision`, "");
      for (const [i2, d] of manifest.definitions.entries()) void i2, void d;
    }
  }
  for (const [n, cl] of manifest.claims.entries()) {
    for (const [k, e] of cl.evidence.entries()) resolveValueRef(manifest, e, `manifest.yaml#/claims/${n}/evidence/${k}`, results);
    for (const f of ["sentence", "population", "material_caveat"]) if (cl[f]) resolveTokensIn(manifest, cl[f], `manifest.yaml#/claims/${n}/${f}`, results);
    resolveTokensIn(manifest, cl.comparison.description, `manifest.yaml#/claims/${n}/comparison`, results);
    for (const ch of cl.chart_ids || []) if (!manifest.charts.some((c) => c.id === ch && c.claim_id === cl.id)) err("unresolved_reference", `manifest.yaml#/claims/${n}`, `chart ${ch} missing or owned by another Claim`, "");
    for (const t of cl.table_ids || []) if (!manifest.tables.some((c) => c.id === t && c.claim_id === cl.id)) err("unresolved_reference", `manifest.yaml#/claims/${n}`, `table ${t} missing or owned by another Claim`, "");
    const rc = cl.recheck;
    if (rc.mode === "automatic") {
      resolveValueRef(manifest, rc.predicate.subject, `manifest.yaml#/claims/${n}/recheck/predicate/subject`, results);
      if (typeof rc.predicate.threshold === "string") resolveValueRef(manifest, rc.predicate.threshold, `manifest.yaml#/claims/${n}/recheck/predicate/threshold`, results);
      if (["within", "outside"].includes(rc.predicate.operator) && (rc.predicate.tolerance === undefined || !rc.baseline)) err("schema", `manifest.yaml#/claims/${n}/recheck`, "within/outside need tolerance and baseline", "");
      rc.evidence.forEach((e, k) => resolveValueRef(manifest, e, `manifest.yaml#/claims/${n}/recheck/evidence/${k}`, results));
      resolveValueRef(manifest, rc.minimum_data.subject, `manifest.yaml#/claims/${n}/recheck/minimum_data`, results);
      if (rc.baseline) resolveValueRef(manifest, rc.baseline, `manifest.yaml#/claims/${n}/recheck/baseline`, results);
    }
    if (cl.provisional || cl.evidence.some((e) => resolveValueRef(manifest, e, "", results)?.provisional)) err("provisional_evidence", `manifest.yaml#/claims/${n}`, "Claim rests on provisional evidence and cannot be rendered for a Reader", "");
  }
  const answerBearing = manifest.claims.filter((c) => c.answer_bearing);
  if (manifest.finding.state === "complete" && answerBearing.length === 0) err("template", "manifest.yaml#/claims", "no answer_bearing Claim", "mark the Claim the Answer rests on");
  for (const [n, d] of manifest.derived.entries()) resolveValueRef(manifest, "derived:" + d.id, `manifest.yaml#/derived/${n}`, results);
  for (const [n, ch] of manifest.charts.entries()) {
    if (!cids.has(ch.claim_id)) err("unresolved_reference", `manifest.yaml#/charts/${n}`, `claim ${ch.claim_id}`, "");
    const res = manifest.results.find((r) => r.id === ch.result_id);
    if (!res) { err("unresolved_reference", `manifest.yaml#/charts/${n}`, `result ${ch.result_id}`, ""); continue; }
    resolveTokensIn(manifest, ch.title, `manifest.yaml#/charts/${n}/title`, results); resolveTokensIn(manifest, ch.description, `manifest.yaml#/charts/${n}/description`, results);
    if (!existsSync(join(DIR, ch.spec_path))) { err("missing_file", `manifest.yaml#/charts/${n}`, ch.spec_path, ""); continue; }
    const spec = JSON.parse(readFileSync(join(DIR, ch.spec_path), "utf8"));
    validateChartSpec(spec, res, ch.spec_path);
  }
  for (const [n, t] of manifest.tables.entries()) {
    if (!cids.has(t.claim_id)) err("unresolved_reference", `manifest.yaml#/tables/${n}`, `claim ${t.claim_id}`, "");
    const res = manifest.results.find((r) => r.id === t.result_id);
    if (!res) { err("unresolved_reference", `manifest.yaml#/tables/${n}`, `result ${t.result_id}`, ""); continue; }
    for (const c of t.columns) if (!res.columns.some((x) => x.name === c.name)) err("missing_column", `manifest.yaml#/tables/${n}`, `column ${c.name} not on ${res.id}`, "");
    for (const k of t.row_keys || []) if (results[res.id] && !results[res.id].rows.some((r) => String(r[res.row_key]) === k)) err("unresolved_reference", `manifest.yaml#/tables/${n}`, `row key ${k} not in ${res.id}`, "");
  }
  for (const f of manifest.export_policy.allowed_fields) {
    const [rid, col] = f.split(".");
    const res = manifest.results.find((r) => r.id === rid);
    if (!res || !res.columns.some((c) => c.name === col)) err("unresolved_reference", "manifest.yaml#/export_policy/allowed_fields", f, "");
  }
  // Every column a chart or table shows must be exported.
  const allowed = new Set(manifest.export_policy.allowed_fields);
  for (const t of manifest.tables) for (const c of t.columns) if (!allowed.has(`${t.result_id}.${c.name}`)) err("export_policy", `manifest.yaml#/tables/${t.id}`, `${t.result_id}.${c.name} is shown but not in allowed_fields`, "add it or remove the column");
  // Question
  const q = manifest.question;
  if (q.falsifier?.kind === "check") {
    const ck = manifest.checks.find((c) => c.id === q.falsifier.check_id);
    if (!ck) err("unresolved_reference", "manifest.yaml#/question/falsifier", `check ${q.falsifier.check_id}`, "");
    else { if (ck.kind !== "falsifier") err("schema", "manifest.yaml#/question/falsifier", "falsifier check must have kind falsifier", ""); if (ck.expected_outcome !== q.falsifier.expected_outcome) err("schema", "manifest.yaml#/question/falsifier", "expected_outcome differs between question and check", ""); }
  }
  if (q.metric && !defOk(q.metric)) err("definition_version", "manifest.yaml#/question/metric", `definition ${q.metric.id} v${q.metric.version} not pinned`, "");
  // Reader profile
  if (manifest.reader.profile !== "generic") {
    const readers = existsSync(join(INSTANCE, "readers.md")) ? readFileSync(join(INSTANCE, "readers.md"), "utf8") : "";
    if (!new RegExp(`^## ${manifest.reader.profile}\\s*$`, "m").test(readers)) err("unresolved_reference", "manifest.yaml#/reader/profile", `profile ${manifest.reader.profile} not in readers.md`, "add the profile or use generic");
  }
  // Checks: evidence validity
  let evidence = report.errors.length ? "invalid" : "valid";
  for (const ck of manifest.checks) {
    if (ck.required && ck.outcome !== "pass") { err("check_failed", `checks/${ck.id}`, `required Check ${ck.id} outcome ${ck.outcome}`, "fix the analysis or the Check"); }
    if (ck.kind === "falsifier" && manifest.finding.outcome === "answered" && ck.outcome !== ck.expected_outcome) err("falsifier", `checks/${ck.id}`, `falsifier outcome ${ck.outcome}, expected ${ck.expected_outcome}`, "the Answer is contradicted by its own falsifier");
    if (ck.kind === "minimum_data" && ck.outcome === "fail" && manifest.finding.outcome !== "insufficient_data") warn("minimum_data", `checks/${ck.id}`, "minimum-data Check failed but outcome is not insufficient_data");
    if (ck.kind === "minimum_data" && ck.outcome === "fail" && !ck.required) report.info.push(`minimum-data Check ${ck.id} failed: a business result, not an engine failure`);
  }
  const executionAvailability = manifest.checks.some((c) => c.outcome === "not_run" && c.kind !== "falsifier") ? "artifact_only" : "rerun_recorded";
  // 4. memo
  validateMemo(manifest, results);
  // 5. digest + readiness
  const d = digestOf(manifest, DIR);
  if (d.value !== manifest.content_digest.value) err("digest", "manifest.yaml#/content_digest", "content digest does not match current content", "run build (fixtures) or aftergrid check --pin");
  for (const [n, r] of (manifest.reviews || []).entries()) if (r.content_digest.value !== d.value) warn("stale_review", `manifest.yaml#/reviews/${n}`, `${r.kind} review is for a different content digest`);
  let readiness = "not_ready"; const reasons = [];
  const approvals = (manifest.attestations || []).filter((a) => a.kind === "publication_approval");
  for (const [n, a] of approvals.entries()) {
    if (a.content_digest.value !== d.value) { err("stale_attestation", `manifest.yaml#/attestations/${n}`, "attestation binds a different digest", "re-approve"); continue; }
    if (a.source.type !== "github_pr_review") { reasons.push(`attestation ${n}: source ${a.source.type} is not trusted`); continue; }
    readiness = "unknown"; reasons.push(`attestation ${n}: github_pr_review must be verified through the API against the trusted allowlist; this tool cannot`);
  }
  if (approvals.length === 0) reasons.push("no publication_approval attestation");
  if (manifest.finding.state !== "complete") readiness = "not_ready";
  const decisionMetrics = manifest.definitions.filter((x) => x.role === "decision_metric");
  finish(manifest, { evidence: report.errors.length ? "invalid" : "valid", executionAvailability, readiness, reasons, decisionMetrics: decisionMetrics.map((x) => `${x.id} v${x.version} ${x.lifecycle}${x.approval ? " (approval recorded)" : ""}`) });
}

function validateChartSpec(spec, res, loc) {
  const cols = new Set(res.columns.map((c) => c.name));
  const walk = (node, path) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${path}[${i}]`));
    if ("transform" in node) err("chart_subset", `${loc}${path}`, "transform is not allowed", "compute in SQL");
    if ("data" in node) {
      if (path !== "" ) err("chart_subset", `${loc}${path}`, "nested data is not allowed", "");
      if (!node.data || node.data.name !== "result" || Object.keys(node.data).length !== 1) err("chart_subset", `${loc}${path}.data`, "data must be exactly {\"name\": \"result\"}", "");
    }
    if ("url" in node) err("chart_subset", `${loc}${path}`, "url is not allowed", "");
    if (node.encoding) for (const [ch, enc] of Object.entries(node.encoding)) {
      if (!enc || typeof enc !== "object") continue;
      for (const bad of ["aggregate", "bin", "timeUnit"]) if (bad in enc) err("chart_subset", `${loc}${path}.encoding.${ch}`, `${bad} is not allowed`, "compute in SQL");
      if (enc.stack === "normalize") err("chart_subset", `${loc}${path}.encoding.${ch}`, "stack normalize is not allowed", "");
      if (enc.field && !cols.has(enc.field)) err("missing_column", `${loc}${path}.encoding.${ch}`, `field ${enc.field} not on ${res.id}`, "");
      if (typeof enc.value === "number" && !["opacity", "size", "strokeWidth"].includes(ch)) err("chart_subset", `${loc}${path}.encoding.${ch}`, "constant data values are not allowed", "");
    }
    for (const k of ["layer", "hconcat", "vconcat", "concat", "spec"]) if (node[k]) walk(node[k], `${path}.${k}`);
    for (const k of ["repeat", "facet"]) if (node[k]) err("chart_subset", `${loc}${path}.${k}`, `${k} is not in the initial subset`, "");
  };
  walk(spec, "");
}

const SECTIONS = ["Answer", "Decision it informs", "Evidence", "How we checked", "What would change our mind", "Appendix"];
function validateMemo(manifest, results) {
  const p = join(DIR, "memo.md");
  if (!existsSync(p)) return err("missing_file", "memo.md", "memo.md missing", "");
  const text = readFileSync(p, "utf8");
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!fm) return err("template", "memo.md:1", "front matter missing", "");
  const f = parseYaml(fm[1]);
  if (f.finding !== manifest.finding.id || f.revision !== manifest.finding.revision) err("template", "memo.md:1", "front matter finding/revision differ from manifest", "");
  const lines = text.split("\n");
  const h2 = lines.map((l, i) => [l, i + 1]).filter(([l]) => /^## /.test(l)).map(([l, i]) => [l.replace(/^## /, "").trim(), i]);
  if (canon(h2.map((x) => x[0])) !== canon(SECTIONS)) err("template", "memo.md", `sections are [${h2.map((x) => x[0]).join(", ")}], need [${SECTIONS.join(", ")}] in order`, "");
  const section = (name) => { const i = h2.findIndex((x) => x[0] === name); if (i < 0) return ""; const start = h2[i][1]; const end = i + 1 < h2.length ? h2[i + 1][1] - 1 : lines.length; return lines.slice(start, end).join("\n"); };
  // Claim subsections
  const ev = section("Evidence");
  const subs = [...ev.matchAll(/^### (.*?)\s*<!-- claim: ([a-z0-9_]+) -->\s*$/gm)];
  const seen = new Map();
  for (const m of subs) { seen.set(m[2], (seen.get(m[2]) || 0) + 1); const cl = manifest.claims.find((c) => c.id === m[2]); if (!cl) err("template", "memo.md", `Evidence subsection names unknown Claim ${m[2]}`, ""); else if (m[1].trim() !== cl.sentence.trim()) err("template", "memo.md", `heading for ${m[2]} differs from the Claim sentence`, "copy the sentence exactly, tokens included"); }
  for (const cl of manifest.claims) { const n = seen.get(cl.id) || 0; if (n !== 1) err("template", "memo.md", `Claim ${cl.id} has ${n} Evidence subsections, need exactly 1`, ""); }
  const evHeadings = [...ev.matchAll(/^### /gm)].length; if (evHeadings !== subs.length) err("template", "memo.md", "an Evidence subsection lacks a <!-- claim: id --> marker", "");
  // chart/table markers inside owning subsection
  for (const cl of manifest.claims) {
    const re = new RegExp(`^### .*<!-- claim: ${cl.id} -->[\\s\\S]*?(?=^### |$(?![\\s\\S]))`, "m");
    const body = (ev.match(re) || [""])[0];
    for (const ch of cl.chart_ids || []) if (!body.includes(`<!-- chart: ${ch} -->`)) err("template", "memo.md", `chart marker for ${ch} missing in Claim ${cl.id}`, "");
    for (const t of cl.table_ids || []) if (!body.includes(`<!-- table: ${t} -->`)) err("template", "memo.md", `table marker for ${t} missing in Claim ${cl.id}`, "");
    if (cl.numeric && !(cl.chart_ids?.length || cl.table_ids?.length)) err("template", "memo.md", `numeric Claim ${cl.id} has no chart or table`, "");
  }
  for (const m of text.matchAll(/<!-- (chart|table): ([a-z0-9_]+) -->/g)) if (!manifest[m[1] + "s"].some((x) => x.id === m[2])) err("unresolved_reference", "memo.md", `${m[1]} ${m[2]} not in manifest`, "");
  // material caveat
  const ans = section("Answer");
  const ab = manifest.claims.find((c) => c.answer_bearing);
  if (ab) { const mc = /<!-- material_caveat -->\s*([\s\S]*?)(?:\n\n|$)/.exec(ans); if (!mc) err("template", "memo.md", "Answer lacks the <!-- material_caveat --> marker", ""); else if (mc[1].trim() !== ab.material_caveat.trim()) err("template", "memo.md", "material caveat text differs from the answer-bearing Claim's material_caveat", "copy it exactly"); }
  // tokens + numerals
  const idSet = new Set([manifest.finding.id, manifest.question.id, manifest.snapshot.id, ...manifest.claims.map((c) => c.id), ...manifest.results.map((r) => r.id), ...manifest.checks.map((c) => c.id), ...manifest.queries.map((q) => q.id), ...manifest.executions.map((e) => e.id), ...manifest.definitions.map((d) => d.id), ...manifest.derived.map((d) => d.id), ...manifest.external_sources.map((d) => d.id), ...manifest.charts.map((d) => d.id), ...manifest.tables.map((d) => d.id), ...manifest.snapshot.inputs.map((d) => d.id)]);
  let literals = 0;
  lines.forEach((line, i) => {
    if (i < fm[0].split("\n").length - 1) return;
    for (const m of line.matchAll(TOKEN_RE)) { if (m[1] === "literal") literals++; else resolveValueRef(manifest, m[1] + ":" + m[2], `memo.md:${i + 1}`, results); }
    let s = line.replace(TOKEN_RE, " ").replace(/<!--.*?-->/g, " ").replace(/[0-9]{4}-[0-9]{2}-[0-9]{2}(T[0-9:.]+(Z|[+-][0-9:]+)?)?/g, " ").replace(/^#+\s*[0-9]+\.\s/, "# ").replace(/\bv[0-9]+\b/g, " ");
    for (const id of idSet) s = s.split(id).join(" ");
    s = s.replace(/\b[a-z0-9_/-]*\.(sql|json|csv|md|yaml|html|svg)\b/g, " ");
    const m = /[0-9]/.exec(s);
    if (m) err("untraced_numeral", `memo.md:${i + 1}:${m.index + 1}`, `numeral without a reference: "${line.trim().slice(0, 80)}"`, "insert a {{ref:…}}, {{derived:…}} or {{ext:…}} token, spell the quantity as a word, or mark a parameter {{literal:…}}");
  });
  if (literals) report.info.push(`${literals} literal token(s) in memo.md; method review reads each`);
  for (const m of text.matchAll(/PRIVATE_FIXTURE_MARKER_DO_NOT_RENDER/g)) void m;
}

function finish(manifest, summary) {
  const out = { finding: `${manifest.finding.id} r${manifest.finding.revision}`, state: manifest.finding.state, outcome: manifest.finding.outcome, ...(summary || {}), errors: report.errors, warnings: report.warnings, info: report.info };
  console.log(JSON.stringify(out, null, 2));
  process.exit(report.errors.length ? 1 : 0);
}

if (cmd === "build") await build(); else if (cmd === "validate") await validate(); else { console.error("unknown command"); process.exit(2); }
