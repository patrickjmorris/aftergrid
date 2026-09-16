// ag-review-analyze-golden-4ka: the golden eval runner, and the review record it depends on.
//
// Seam: `runEval` in, a report and run records out. The model-in-the-loop half cannot run here — no model runs
// in this suite — so the fixture analyzer replays recorded Findings and the command analyzer is asserted to be
// what it is: not exercised.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as toYaml } from "yaml";
import { contentDigest } from "./digest.ts";
import { decideHalt, recordReview, reviewStatus, type ReviewEntry } from "./commands/review.ts";
import { createCommandAnalyzer, createFixtureAnalyzer, loadGoldens, normalisePhrase, resolveWarehouse, runEval, type Analyzer } from "./eval/runner.ts";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const INSTANCE = join(REPO, "fixtures", "instance", "analytics");
const RETENTION = join(INSTANCE, "findings", "2026-07-20-onboarding-checklist-retention");
const PRICE = join(INSTANCE, "findings", "2026-09-15-price-change-cancellations");
/** Goldens with a recorded run under fixtures/runs; every other case has no analyzer and is `not_run`. */
const RECORDED = ["onboarding_checklist_retention", "price_change_cancellations"];

const temp = () => mkdtempSync(join(tmpdir(), "aftergrid-eval-test-"));
const copyFinding = (source: string): string => {
  const dir = join(temp(), "finding");
  cpSync(source, dir, { recursive: true });
  return dir;
};
const manifestOf = (dir: string): any => parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8"));

/* ------------------------------------------------------------------ the eval runner */

test("every Golden Question runs, the two recorded runs meet every expectation, and the rest are recorded not run", async () => {
  const out = join(temp(), "records");
  const report = await runEval({ golden: "all", analyzer: "fixture", outDir: out, sha: "0".repeat(40) });

  const goldens = loadGoldens(INSTANCE);
  assert.equal(report.cases.length, goldens.length, "every Golden Question is a case");
  assert.equal(report.command, "eval");
  assert.equal(report.readiness, "unknown");
  assert.ok(report.readiness_reasons.some((r) => /never approves/.test(r)), "an eval says out loud that it approves nothing");

  for (const id of RECORDED) {
    const record = report.cases.find((c) => c.case === id)!;
    assert.ok(record, `${id} has a record`);
    assert.equal(record.outcome, "pass", `${id}: ${record.reason}`);
    assert.equal(record.failure_category, null);
    assert.ok(record.assertions.some((a) => a.id === "outcome" && a.status === "pass"), `${id} asserts the outcome`);
    assert.ok(record.assertions.some((a) => a.id === "reference_values" && a.status === "pass"), `${id} recomputes its reference values from the warehouse`);
    assert.ok(record.assertions.some((a) => a.id.startsWith("value:") && a.status === "pass"), `${id} finds its expected values in the saved results`);
    assert.ok(record.assertions.some((a) => a.id === "claim_type" && a.status === "pass"), `${id} asserts the claim type`);
    assert.equal(record.model, null, "no model ran, so the model id is null rather than a guess");
    assert.deepEqual(record.cost, { input_tokens: null, output_tokens: null, usd: null }, "unknown cost is null, never zero");
    assert.equal(record.git_sha, "0".repeat(40));
    assert.equal(record.aftergrid_version, "0.0.0");
  }

  for (const record of report.cases.filter((c) => !RECORDED.includes(c.case))) {
    assert.equal(record.outcome, "not_run", `${record.case} has no recorded run`);
    assert.equal(record.failure_category, null, "a case with no analyzer is not a failure");
    assert.match(record.reason, /no recorded run/);
  }

  const dir = join(out, "0".repeat(40));
  assert.ok(existsSync(join(dir, "summary.json")));
  for (const g of goldens) assert.ok(existsSync(join(dir, `${g.id}.json`)), `${g.id}.json was written`);
  const summary = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
  assert.equal(summary.totals.pass, RECORDED.length);
  assert.equal(summary.totals.fail, 0);
  assert.equal(summary.totals.not_run, goldens.length - RECORDED.length);
  assert.deepEqual(summary.not_exercised, [], "the fixture analyzer is exercised");
  assert.ok(Object.hasOwn(summary.cases[0], "failure_category"));
});

