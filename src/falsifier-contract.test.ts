// Seam: the falsifier-outcome contract (bead ag-falsifier-outcome-cov), after the 2026-09-17 review.
//
// A falsifier decides the Finding's OUTCOME, so the one thing a reviewer needs is that the falsifier being
// reported is the falsifier that was written before the numbers existed. Three of its parts live in
// `manifest.yaml` and not in the SQL file — `expected_outcome`, `required`, and the Question's `statement` —
// so a pre-registration that pins only the SQL hash leaves flipping any of them traceless. What is asserted
// here is that the pre-registration covers all four, that the eval's own outcome lists cannot be loosened
// silently, and that `execute` says the same things about a falsifier that `check` does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as toYaml } from "yaml";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { check, checkArtifact } from "./commands/check.ts";
import { execute } from "./commands/execute.ts";
import { validateAnalysisFile } from "./analysis/validate.ts";
import { sha256 } from "./digest.ts";
import { assertCase, loadGoldens, type GoldenQuestion } from "./eval/runner.ts";
// @ts-ignore: the shared digest envelope, the one `check` verifies against.
import { digestOf } from "../scripts/lib/validate-finding.mjs";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const FIXTURE_INSTANCE = join(REPO, "fixtures/instance");
const RUNS = join(REPO, "fixtures/runs");
const EXEMPLAR = join(FIXTURE_INSTANCE, "analytics/findings/2026-07-20-onboarding-checklist-retention");
const NUMERIC = "2026-07-20-onboarding-checklist-retention";
const EXAMPLES_GOLDEN_INSTANCE = join(REPO, "examples/nyc-open-data/analytics");

const temp = (tag: string) => mkdtempSync(join(tmpdir(), `ag-fals-${tag}-`));

/**
 * A throwaway copy of the whole fixture Instance, with `decisions/` dropped: a Decision record binds to the
 * exemplar's content digest, and every case here rewrites the manifest on purpose.
 */
function copyInstance(tag: string): string {
  const root = join(temp(tag), "instance");
  cpSync(FIXTURE_INSTANCE, root, { recursive: true });
  rmSync(join(root, "analytics", "decisions"), { recursive: true, force: true });
  return root;
}

/** Rewrite the copied exemplar's manifest through `mutate`, re-pin its digest, and drop its stale trust. */
function mutateExemplar(root: string, mutate: (m: any) => void): string {
  const dir = join(root, "analytics", "findings", NUMERIC);
  const m: any = parseYaml(readFileSync(join(EXEMPLAR, "manifest.yaml"), "utf8"));
  mutate(m);
  m.attestations = [];
  m.reviews = [];
  m.content_digest = digestOf(m, dir);
  writeFileSync(join(dir, "manifest.yaml"), toYaml(m, { lineWidth: 0 }));
  return dir;
}

/* ------------------------------------------------- S1: what a pre-registration covers */

