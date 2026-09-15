// ag-revisit-schema-rb8: Recheck policy, falsifier and Decision-record validation, with targeted failures.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, cpSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as toYaml } from "yaml";
import { check } from "./commands/check.ts";
// @ts-ignore: shared ESM validation library.
import { digestOf } from "../scripts/lib/validate-finding.mjs";

const NUMERIC = "2026-07-20-onboarding-checklist-retention";
const INSUFFICIENT = "2026-09-15-price-change-cancellations";

function copyInstance(): string {
  const root = mkdtempSync(join(tmpdir(), "ag-rb8-"));
  cpSync(fileURLToPath(new URL("../fixtures/instance/", import.meta.url)), root, { recursive: true });
  return root;
}
const PRISTINE = fileURLToPath(new URL("../fixtures/instance/analytics/findings/", import.meta.url));
function mutate(root: string, finding: string, fn: (m: any) => void, opts: { repin?: boolean } = { repin: true }) {
  const dir = join(root, "analytics", "findings", finding);
  rmSync(join(root, "analytics", "decisions"), { recursive: true, force: true }); // mutated content would rightly break Decision bindings
  const m = parseYaml(readFileSync(join(PRISTINE, finding, "manifest.yaml"), "utf8")); // always start from the pristine exemplar
  fn(m);
  if (opts.repin) { m.attestations = []; m.reviews = []; m.content_digest = digestOf(m, dir); }
  writeFileSync(join(dir, "manifest.yaml"), toYaml(m, { lineWidth: 0 }));
  return dir;
}
const cats = (r: Awaited<ReturnType<typeof check>>) => r.errors.map((e) => `${e.category}@${e.location}`);

test("representative fixtures: an automatic policy and a not-automatically-evaluable policy both validate", async () => {
  const root = copyInstance();
  for (const f of [NUMERIC, INSUFFICIENT]) {
    const r = await check({ dir: join(root, "analytics", "findings", f) });
    assert.equal(r.evidence, "valid", JSON.stringify(r.errors));
  }
  const m = parseYaml(readFileSync(join(root, "analytics", "findings", NUMERIC, "manifest.yaml"), "utf8"));
  assert.equal(m.claims[0].recheck.mode, "automatic"); assert.equal(m.claims[1].recheck.mode, "not_automatically_evaluable");
  assert.equal(m.claims[0].recheck.window_policy, "fixed_window");
});

test("missing predicate, method or units fail with schema category and path", async () => {
  const root = copyInstance();
  let dir = mutate(root, NUMERIC, (m) => { delete m.claims[0].recheck.predicate; });
  assert.ok(cats(await check({ dir })).includes("schema@manifest.yaml#/claims/0/recheck"), cats(await check({ dir })).join("\n"));
  dir = mutate(root, NUMERIC, (m) => { delete m.claims[0].recheck.method; });
  assert.ok(cats(await check({ dir })).some((c) => c.startsWith("schema@manifest.yaml#/claims/0/recheck")));
  dir = mutate(root, NUMERIC, (m) => { delete m.claims[0].recheck.predicate.unit; });
  assert.ok(cats(await check({ dir })).some((c) => c.startsWith("schema@manifest.yaml#/claims/0/recheck/predicate")));
  dir = mutate(root, NUMERIC, (m) => { m.claims[0].recheck.window_policy = "sliding"; });
  assert.ok(cats(await check({ dir })).some((c) => c.startsWith("schema@manifest.yaml#/claims/0/recheck")));
  dir = mutate(root, NUMERIC, (m) => { delete m.claims[0].recheck.minimum_data; });
  assert.ok(cats(await check({ dir })).some((c) => c.startsWith("schema@manifest.yaml#/claims/0/recheck")));
});

test("invalid or unresolved thresholds and evidence references fail with category and path", async () => {
  const root = copyInstance();
  let dir = mutate(root, NUMERIC, (m) => { m.claims[0].recheck.predicate.threshold = "ext:no_such_target"; });
  assert.ok(cats(await check({ dir })).includes("unresolved_reference@manifest.yaml#/claims/0/recheck/predicate/threshold"), cats(await check({ dir })).join("\n"));
  dir = mutate(root, NUMERIC, (m) => { m.claims[0].recheck.predicate.threshold = true; });
  assert.ok(cats(await check({ dir })).some((c) => c.startsWith("schema@manifest.yaml#/claims/0/recheck/predicate/threshold")));
  dir = mutate(root, NUMERIC, (m) => { m.claims[0].recheck.evidence[0] = "ref:retention_by_arm.nobody.retained_7d_rate"; });
  assert.ok(cats(await check({ dir })).includes("unresolved_reference@manifest.yaml#/claims/0/recheck/evidence/0"));
  dir = mutate(root, NUMERIC, (m) => { m.claims[0].recheck.predicate.operator = "within"; });
  assert.ok(cats(await check({ dir })).includes("schema@manifest.yaml#/claims/0/recheck"), "within needs tolerance and baseline");
});

test("non-evaluable policies need a reason and an owner, and are never a boolean", async () => {
  const root = copyInstance();
  let dir = mutate(root, NUMERIC, (m) => { delete m.claims[1].recheck.reason; });
  assert.ok(cats(await check({ dir })).some((c) => c.startsWith("schema@manifest.yaml#/claims/1/recheck")));
  dir = mutate(root, NUMERIC, (m) => { m.claims[1].recheck = false; });
  assert.ok(cats(await check({ dir })).some((c) => c.startsWith("schema@manifest.yaml#/claims/1/recheck")));
  dir = mutate(root, NUMERIC, (m) => { m.claims[1].recheck = { mode: "not_automatically_evaluable", reason: "x", owner: "y", evaluable: true }; });
  assert.ok(cats(await check({ dir })).some((c) => c.startsWith("schema@manifest.yaml#/claims/1/recheck")), "no extra boolean field");
});

