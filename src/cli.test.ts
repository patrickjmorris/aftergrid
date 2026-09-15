import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync, cpSync, rmSync, symlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { newFinding } from "./commands/new-finding.ts";
import { check } from "./commands/check.ts";
import { FINDING_ID_RE, toId } from "./ids.ts";
import { exitCodeFor } from "./report.ts";
import { canon, contentDigest, sha256 } from "./digest.ts";
// @ts-ignore: shared ESM validation library.
import { digestOf } from "../scripts/lib/validate-finding.mjs";
import { stringify as toYaml } from "yaml";

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

test("check on a fresh draft: schema ok, incomplete, evidence valid for what exists, not ready, no invented approval", () => {
  const root = scratchInstance();
  newFinding({ slug: "draft-q", instanceDir: root, now: fixed });
  const r = check({ dir: join(root, "findings", "2026-09-15-draft-q") });
  assert.equal(r.syntax, "ok");
  assert.equal(r.content, "incomplete");
  assert.equal(r.evidence, "valid", JSON.stringify(r.errors));
  assert.equal(r.sql_execution, "not_performed");
  assert.equal(r.readiness, "not_ready");
  assert.ok(r.readiness_reasons.includes("not complete"));
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

test("exemplar fixtures pass check: complete, evidence valid, never ready, SQL not executed", () => {
  for (const f of ["2026-07-20-onboarding-checklist-retention", "2026-09-15-price-change-cancellations"]) {
    const r = check({ dir: fileURLToPath(new URL(`../fixtures/instance/analytics/findings/${f}/`, import.meta.url)) });
    assert.equal(r.syntax, "ok", JSON.stringify(r.errors));
    assert.equal(r.content, "complete");
    assert.equal(r.evidence, "valid", JSON.stringify(r.errors));
    assert.equal(r.sql_execution, "not_performed");
    assert.equal(r.readiness, "not_ready");
  }
});

test("check fails an exemplar copy with a tampered result and a bad reference, with categories and locations", () => {
  const src = fileURLToPath(new URL("../fixtures/instance/", import.meta.url));
  const root = mkdtempSync(join(tmpdir(), "ag-copy-"));
  cpSync(src, root, { recursive: true });
  const dir = join(root, "analytics", "findings", "2026-07-20-onboarding-checklist-retention");
  const rp = join(dir, "results", "retention_by_arm.json");
  writeFileSync(rp, readFileSync(rp, "utf8").replace('"retained": 217', '"retained": 317'));
  writeFileSync(join(dir, "memo.md"), readFileSync(join(dir, "memo.md"), "utf8").replace("{{ref:retention_by_arm.control.retained}}", "{{ref:retention_by_arm.contrl.retained}}"));
  const r = check({ dir });
  assert.equal(r.evidence, "invalid");
  const cats = new Set(r.errors.map((e) => e.category));
  assert.ok(cats.has("hash_mismatch") && cats.has("unresolved_reference") && cats.has("digest"), [...cats].join(","));
  assert.ok(r.errors.every((e) => e.location && e.message));
});

function exemplarCopy(): string {
  const src = fileURLToPath(new URL("../fixtures/instance/", import.meta.url));
  const root = mkdtempSync(join(tmpdir(), "ag-copy-"));
  cpSync(src, root, { recursive: true });
  rmSync(join(root, "analytics", "decisions"), { recursive: true, force: true }); // copies get mutated; Decision bindings would rightly fail
  return join(root, "analytics", "findings", "2026-07-20-onboarding-checklist-retention");
}
function repin(dir: string, manifest: any) {
  for (const r of manifest.results) {
    const bytes = readFileSync(join(dir, r.path));
    r.content_hash.value = sha256(bytes);
    const ex = manifest.executions.find((e: any) => e.result_id === r.id); if (ex) ex.result_hash.value = r.content_hash.value;
  }
  manifest.content_digest = digestOf(manifest, dir);
  writeFileSync(join(dir, "manifest.yaml"), toYaml(manifest, { lineWidth: 0 }));
}

test("references resolve by row key independently of row order", () => {
  const dir = exemplarCopy();
  const rp = join(dir, "results", "retention_by_arm.json");
  const data = JSON.parse(readFileSync(rp, "utf8"));
  data.rows.reverse();
  writeFileSync(rp, JSON.stringify(data, null, 2) + "\n");
  const manifest = parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8"));
  manifest.attestations = []; // content changed, so the fixture's (untrusted) attestation would be stale; drop it in the copy
  repin(dir, manifest);
  const r = check({ dir });
  assert.equal(r.evidence, "valid", JSON.stringify(r.errors));
});

test("duplicate row keys and invalid identifier grammar fail with precise categories and locations", () => {
  const dir = exemplarCopy();
  const rp = join(dir, "results", "retention_by_arm.json");
  const data = JSON.parse(readFileSync(rp, "utf8"));
  data.rows[1].arm = "checklist"; // now two rows share the key
  writeFileSync(rp, JSON.stringify(data, null, 2) + "\n");
  const manifest = parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8"));
  repin(dir, manifest);
  const r = check({ dir });
  assert.ok(r.errors.some((e) => e.category === "duplicate_row_key" && /retention_by_arm/.test(e.location)), JSON.stringify(r.errors));

  const dir2 = exemplarCopy();
  const m2 = parseYaml(readFileSync(join(dir2, "manifest.yaml"), "utf8"));
  m2.claims[0].id = "Claim-1"; // uppercase and hyphen are outside the id grammar
  writeFileSync(join(dir2, "manifest.yaml"), toYaml(m2, { lineWidth: 0 }));
  const r2 = check({ dir: dir2 });
  assert.equal(r2.syntax, "invalid");
  assert.ok(r2.errors.some((e) => e.category === "schema" && e.location === "manifest.yaml#/claims/0/id"), JSON.stringify(r2.errors));
});

test("--mode rerun is a structured not_implemented error with exit code 3; a mode typo is a usage error", () => {
  const dir = fileURLToPath(new URL("../fixtures/instance/analytics/findings/2026-07-20-onboarding-checklist-retention/", import.meta.url));
  const r = check({ dir, mode: "rerun" });
  assert.equal(r.errors[0]?.category, "not_implemented");
  assert.equal(exitCodeFor(r), 3);
  const cli = fileURLToPath(new URL("./cli.ts", import.meta.url));
  const typo = spawnSync(process.execPath, [cli, "check", dir, "--mode", "rerunn"], { encoding: "utf8" });
  assert.equal(typo.status, 2);
  const rerun = spawnSync(process.execPath, [cli, "check", dir, "--mode", "rerun", "--json"], { encoding: "utf8" });
  assert.equal(rerun.status, 3);
  assert.equal(JSON.parse(rerun.stdout).errors[0].category, "not_implemented");
});

test("the CLI and the validator work from a relocated checkout whose path has spaces and percent signs", () => {
  const here = fileURLToPath(new URL("../", import.meta.url));
  const root = join(mkdtempSync(join(tmpdir(), "ag reloc ")), "repo %41 copy");
  mkdirSync(root, { recursive: true });
  for (const d of ["schema", "scripts", "src", "fixtures", "package.json"]) cpSync(join(here, d), join(root, d), { recursive: true });
  symlinkSync(join(here, "node_modules"), join(root, "node_modules"));
  const dir = join(root, "fixtures", "instance", "analytics", "findings", "2026-07-20-onboarding-checklist-retention");
  const r = spawnSync(process.execPath, [join(root, "src", "cli.ts"), "check", dir, "--json"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(JSON.parse(r.stdout).evidence, "valid");
});