test("a pre-registration pins the falsifier's expected_outcome, required flag and statement, not only its SQL", () => {
  const dir = temp("prereg");
  const base: any = parseYaml(readFileSync(join(RUNS, "7qg-onboarding", "analysis.yaml"), "utf8"));
  const manifest: any = parseYaml(readFileSync(join(EXEMPLAR, "manifest.yaml"), "utf8"));
  const falsifier = manifest.checks.find((c: any) => c.kind === "falsifier");

  /** The entry an honest /checked-analysis writes the moment the Check file is saved. */
  const entry = (over: Record<string, unknown> = {}) => ({
    check_id: falsifier.id,
    content_hash: { ...falsifier.content_hash },
    at: "2026-07-19T09:00:00Z",
    required: falsifier.required === true,
    expected_outcome: falsifier.expected_outcome,
    statement_hash: { algorithm: "sha256", value: sha256(manifest.question.falsifier.statement) },
    ...over,
  });
  const problems = (pre: Record<string, unknown>, mutate?: (m: any) => void) => {
    const analysis = structuredClone(base);
    analysis.checks_preregistered = [pre];
    writeFileSync(join(dir, "analysis.yaml"), toYaml(analysis, { lineWidth: 0 }));
    const m = structuredClone(manifest);
    mutate?.(m);
    return validateAnalysisFile(dir, m);
  };

  assert.deepEqual(problems(entry()), [], JSON.stringify(problems(entry())));

  // THE ATTACK the SQL hash cannot see: after the result is known, flip the expected verdict on the Check and
  // on the Question together. The file on disk never moves, so a hash-only pre-registration still agrees.
  const flipped = problems(entry(), (m) => {
    m.checks.find((c: any) => c.id === falsifier.id).expected_outcome = "fail";
    m.question.falsifier.expected_outcome = "fail";
  });
  const flip = flipped.find((p) => p.category === "analysis_contract" && /expected_outcome/.test(p.message));
  assert.ok(flip, JSON.stringify(flipped));
  assert.match(flip!.remedy ?? "", /[Nn]ever re-pin/);

  // Un-requiring, or requiring, after the fact.
  const required = problems(entry(), (m) => { m.checks.find((c: any) => c.id === falsifier.id).required = true; });
  assert.ok(required.some((p) => p.category === "analysis_contract" && /required/.test(p.message)), JSON.stringify(required));

  // Rewriting the plain-language bar the falsifier was agreed on.
  const restated = problems(entry(), (m) => { m.question.falsifier.statement = "If the arms differ at all, the checklist helped."; });
  assert.ok(restated.some((p) => p.category === "analysis_contract" && /statement/.test(p.message)), JSON.stringify(restated));

  // An entry that pins the SQL alone is not a pre-registration of a falsifier: it covers nothing that decides
  // the outcome, and saying "pre-registered" over it is the dishonest half of the claim.
  const sqlOnly = problems({ check_id: falsifier.id, content_hash: { ...falsifier.content_hash }, at: "2026-07-19T09:00:00Z" });
  assert.ok(sqlOnly.length, "an entry pinning only the SQL is refused, not accepted as a pre-registration");
  const missing = problems(entry({ expected_outcome: undefined, statement_hash: undefined }));
  assert.ok(missing.some((p) => /expected_outcome/.test(p.message)), JSON.stringify(missing));
  assert.ok(missing.some((p) => /statement/.test(p.message)), JSON.stringify(missing));

  // And the SQL hash still does its own job.
  const drifted = problems(entry({ content_hash: { algorithm: "sha256", value: "0".repeat(64) } }));
  assert.ok(drifted.some((p) => /different SQL file/.test(p.message)), JSON.stringify(drifted));
});

test("check reports a falsifier whose expected_outcome was flipped after the run, with its SQL hash still pinned", async () => {
  const root = copyInstance("flip");
  const dir = mutateExemplar(root, (m) => {
    const ck = m.checks.find((c: any) => c.kind === "falsifier");
    ck.outcome = "fail";
    ck.expected_outcome = "fail";           // the verdict, flipped to match what came back
    m.question.falsifier.expected_outcome = "fail";
  });
  // The pre-registration as it stood before the run: the same SQL file, expecting `pass`, not required.
  const pristine: any = parseYaml(readFileSync(join(EXEMPLAR, "manifest.yaml"), "utf8"));
  const f = pristine.checks.find((c: any) => c.kind === "falsifier");
  writeFileSync(join(dir, "analysis.yaml"), toYaml({
    schema_version: "0.1.0",
    stage: "clarified",
    reader_profile: "product_owner",
    assumptions: [],
    checks_preregistered: [{
      check_id: f.id,
      content_hash: { ...f.content_hash },
      at: "2026-07-19T09:00:00Z",
      required: false,
      expected_outcome: "pass",
      statement_hash: { algorithm: "sha256", value: sha256(pristine.question.falsifier.statement) },
    }],
  }, { lineWidth: 0 }));

  const report = await check({ dir, github: null });
  const flip = report.errors.find((e) => e.category === "analysis_contract" && e.location === "analysis.yaml#/checks_preregistered/0/expected_outcome");
  assert.ok(flip, JSON.stringify(report.errors));
  assert.match(flip!.message, /expected_outcome/);
  assert.match(flip!.remedy ?? "", /[Nn]ever re-pin/);
  assert.equal(report.evidence, "invalid", "a falsifier re-aimed after its result is not valid evidence");
});

