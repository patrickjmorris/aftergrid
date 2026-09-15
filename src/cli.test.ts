import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { newFinding } from "./commands/new-finding.ts";
import { check } from "./commands/check.ts";
import { FINDING_ID_RE, toId } from "./ids.ts";
import { canon, contentDigest } from "./digest.ts";

function scratchInstance(): string {
  const root = mkdtempSync(join(tmpdir(), "ag-"));
  writeFileSync(join(root, "aftergrid.yaml"), "schema_version: 0.1.0\ninstance_root: analytics\nowner: { name: Test Owner, contact: owner@example.test }\npublication: { repository: example/inst }\n");
  writeFileSync(join(root, "readers.md"), "# Readers\n\n## product_owner\n```yaml\nid: product_owner\n```\n");
  mkdirSync(join(root, "findings"));
  return root;
}
const fixed = () => new Date("2026-09-15T12:00:00Z");

test("new finding creates an incomplete draft with fresh ids and refuses to overwrite", () => {
  const root = scratchInstance();
  const r1 = newFinding({ slug: "first-question", ask: "why?", instanceDir: root, now: fixed });
  assert.equal(r1.errors.length, 0);
  assert.equal(r1.content, "incomplete");
  assert.equal(r1.readiness, "not_ready");
  const dir = join(root, "findings", "2026-09-15-first-question");
  assert.ok(existsSync(join(dir, "manifest.yaml")));
  const m = parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8"));
  assert.match(m.finding.id, FINDING_ID_RE);
  assert.equal(m.finding.state, "draft"); assert.equal(m.finding.outcome, "pending");
  assert.equal(m.question.state, "unresolved"); assert.equal(m.question.falsifier, undefined);
  assert.equal(m.claims.length, 0); assert.equal(m.attestations.length, 0);
  const r2 = newFinding({ slug: "first-question", ask: "again", instanceDir: root, now: fixed });
  assert.equal(r2.errors[0]?.category, "exists");
  assert.equal(parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8")).finding.id, m.finding.id, "existing draft untouched");
  const r3 = newFinding({ slug: "second-question", instanceDir: root, now: fixed });
  const m3 = parseYaml(readFileSync(join(root, "findings", "2026-09-15-second-question", "manifest.yaml"), "utf8"));
  assert.notEqual(m3.finding.id, m.finding.id, "ids are unique");
  assert.equal(r3.errors.length, 0);
});

test("new finding rejects bad slugs and unknown reader profiles", () => {
  const root = scratchInstance();
  assert.equal(newFinding({ slug: "Bad Slug", instanceDir: root }).errors[0]?.category, "syntax");
  assert.equal(newFinding({ slug: "ok-slug", reader: "nobody", instanceDir: root }).errors[0]?.category, "unresolved_reference");
  assert.equal(newFinding({ slug: "ok-slug", reader: "product_owner", instanceDir: root, now: fixed }).errors.length, 0);
});

test("check on a fresh draft: schema ok, incomplete, evidence not evaluated, not ready, no invented approval", () => {
  const root = scratchInstance();
  newFinding({ slug: "draft-q", instanceDir: root, now: fixed });
  const r = check({ dir: join(root, "findings", "2026-09-15-draft-q") });
  assert.equal(r.syntax, "ok");
  assert.equal(r.content, "incomplete");
  assert.equal(r.evidence, "not_evaluated");
  assert.equal(r.sql_execution, "not_performed");
  assert.equal(r.readiness, "not_ready");
  assert.ok(r.warnings.some((w) => w.category === "incomplete" && /no Claims/.test(w.message)));
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
});

test("check detects a digest that no longer matches after an edit", () => {
  const root = scratchInstance();
  newFinding({ slug: "edited-q", instanceDir: root, now: fixed });
  const dir = join(root, "findings", "2026-09-15-edited-q");
  writeFileSync(join(dir, "memo.md"), readFileSync(join(dir, "memo.md"), "utf8") + "\nEdited.\n");
  const r = check({ dir });
  assert.ok(r.errors.some((e) => e.category === "digest"));
});

test("check rejects an escaping evidence path with category unsafe_path", () => {
  const root = scratchInstance();
  newFinding({ slug: "escape-q", instanceDir: root, now: fixed });
  const dir = join(root, "findings", "2026-09-15-escape-q");
  const m = parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8"));
  m.queries.push({ id: "q", path: "../../aftergrid.yaml", dialect: "duckdb", content_hash: { algorithm: "sha256", value: "0".repeat(64) } });
  writeFileSync(join(dir, "manifest.yaml"), JSON.stringify(m));
  const r = check({ dir });
  assert.ok(r.errors.some((e) => e.category === "unsafe_path" || e.category === "schema"), JSON.stringify(r.errors));
});

test("check reports schema errors with locations", () => {
  const root = scratchInstance();
  newFinding({ slug: "broken-q", instanceDir: root, now: fixed });
  const dir = join(root, "findings", "2026-09-15-broken-q");
  writeFileSync(join(dir, "manifest.yaml"), readFileSync(join(dir, "manifest.yaml"), "utf8").replace("state: draft", "state: complete"));
  const r = check({ dir });
  assert.equal(r.syntax, "invalid");
  assert.ok(r.errors.every((e) => e.category === "schema" && e.location.startsWith("manifest.yaml#")));
});

test("digest is order-independent and matches the contract shape", () => {
  assert.equal(canon({ b: 1, a: [2, { d: null, c: "x" }] }), '{"a":[2,{"c":"x","d":null}],"b":1}');
  const m: any = { finding: {}, snapshot: {}, executions: [], checks: [], queries: [], charts: [], results: [], attestations: [1], reviews: [2] };
  const files = () => Buffer.from("memo");
  const passthrough = (root: string, rel: string) => root + "/" + rel;
  const d1 = contentDigest(m, "/x", files, passthrough); const d2 = contentDigest({ ...m, attestations: [] }, "/x", files, passthrough);
  assert.equal(d1.value, d2.value, "attestations excluded from digest");
  assert.equal(toId("Why did it Drop?!"), "why_did_it_drop");
});

test("exemplar fixtures pass check syntax and are complete but never ready", () => {
  for (const f of ["2026-07-20-onboarding-checklist-retention", "2026-09-15-price-change-cancellations"]) {
    const r = check({ dir: new URL(`../fixtures/instance/analytics/findings/${f}/`, import.meta.url).pathname });
    assert.equal(r.syntax, "ok", JSON.stringify(r.errors));
    assert.equal(r.content, "complete");
    assert.equal(r.readiness, "not_ready");
  }
});
