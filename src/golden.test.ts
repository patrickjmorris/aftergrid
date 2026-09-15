// ag-synthetic-golden-nightly-5vm: Golden Questions and the planted-effects catalogue are checked, not trusted.
// Every reference value is recomputed from the synthetic warehouse through the DuckDB adapter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { DuckDbAdapter } from "./adapters/duckdb.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const INSTANCE = join(ROOT, "fixtures", "instance");
const GOLDEN_DIR = join(INSTANCE, "analytics", "golden");
const ajv = new Ajv2020({ allErrors: true, strict: false }); addFormats(ajv);
const schema = JSON.parse(readFileSync(join(ROOT, "schema", "golden-question.schema.json"), "utf8"));
const goldens = readdirSync(GOLDEN_DIR).filter((f) => f.endsWith(".yaml")).map((f) => ({ file: f, doc: parseYaml(readFileSync(join(GOLDEN_DIR, f), "utf8")) }));
const planted = parseYaml(readFileSync(join(INSTANCE, "planted-effects.yaml"), "utf8"));
const LAYERS = new Set(["engine_category", "analytical_outcome", "review_concern"]);

test("every Golden Question validates, names an existing Reader, definitions and tables, and at least one expects abstention and one tests denominator reasoning", () => {
  assert.ok(goldens.length >= 3 && goldens.length <= 7, `${goldens.length} golden Questions`);
  const readers = readFileSync(join(INSTANCE, "analytics", "readers.md"), "utf8");
  const tables = new Set(readdirSync(join(INSTANCE, "data")).filter((f) => f.endsWith(".csv")).map((f) => f.replace(/\.csv$/, "")));
  for (const { file, doc } of goldens) {
    assert.ok(ajv.validate(schema, doc), `${file}: ${JSON.stringify(ajv.errors)}`);
    assert.equal(doc.id, file.replace(/\.yaml$/, ""));
    assert.ok(doc.reader === "generic" || new RegExp(`^## ${doc.reader}\\s*$`, "m").test(readers), `${file}: reader ${doc.reader}`);
    for (const d of doc.expected.definition_ids) assert.ok(existsSync(join(INSTANCE, "analytics", "definitions", `${d}.md`)), `${file}: definition ${d}`);
    for (const t of doc.expected.tables_read) assert.ok(tables.has(t), `${file}: table ${t}`);
    for (const pid of doc.planted ?? []) assert.ok(planted.items.some((i: any) => i.id === pid), `${file}: planted ${pid}`);
    if (doc.expected.claim_type === "causal") assert.ok(/random/i.test(doc.expected.reasoning), `${file}: a causal expectation must rest on randomised assignment`);
  }
  assert.ok(goldens.some(({ doc }) => doc.expected.outcome === "insufficient_data" || doc.expected.outcome === "needs_reframing"), "at least one expected abstention");
  assert.ok(goldens.some(({ doc }) => /denominator|baseline/i.test(doc.expected.reasoning) && (doc.expected.values ?? []).length >= 2), "at least one Question tests denominator/baseline reasoning with reference values");
});

test("the planted-effects catalogue names a layer and an expectation for every item and every referenced golden exists", () => {
  assert.equal(planted.schema_version, "0.1.0");
  const ids = new Set(goldens.map((g) => g.doc.id));
  for (const item of planted.items) {
    assert.ok(LAYERS.has(item.layer), `${item.id}: layer ${item.layer}`);
    assert.ok(item.expected && item.description && ["effect", "failure"].includes(item.kind), item.id);
    for (const g of item.golden ?? []) assert.ok(ids.has(g), `${item.id}: golden ${g} missing`);
  }
  for (const layer of LAYERS) assert.ok(planted.items.some((i: any) => i.layer === layer), `no item in layer ${layer}`);
});

test("reference values are reproduced from the warehouse within tolerance", async () => {
  const a = new DuckDbAdapter({ source: { kind: "csv_dir", path: join(INSTANCE, "data") }, estimate_cap_rows: 1e9 });
  try {
    for (const { file, doc } of goldens) {
      const results: Record<string, Record<string, any>> = {};
      for (const q of doc.reference.queries) {
        const r = await a.execute(q.sql, doc.reference.parameters ?? {});
        assert.ok(r.columns.some((c) => c.name === q.row_key), `${file}: ${q.id} lacks row_key ${q.row_key}`);
        results[q.id] = Object.fromEntries(r.rows.map((row) => [String(row[q.row_key]), row]));
      }
      for (const v of doc.expected.values ?? []) {
        const [qid, key, col] = v.reference.split(".") as [string, string, string];
        const row = results[qid]?.[key];
        assert.ok(row, `${file}: ${v.id} reference row ${qid}.${key} missing`);
        const got = row[col];
        if (v.value === null) assert.equal(got, null, `${file}: ${v.id} expected not available`);
        else if (typeof v.value === "number") assert.ok(got !== null && Math.abs(Number(got) - v.value) <= v.tolerance, `${file}: ${v.id} got ${got}, expected ${v.value} ± ${v.tolerance}`);
        else assert.equal(String(got), v.value, `${file}: ${v.id}`);
      }
    }
  } finally { await a.close(); }
});