/* ------------------------------------------------- S2: the eval's outcome lists */

test("a golden's list of acceptable outcomes is gated on falsifier_dependent, in the schema and in assess", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(JSON.parse(readFileSync(join(REPO, "schema/golden-question.schema.json"), "utf8")));
  const demoPath = join(EXAMPLES_GOLDEN_INSTANCE, "golden/crz_trips_jan2025_vs_jan2024.yaml");
  const demo: any = parseYaml(readFileSync(demoPath, "utf8"));

  assert.ok(validate(demo), JSON.stringify(validate.errors));
  assert.deepEqual(demo.expected.outcome, ["answered", "inconclusive"]);
  assert.equal(demo.expected.falsifier_dependent, true, "the reviewed list says why it is a list");

  const loose = structuredClone(demo);
  loose.expected.outcome = ["answered", "inconclusive", "insufficient_data", "needs_reframing"];
  delete loose.expected.falsifier_dependent;
  delete loose.expected.falsifier_note;
  assert.equal(validate(loose), false, "every outcome is not an expectation");
  assert.ok((validate.errors ?? []).some((e) => /falsifier_dependent/.test(JSON.stringify(e))), JSON.stringify(validate.errors));

  // loadGoldens validates the files it reads, and names the file and the location when one is not a reference.
  const instance = join(temp("golden"), "analytics");
  mkdirSync(join(instance, "golden"), { recursive: true });
  cpSync(demoPath, join(instance, "golden", "crz_trips_jan2025_vs_jan2024.yaml"));
  assert.equal(loadGoldens(instance).length, 1, "the demo golden still loads");
  writeFileSync(join(instance, "golden", "loosened.yaml"), toYaml(loose, { lineWidth: 0 }));
  assert.throws(() => loadGoldens(instance), (e: Error) => /loosened\.yaml/.test(e.message) && /outcome|falsifier_dependent/.test(e.message), "an invalid golden is refused with its location");

  // And assess refuses the list itself, for a golden handed to it in memory.
  const golden = { ...loose, expected: { ...loose.expected, definition_ids: [], tables_read: [], values: [] } } as unknown as GoldenQuestion;
  const manifest = { finding: { outcome: "needs_reframing" }, definitions: [], claims: [], snapshot: { inputs: [] }, checks: [], queries: [], executions: [], results: [] };
  const outcome = assertCase({ golden, manifest, dir: instance, memo: "", reference: { status: "unavailable", reason: "no warehouse" } }).find((a) => a.id === "outcome")!;
  assert.equal(outcome.status, "fail", JSON.stringify(outcome));
  assert.equal(outcome.category, "infrastructure", "a golden that is no longer a reference is a broken fixture, not a wrong Analysis");
  assert.match(outcome.expected, /falsifier_dependent/);

  // The gated list still passes, on any of its entries.
  const gated = { ...golden, expected: { ...golden.expected, outcome: ["answered", "inconclusive"], falsifier_dependent: true, falsifier_note: "the stricter falsifier makes it inconclusive" } } as unknown as GoldenQuestion;
  const ok = assertCase({ golden: gated, manifest: { ...manifest, finding: { outcome: "inconclusive" } }, dir: instance, memo: "", reference: { status: "unavailable", reason: "no warehouse" } }).find((a) => a.id === "outcome")!;
  assert.equal(ok.status, "pass", JSON.stringify(ok));
});