test("the Question falsifier must reference an executable falsifier Check with matching expected outcome", async () => {
  const root = copyInstance();
  let dir = mutate(root, NUMERIC, (m) => { m.question.falsifier.check_id = "no_such_check"; });
  assert.ok(cats(await check({ dir })).includes("unresolved_reference@manifest.yaml#/question/falsifier"));
  dir = mutate(root, NUMERIC, (m) => { m.question.falsifier.check_id = "arm_balance"; });
  assert.ok(cats(await check({ dir })).includes("schema@manifest.yaml#/question/falsifier"), "must be kind falsifier");
  dir = mutate(root, NUMERIC, (m) => { m.question.falsifier.expected_outcome = "fail"; });
  assert.ok(cats(await check({ dir })).includes("schema@manifest.yaml#/question/falsifier"), "expected outcome must agree");
  dir = mutate(root, NUMERIC, (m) => { m.question.falsifier = { kind: "not_evaluable", reason: "none", owner: "x" }; });
  assert.ok(cats(await check({ dir })).some((c) => c.startsWith("schema@manifest.yaml#/question")), "a resolved Question cannot carry a not_evaluable falsifier");
});

test("a falsifier business result is distinct from an engine failure; neither runs the evaluator", async () => {
  const root = copyInstance();
  let dir = mutate(root, NUMERIC, (m) => { m.checks.find((c: any) => c.id === "falsifier_lift").outcome = "fail"; });
  let c = cats(await check({ dir }));
  assert.ok(c.includes("falsifier@checks/falsifier_lift") && !c.some((x) => x.startsWith("check_error")), c.join("\n"));
  dir = mutate(root, NUMERIC, (m) => { m.checks.find((c: any) => c.id === "falsifier_lift").outcome = "error"; });
  c = cats(await check({ dir }));
  assert.ok(c.includes("check_error@checks/falsifier_lift.sql") && !c.some((x) => x.startsWith("falsifier@")), c.join("\n"));
  const r = await check({ dir: join(root, "analytics", "findings", INSUFFICIENT) });
  assert.equal(r.sql_execution, "not_performed");
  assert.ok(r.info.some((i) => /falsifier_cancel_rate=not_run/.test(i)));
});

test("Decision records bind to an existing Finding revision, its digest, its Claim ids and its falsifier; schedules carry a timezone", async () => {
  const root = copyInstance();
  const dir = join(root, "analytics", "findings", NUMERIC);
  const decPath = join(root, "analytics", "decisions", "dec_2x7v4b9m1kqa.yaml");
  const good = parseYaml(readFileSync(decPath, "utf8"));
  assert.equal(good.revisit_when.schedule.timezone, "America/New_York");
  let r = await check({ dir });
  assert.equal(r.evidence, "valid", JSON.stringify(r.errors));
  assert.ok(r.info.some((i) => /1 Decision record/.test(i)));

  const write = (rec: any, name = "dec_2x7v4b9m1kqa") => writeFileSync(join(root, "analytics", "decisions", `${name}.yaml`), toYaml(rec));
  write({ ...good, rests_on_claims: ["c9"] });
  assert.ok(cats(await check({ dir })).includes("decision_binding@decisions/dec_2x7v4b9m1kqa.yaml#/rests_on_claims/0"));
  write({ ...good, revisit_when: { ...good.revisit_when, falsifier: { finding_id: good.finding.id, check_id: "arm_balance" } } });
  assert.ok(cats(await check({ dir })).includes("decision_binding@decisions/dec_2x7v4b9m1kqa.yaml#/revisit_when/falsifier"));
  write({ ...good, finding: { ...good.finding, revision: 7 } });
  assert.ok(cats(await check({ dir })).includes("decision_binding@decisions/dec_2x7v4b9m1kqa.yaml#/finding/revision"));
  write({ ...good, finding: { ...good.finding, content_digest: { algorithm: "sha256", value: "a".repeat(64) } } });
  assert.ok(cats(await check({ dir })).includes("decision_binding@decisions/dec_2x7v4b9m1kqa.yaml#/finding/content_digest"));
  write({ ...good, revisit_when: { schedule: { kind: "on_date", date: "2026-11-01" } } });
  assert.ok(cats(await check({ dir })).some((c) => c.startsWith("schema@decisions/dec_2x7v4b9m1kqa.yaml#/revisit_when/schedule")), "timezone required");
  write({ ...good, revisit_when: {} });
  assert.ok(cats(await check({ dir })).some((c) => c.startsWith("schema@decisions/dec_2x7v4b9m1kqa.yaml#/revisit_when")), "schedule or falsifier required");
  write(good);
  assert.equal((await check({ dir })).evidence, "valid");
  // A record for a different Finding is ignored here; a record citing an earlier revision only warns.
  mkdirSync(join(root, "analytics", "decisions"), { recursive: true });
  write({ ...good, id: "dec_other0000001", finding: { ...good.finding, id: "fnd_000000000000" } }, "dec_other0000001");
  assert.equal((await check({ dir })).evidence, "valid");
});