test("an output that answers where the Golden Question expects an abstention fails as analytical, not infrastructure", async () => {
  const runs = temp();
  const output = join(runs, "price_change_cancellations", "output");
  cpSync(PRICE, output, { recursive: true });
  const manifest = manifestOf(output);
  manifest.finding.outcome = "answered";
  manifest.content_digest = contentDigest(manifest, output);
  writeFileSync(join(output, "manifest.yaml"), toYaml(manifest, { lineWidth: 0 }));

  const report = await runEval({ golden: "price_change_cancellations", analyzer: "fixture", fixtureRoot: runs, sha: "deadbeef" });
  const record = report.cases[0]!;
  assert.equal(record.outcome, "fail");
  assert.equal(record.failure_category, "analytical", "a wrong answer is an analytical failure");
  const outcome = record.assertions.find((a) => a.id === "outcome")!;
  assert.equal(outcome.status, "fail");
  assert.equal(outcome.expected, "outcome insufficient_data");
  assert.equal(outcome.observed, "outcome answered");
  assert.ok(record.assertions.some((a) => a.id === "reference_values" && a.status === "pass"), "the machinery still worked: only the Analysis was wrong");
  assert.ok(report.errors.some((e) => e.category === "eval_case_failed"), JSON.stringify(report.errors));
  assert.ok(!report.errors.some((e) => e.category === "eval_infrastructure"));
});

test("an analyzer that throws is recorded as infrastructure and judges nothing about the Analysis", async () => {
  const thrower: Analyzer = {
    name: "thrower",
    exercised: true,
    async analyze() { throw new Error("the model connection dropped"); },
  };
  const report = await runEval({ golden: "referral_campaign", analyzerImpl: thrower, sha: "cafe" });
  const record = report.cases[0]!;
  assert.equal(record.outcome, "error");
  assert.equal(record.failure_category, "infrastructure");
  assert.match(record.reason, /the analyzer threw: the model connection dropped/);
  assert.deepEqual(record.assertions, [], "nothing was asserted, so nothing is claimed about the Analysis");
  assert.ok(report.errors.some((e) => e.category === "eval_infrastructure" && /says nothing about the Analysis/.test(e.remedy ?? "")));
});

test("an unknown golden id is refused with the ids that exist, and the command analyzer is reported not exercised", async () => {
  const unknown = await runEval({ golden: "no_such_question", analyzer: "fixture" });
  assert.equal(unknown.cases.length, 0);
  const problem = unknown.errors.find((e) => e.category === "unresolved_reference")!;
  assert.ok(problem, JSON.stringify(unknown.errors));
  assert.match(problem.remedy!, /onboarding_checklist_retention/);

  assert.equal(createCommandAnalyzer({ command: "true" }).exercised, false, "no test runs a real analyzer command");
  assert.equal(createFixtureAnalyzer().exercised, true);

  const missingCommand = await runEval({ golden: "referral_campaign", analyzer: "command" });
  assert.ok(missingCommand.errors.some((e) => e.location === "--analyzer-command"));
});

test("the fixture Instance's warehouse resolves, so reference values are recomputed rather than assumed", () => {
  const warehouse = resolveWarehouse(INSTANCE);
  assert.ok("path" in warehouse, JSON.stringify(warehouse));
  assert.ok(readdirSync(warehouse.path).some((f) => f.endsWith(".csv")));
  assert.equal(normalisePhrase("Report 56 opens!"), "report 56 opens");
});

/* ------------------------------------------------------------------ review record */

test("a review records against the digest the files hash to, writes no attestation, and is idempotent", () => {
  const dir = copyFinding(RETENTION);
  const before = manifestOf(dir);
  const attestationsBefore = before.attestations;

  const report = recordReview({
    dir, kind: "question", reviewer: "agent:claude-fable-5-1",
    blocking: [], nonBlocking: ["the pre-registered comparison is honoured"], date: "2026-09-16",
  });
  assert.deepEqual(report.errors, [], JSON.stringify(report.errors));
  assert.equal(report.command, "review");
  assert.equal(report.readiness, "unknown", "recording a review says nothing about publication readiness");

  const after = manifestOf(dir);
  const added: ReviewEntry = after.reviews.find((r: ReviewEntry) => r.kind === "question");
  assert.ok(added, "the review was appended");
  assert.equal(added.reviewer, "agent:claude-fable-5-1");
  assert.equal(added.date, "2026-09-16");
  assert.equal(added.content_digest.value, after.content_digest.value, "the review binds to the current digest");
  assert.deepEqual(after.attestations, attestationsBefore, "an agent review never touches attestations");
  assert.equal(after.content_digest.value, before.content_digest.value, "reviews are outside the digest envelope, so recording one does not invalidate the others");

  const again = recordReview({ dir, kind: "question", reviewer: "agent:claude-fable-5-1", nonBlocking: ["different words"], date: "2026-09-17" });
  assert.deepEqual(again.errors, []);
  assert.equal(manifestOf(dir).reviews.filter((r: ReviewEntry) => r.kind === "question").length, 1, "the same reviewer at the same digest is recorded once");
  assert.ok(again.info.some((i) => /already recorded/.test(i)));
});