test("every committed Golden Question loads", () => {
  for (const instance of [join(FIXTURE_INSTANCE, "analytics"), EXAMPLES_GOLDEN_INSTANCE]) {
    const loaded = loadGoldens(instance);
    const files = readdirSync(join(instance, "golden")).filter((f) => f.endsWith(".yaml"));
    assert.equal(loaded.length, files.length, `${instance}: every golden is a reference the loader accepts`);
  }
});

/* ------------------------------------------------- S6: check says what the Analysis file records */

test("check reports the Analysis file's summary, including whether any Check was pre-registered at all", () => {
  const root = copyInstance("summary");
  const dir = mutateExemplar(root, () => undefined);

  assert.ok(!existsSync(join(dir, "analysis.yaml")), "the exemplar has no Analysis file");
  const silent = checkArtifact({ dir });
  assert.ok(!silent.info.some((i) => /^analysis\.yaml/.test(i)), "no file, nothing said about one");

  writeFileSync(join(dir, "analysis.yaml"), toYaml({
    schema_version: "0.1.0", stage: "clarified", reader_profile: "product_owner", assumptions: [],
  }, { lineWidth: 0 }));
  const summarised = checkArtifact({ dir });
  assert.ok(summarised.info.some((i) => /no Check pre-registration hashes recorded/.test(i)), JSON.stringify(summarised.info));
  assert.ok(summarised.info.some((i) => /stage clarified/.test(i)), JSON.stringify(summarised.info));
});

/* ------------------------------------------------- S7: execute says what check says */

test("execute refuses a required falsifier before running anything, and reports a fired one as a warning", async () => {
  const root = copyInstance("exec");
  const instanceRoot = join(root, "analytics");

  // (a) `required: true` on a falsifier confuses evidence validity with the outcome. `check` calls that
  // check_shape; so does execute, before a single statement runs.
  const refusedDir = mutateExemplar(root, (m) => { m.checks.find((c: any) => c.kind === "falsifier").required = true; });
  const before = readFileSync(join(refusedDir, "manifest.yaml"), "utf8");
  const refused = await execute({ dir: refusedDir, instanceDir: instanceRoot });
  assert.ok(refused.errors.some((e) => e.category === "check_shape" && e.location === "checks/falsifier_lift"), JSON.stringify(refused.errors));
  assert.ok(!refused.errors.some((e) => e.category === "check_failed"), "the shape is the complaint, not a failed Check");
  assert.equal(refused.sql_execution, "not_performed", "nothing ran");
  assert.equal(readFileSync(join(refusedDir, "manifest.yaml"), "utf8"), before, "and nothing was written");

  // (b) A falsifier that records the outcome it did not expect is an analytical fact: a `falsifier_failed`
  // warning, never an error, and never the retired `falsifier` category.
  const firedDir = mutateExemplar(root, () => undefined);
  writeFileSync(join(firedDir, "checks", "falsifier_lift.sql"), "select false as pass, 'forced to fire' as detail\n");
  const fired = await execute({ dir: firedDir, instanceDir: instanceRoot });
  assert.deepEqual(fired.errors, [], JSON.stringify(fired.errors));
  assert.equal(fired.sql_execution, "performed");
  const warning = fired.warnings.find((w) => w.location === "checks/falsifier_lift");
  assert.ok(warning, JSON.stringify(fired.warnings));
  assert.equal(warning!.category, "falsifier_failed");
  assert.ok(!fired.warnings.some((w) => w.category === "falsifier"), "the `falsifier` category is retired, not re-spelled");
  const m: any = parseYaml(readFileSync(join(firedDir, "manifest.yaml"), "utf8"));
  assert.equal(m.checks.find((c: any) => c.id === "falsifier_lift").outcome, "fail", "the outcome it recorded is written down");
});