test("a review is refused when the files no longer hash to the pinned digest, and nothing is written", () => {
  const dir = copyFinding(RETENTION);
  writeFileSync(join(dir, "memo.md"), readFileSync(join(dir, "memo.md"), "utf8") + "\nAn edit nobody reviewed.\n");
  const reviewsBefore = manifestOf(dir).reviews.length;

  const report = recordReview({ dir, kind: "method", reviewer: "agent:claude-fable-5-1", date: "2026-09-16" });
  const problem = report.errors.find((e) => e.category === "digest")!;
  assert.ok(problem, JSON.stringify(report.errors));
  assert.match(problem.message, /is not what the files hash to/);
  assert.equal(manifestOf(dir).reviews.length, reviewsBefore, "a refused review writes nothing");

  const status = reviewStatus({ dir });
  assert.ok(status.warnings.some((w) => w.category === "digest"));
  assert.equal(status.decision.next, "halt");
});

test("a review with no reviewer, an unknown kind or a bad date is refused before anything is written", () => {
  const dir = copyFinding(RETENTION);
  const reviewsBefore = manifestOf(dir).reviews.length;
  for (const opts of [
    { dir, kind: "method" as const, reviewer: "  " },
    { dir, kind: "sniff" as never, reviewer: "agent:x" },
    { dir, kind: "method" as const, reviewer: "agent:x", date: "yesterday" },
  ]) {
    const report = recordReview(opts);
    assert.ok(report.errors.length, `expected a refusal for ${JSON.stringify(opts.kind)}`);
  }
  assert.equal(manifestOf(dir).reviews.length, reviewsBefore);
});

/* ------------------------------------------------------------------ halt or continue */

const review = (kind: ReviewEntry["kind"], blocking: string[], digest = "abc"): ReviewEntry => ({
  kind, reviewer: `agent:test/${kind}`, date: "2026-09-16",
  content_digest: { algorithm: "sha256", value: digest }, blocking, non_blocking: [],
});

test("blocking review findings halt /analyze; clean current reviews continue", () => {
  const clean = [review("method", []), review("question", []), review("reader", [])];

  const go = decideHalt({ reviews: clean, currentDigest: "abc" });
  assert.equal(go.next, "continue");
  assert.equal(go.state, "complete");
  assert.equal(go.reason, "evidence-valid draft reviewed by agents, awaiting human publication readiness");

  const blocked = decideHalt({ reviews: [review("method", ["the denominator changes between the two arms"]), review("question", []), review("reader", [])], currentDigest: "abc" });
  assert.equal(blocked.next, "halt");
  assert.equal(blocked.state, "needs_attention");
  assert.match(blocked.reason, /1 blocking finding\(s\) from method/);
  assert.deepEqual(blocked.blocking[0]!.items, ["the denominator changes between the two arms"]);

  const stale = decideHalt({ reviews: [review("method", [], "old"), review("question", []), review("reader", [])], currentDigest: "abc" });
  assert.equal(stale.next, "halt", "a review of older content is not a review of this one");
  assert.deepEqual(stale.missing_kinds, ["method"]);
  assert.equal(stale.stale.length, 1);

  const broken = decideHalt({ reviews: clean, currentDigest: "abc", checkErrors: [{ category: "check_error", location: "checks/unique_users.sql", message: "syntax error" }] });
  assert.equal(broken.next, "halt");
  assert.match(broken.reason, /a broken execution is not an analytical result/);
});

test("insufficient evidence with clean reviews continues: too little data is an answer, not a failure", () => {
  const dir = copyFinding(PRICE);
  const manifest = manifestOf(dir);
  assert.equal(manifest.finding.outcome, "insufficient_data");
  const current = contentDigest(manifest, dir).value;
  const decision = decideHalt({
    reviews: [review("method", [], current), review("question", [], current), review("reader", [], current)],
    currentDigest: current,
  });
  assert.equal(decision.next, "continue", "an insufficient-data Finding with clean reviews is a completed Analysis");
});
