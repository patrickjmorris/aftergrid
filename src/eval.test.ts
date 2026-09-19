// ag-review-analyze-golden-4ka: the golden eval runner, and the review record it depends on.
//
// Seam: `runEval` in, a report and run records out. The model-in-the-loop half cannot run here — no model runs
// in this suite — so the fixture analyzer replays recorded Findings and the command analyzer is asserted to be
// what it is: not exercised.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as toYaml } from "yaml";
import { contentDigest } from "./digest.ts";
import { DuckDbAdapter } from "./adapters/duckdb.ts";
import { checkArtifact } from "./commands/check.ts";
import { decideHalt, newestByKind, recordReview, reviewStatus, type ReviewEntry } from "./commands/review.ts";
import { emptyReport, exitCodeFor } from "./report.ts";
import {
  assertCase, createCommandAnalyzer, createFixtureAnalyzer, loadDefinitions, loadGoldens, normalizePhrase,
  resolveWarehouse, runEval, type Analyzer, type GoldenQuestion,
} from "./eval/runner.ts";

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
/** A Finding inside a throwaway copy of its whole Instance, so `aftergrid check` has something to validate against. */
const copyInstanceFinding = (slug: string): string => {
  const root = join(temp(), "instance");
  cpSync(join(REPO, "fixtures", "instance"), root, { recursive: true });
  return join(root, "analytics", "findings", slug);
};

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
    assert.ok(record.assertions.some((a) => a.id === "required_checks" && a.status === "pass"), `${id} asserts the Check kinds its constraints require`);
    assert.ok(!record.assertions.some((a) => a.id.startsWith("must_not:") && a.status === "pass"),
      `${id}: a substring screen that did not fire is not a pass`);
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

  const onboarding = report.cases.find((c) => c.case === "onboarding_checklist_retention")!;
  assert.ok(onboarding.assertions.some((a) => a.id === "definition_versions" && a.status === "pass" && /retained_7d v2 \(approved\)/.test(a.expected)),
    "the version the Finding cites is asserted, not just the id");
  assert.ok(onboarding.assertions.some((a) => a.id === "constraint:window" && a.status === "pass"));
  const price = report.cases.find((c) => c.case === "price_change_cancellations")!;
  assert.ok(price.assertions.some((a) => a.id === "constraint:data_to" && a.status === "pass"));

  assert.equal(report.sql_execution, "performed", "the recorded cases recomputed their goldens' numbers");
  assert.equal(report.content, "incomplete", "five cases reached no verdict, so the run is not a complete one");
  assert.ok(report.info.some((i) => /reached no verdict/.test(i)), JSON.stringify(report.info));
});

test("a run in which no case reached a verdict reports no SQL execution and an incomplete run", async () => {
  // `referral_campaign` has no recorded run, so the analyzer declines, nothing is assessed and no reference
  // query runs. Constructing the DuckDB adapter executes no SQL, and the report must not imply it did.
  const report = await runEval({ golden: "referral_campaign", analyzer: "fixture", sha: "beef" });
  assert.equal(report.cases.length, 1);
  assert.equal(report.cases[0]!.outcome, "not_run");
  assert.deepEqual(report.cases[0]!.assertions, []);
  assert.equal(report.sql_execution, "not_performed", "no query ran, so no execution is claimed");
  assert.equal(report.content, "incomplete");
  assert.ok(report.info.some((i) => /no reference query ran/.test(i)), JSON.stringify(report.info));
});

/* ------------------------------------------------------------------ what each assertion is a fact about */

const GOLDENS = loadGoldens(INSTANCE);
const goldenById = (id: string): GoldenQuestion => GOLDENS.find((g) => g.id === id)!;
const DEFINITIONS = loadDefinitions(INSTANCE);

/** assertCase over a recorded run, with the manifest patched however a test needs it. */
const assertRecorded = (golden: string, run: string, patch: (m: any) => void = () => {}) => {
  const dir = join(REPO, "fixtures", "runs", run, "output");
  const manifest = manifestOf(dir);
  patch(manifest);
  return assertCase({
    golden: goldenById(golden), dir, manifest,
    memo: readFileSync(join(dir, "memo.md"), "utf8"),
    reference: { status: "checked", mismatches: [] },
    definitions: DEFINITIONS,
  });
};

test("a Snapshot input's id is never taken as a table it read: only declared source tables count", () => {
  const declared = assertRecorded("onboarding_checklist_retention", "4ka-onboarding_checklist_retention");
  assert.equal(declared.find((a) => a.id === "tables_read")!.status, "pass");

  // The same Finding with its provenance removed: the ids still say `users` and `events`, and that is a name
  // the author chose, not a record of what was read.
  const undeclared = assertRecorded("onboarding_checklist_retention", "4ka-onboarding_checklist_retention", (m) => {
    for (const input of m.snapshot.inputs) delete input.source;
  });
  const tables = undeclared.find((a) => a.id === "tables_read")!;
  assert.equal(tables.status, "fail", tables.observed);
  assert.match(tables.observed, /no users, events/);
});

test("a Finding citing a superseded definition version fails, although it cites the right id", () => {
  const current = assertRecorded("onboarding_checklist_retention", "4ka-onboarding_checklist_retention");
  const ok = current.find((a) => a.id === "definition_versions")!;
  assert.equal(ok.status, "pass", ok.observed);
  assert.equal(ok.expected, "cites retained_7d v2 (approved)");

  const stale = assertRecorded("onboarding_checklist_retention", "4ka-onboarding_checklist_retention", (m) => {
    m.definitions[0].version = 1;
    m.definitions[0].lifecycle = "superseded";
  });
  assert.equal(stale.find((a) => a.id === "definitions_cited")!.status, "pass", "the id is still cited");
  const versions = stale.find((a) => a.id === "definition_versions")!;
  assert.equal(versions.status, "fail");
  assert.match(versions.observed, /retained_7d is cited at version 1, and the Instance's current version is 2/);

  const proposed = assertRecorded("onboarding_checklist_retention", "4ka-onboarding_checklist_retention", (m) => {
    m.definitions[0].lifecycle = "proposed";
  });
  assert.match(proposed.find((a) => a.id === "definition_versions")!.observed, /cited as proposed/);
});

test("a must_not screen that did not fire is not_evaluated, and two entries never collide into one id", () => {
  const recorded = assertRecorded("price_change_cancellations", "4ka-price_change_cancellations");
  const screens = recorded.filter((a) => a.id.startsWith("must_not:"));
  assert.equal(screens.length, 2, "the price golden declares two forbidden conclusions");
  assert.equal(new Set(screens.map((a) => a.id)).size, 2, "each entry has its own id");
  for (const s of screens) {
    assert.equal(s.status, "not_evaluated", `${s.id} proved nothing: ${s.observed}`);
    assert.match(s.observed, /not evidence it avoided the conclusion/);
  }

  // Two entries sharing a 40-character normalized prefix used to truncate to the same id.
  const collide: GoldenQuestion = {
    ...goldenById("price_change_cancellations"),
    expected: {
      ...goldenById("price_change_cancellations").expected,
      must_not: [
        "recommend keeping or rolling back the price for now",
        "recommend keeping or rolling back the price next quarter",
      ],
    },
  };
  const ids = assertCase({
    golden: collide, dir: join(REPO, "fixtures", "runs", "4ka-price_change_cancellations", "output"),
    manifest: manifestOf(join(REPO, "fixtures", "runs", "4ka-price_change_cancellations", "output")),
    memo: "recommend keeping or rolling back the price for now", reference: { status: "checked", mismatches: [] },
    definitions: DEFINITIONS,
  }).filter((a) => a.id.startsWith("must_not:"));
  assert.equal(new Set(ids.map((a) => a.id)).size, 2, "a shared 40-character prefix does not merge two screens");
  assert.equal(ids.filter((a) => a.status === "fail").length, 1, "the screen still fires on a memo that reproduces the wording");
});

test("the golden's constraints are asserted: required Check kinds, the Question window and the data cut-off", () => {
  const dropped = assertRecorded("onboarding_checklist_retention", "4ka-onboarding_checklist_retention", (m) => {
    m.checks = m.checks.filter((c: any) => c.kind !== "falsifier");
  });
  const checks = dropped.find((a) => a.id === "required_checks")!;
  assert.equal(checks.status, "fail", checks.observed);
  assert.match(checks.observed, /no falsifier Check/);

  const shifted = assertRecorded("onboarding_checklist_retention", "4ka-onboarding_checklist_retention", (m) => {
    m.question.window.end = "2026-07-19";
  });
  assert.equal(shifted.find((a) => a.id === "constraint:window")!.status, "fail");

  const overrun = assertRecorded("price_change_cancellations", "4ka-price_change_cancellations", (m) => {
    m.coverage.data_to = "2026-09-21";
  });
  const dataTo = overrun.find((a) => a.id === "constraint:data_to")!;
  assert.equal(dataTo.status, "fail");
  assert.equal(dataTo.expected, "data to 2026-09-14");

  // A golden that constrains nothing judges nothing, and says so rather than passing.
  const unconstrained = assertCase({
    golden: { ...goldenById("web_usage_first_week_september"), constraints: {} },
    dir: join(REPO, "fixtures", "runs", "4ka-price_change_cancellations", "output"),
    manifest: manifestOf(join(REPO, "fixtures", "runs", "4ka-price_change_cancellations", "output")),
    memo: "", reference: { status: "checked", mismatches: [] }, definitions: DEFINITIONS,
  });
  for (const id of ["constraint:window", "constraint:data_to", "required_checks"]) {
    assert.equal(unconstrained.find((a) => a.id === id)!.status, "not_evaluated", id);
  }
});

test("the onboarding golden's min_arm names the smaller arm and reproduces it exactly from the warehouse", async () => {
  const golden = goldenById("onboarding_checklist_retention");
  const minArm = golden.expected.values!.find((v) => v.id === "min_arm")!;
  const query = golden.reference.queries.find((q) => q.id === minArm.reference.split(".")[0])!;

  const adapter = new DuckDbAdapter({ source: { kind: "csv_dir", path: join(INSTANCE, "..", "data") }, estimate_cap_rows: 1e9 });
  let rows: any[];
  try { rows = (await adapter.execute(query.sql, (golden.reference.parameters ?? {}) as any)).rows; }
  finally { await adapter.close(); }

  const signups = rows.map((r) => ({ arm: String(r[query.row_key]), signups: Number(r.signups) }));
  const smallest = signups.reduce((a, b) => (b.signups < a.signups ? b : a));
  assert.equal(minArm.reference, `${query.id}.${smallest.arm}.signups`, "min_arm must name the arm that is actually smaller");
  assert.equal(minArm.value, smallest.signups, "the declared value is the number the warehouse produces");
  assert.equal(minArm.tolerance, 0, "a signup count is exact; a tolerance here would absorb an error instead of expressing slack");
  assert.ok(signups.every((s) => s.signups > 500), "the note's premise — both arms above 500 — holds");
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
  assert.equal(normalizePhrase("Report 56 opens!"), "report 56 opens");
});

/* ------------------------------------------------------------------ review record */

test("a review records against the digest the files hash to, writes no attestation, and is idempotent", () => {
  const dir = copyFinding(RETENTION);
  const before = manifestOf(dir);
  const attestationsBefore = before.attestations;

  const report = recordReview({
    dir, kind: "question", reviewer: "agent:claude-fable-5-1",
    blocking: [], nonBlocking: ["the pre-registered comparison is honored"], date: "2026-09-16",
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

  const checked = decideHalt({ reviews: clean, currentDigest: "abc", checkErrors: [] });
  assert.equal(checked.next, "continue");
  assert.equal(checked.state, "complete");
  assert.equal(checked.reason, "evidence-valid draft reviewed by agents, awaiting human publication readiness",
    "a check ran and found nothing, so the draft may be called evidence-valid");

  const go = decideHalt({ reviews: clean, currentDigest: "abc" });
  assert.equal(go.next, "continue");
  assert.equal(go.state, "complete");
  assert.doesNotMatch(go.reason, /evidence-valid/, "with no check supplied, nothing may claim the evidence is valid");
  assert.match(go.reason, /no check ran here/);

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

test("review status runs the artifact check, so a Finding whose evidence is broken halts instead of continuing", () => {
  const dir = copyInstanceFinding("2026-07-20-onboarding-checklist-retention");
  const manifest = manifestOf(dir);
  const digest = contentDigest(manifest, dir).value;
  for (const kind of ["method", "question", "reader"] as const) {
    const report = recordReview({ dir, kind, reviewer: `agent:test/${kind}`, date: "2026-09-16" });
    assert.deepEqual(report.errors, [], JSON.stringify(report.errors));
  }

  const clean = reviewStatus({ dir });
  assert.equal(clean.decision.next, "continue", JSON.stringify(clean.decision));
  assert.equal(clean.decision.reason, "evidence-valid draft reviewed by agents, awaiting human publication readiness");
  assert.equal(clean.evidence, "valid", "the command that says evidence-valid is the one that checked");
  assert.deepEqual(clean.errors, [], JSON.stringify(clean.errors));

  // A result file the manifest names, deleted. The reviews stay clean and current; the evidence does not.
  rmSync(join(dir, "results", "retention_by_arm.json"));
  const broken = reviewStatus({ dir });
  assert.equal(broken.decision.next, "halt", JSON.stringify(broken.decision));
  assert.equal(broken.decision.state, "needs_attention");
  assert.match(broken.decision.reason, /a broken execution is not an analytical result/);
  assert.doesNotMatch(broken.decision.reason, /evidence-valid/);
  assert.equal(broken.evidence, "invalid");
  assert.ok(broken.errors.length, "the check errors travel into the report, so the command does not exit clean");
  assert.deepEqual(broken.decision.missing_kinds, [], "the reviews really are current: only the evidence broke");
  assert.equal(manifestOf(dir).content_digest.value, digest, "review status writes nothing");
});

test("review status reports the halt decision from the check it actually ran, not from a check it assumed", () => {
  const dir = copyFinding(PRICE);
  const fake = () => { const r = emptyReport("check"); r.evidence = "invalid"; r.errors.push({ category: "check_error", location: "checks/minimum_data.sql", message: "the Check did not run" }); return r; };
  const report = reviewStatus({ dir, checkImpl: fake });
  assert.equal(report.decision.next, "halt");
  assert.match(report.decision.reason, /check_error at checks\/minimum_data\.sql/);
  assert.equal(report.evidence, "invalid");
  assert.equal(report.sql_execution, "not_performed", "the artifact check executes no SQL and the report says so");
});

/* ------------------------------------------------------------------ ag-analyze-review-last-oko */

// The chain ends with `review status`, so `review status` has to answer in the exit code as well as in prose.
// Citi Bike runs 2 and 3 (`examples/nyc-open-data/docs/run-log.md`): a headless run read "halt" in a note,
// exited 0, and reported the Finding as reviewed; and an Operator read a trio of superseded reviews as "all
// reviews stale" and spent a run redoing reviews that `review record` could not have written.

/**
 * A copy of the onboarding exemplar with its own hand review dropped, so a test that counts reviews counts
 * only the ones it recorded. Reviews are outside the content digest, so removing them re-pins nothing.
 */
function findingWithoutReviews(): string {
  const dir = copyInstanceFinding("2026-07-20-onboarding-checklist-retention");
  const manifest = manifestOf(dir);
  const digest = manifest.content_digest.value;
  manifest.reviews = [];
  writeFileSync(join(dir, "manifest.yaml"), toYaml(manifest, { lineWidth: 0 }));
  assert.equal(manifestOf(dir).content_digest.value, digest);
  return dir;
}

test("review status exits non-zero, and prints one counts line, when a required kind's newest review is stale", () => {
  const dir = findingWithoutReviews();
  for (const kind of ["method", "question", "reader"] as const) {
    assert.deepEqual(recordReview({ dir, kind, reviewer: `agent:test/${kind}`, date: "2026-09-16" }).errors, []);
  }

  const clean = reviewStatus({ dir });
  assert.deepEqual(clean.errors, [], JSON.stringify(clean.errors));
  assert.equal(exitCodeFor(clean), 0, "three current reviews and a clean check is the one case that exits 0");
  assert.equal(clean.info[0], "reviews: 3 current, 0 superseded, 0 stale", JSON.stringify(clean.info));
  assert.match(clean.info[1]!, /^verdict: continue \(/, JSON.stringify(clean.info));

  // The edit that makes the reviews describe content nobody read.
  writeFileSync(join(dir, "memo.md"), readFileSync(join(dir, "memo.md"), "utf8") + "\nOne sentence added after the reviews.\n");
  const edited = reviewStatus({ dir });
  assert.equal(edited.info[0], "reviews: 0 current, 0 superseded, 3 stale", JSON.stringify(edited.info));
  assert.match(edited.info[1]!, /^verdict: halt \(/);
  assert.equal(exitCodeFor(edited), 1, "a run that edits after reviewing must not be able to exit 0 here");
  assert.deepEqual(edited.errors.filter((e) => e.category === "stale_review").map((e) => e.location).sort(),
    ["reviews/method", "reviews/question", "reviews/reader"]);
  for (const e of edited.errors.filter((e) => e.category === "stale_review")) {
    assert.match(e.remedy!, /never re-pin a review/, "the remedy is another review, never a re-pin");
  }
  assert.equal(edited.decision.next, "halt");
});

test("review status reports a missing required review as an error of its own, and exits non-zero", () => {
  const dir = findingWithoutReviews();
  assert.deepEqual(recordReview({ dir, kind: "method", reviewer: "agent:test/method", date: "2026-09-16" }).errors, []);

  const report = reviewStatus({ dir });
  assert.equal(exitCodeFor(report), 1);
  assert.equal(report.info[0], "reviews: 1 current, 0 superseded, 0 stale");
  assert.deepEqual(report.errors.filter((e) => e.category === "incomplete").map((e) => e.location),
    ["reviews/question", "reviews/reader"]);
  assert.deepEqual(report.errors.filter((e) => e.category === "stale_review"), [],
    "a kind nobody has reviewed yet is missing, not stale");
});

test("a review superseded by a later one of the same kind at the current digest is history, not staleness", () => {
  const dir = findingWithoutReviews();
  const digest = manifestOf(dir).content_digest.value;
  for (const kind of ["method", "question", "reader"] as const) {
    assert.deepEqual(recordReview({ dir, kind, reviewer: `agent:test/${kind}`, date: "2026-09-16" }).errors, []);
  }
  // Three round-1 reviews at an earlier digest, behind the three current ones: exactly Citi Bike run 2's tree.
  const manifest = manifestOf(dir);
  manifest.reviews = [
    ...["method", "question", "reader"].map((kind) => ({
      kind, reviewer: `agent:test/${kind}`, date: "2026-09-15",
      content_digest: { algorithm: "sha256", value: "0".repeat(64) }, blocking: [], non_blocking: [],
    })),
    ...manifest.reviews,
  ];
  writeFileSync(join(dir, "manifest.yaml"), toYaml(manifest, { lineWidth: 0 }));

  const report = reviewStatus({ dir });
  assert.equal(manifestOf(dir).content_digest.value, digest, "the reviews are outside the digest envelope");
  assert.equal(report.info[0], "reviews: 3 current, 3 superseded, 0 stale", JSON.stringify(report.info));
  assert.match(report.info[1]!, /^verdict: continue \(/);
  assert.deepEqual(report.errors, [], "nothing is stale and nothing is missing, so nothing is an error");
  assert.equal(exitCodeFor(report), 0, "a superseded review is no reason to halt or to re-review");
  assert.equal(report.decision.superseded.length, 3);
  assert.deepEqual(report.decision.stale, []);
  // Named by index, named by the review that replaced it, and reported as `review_superseded` rather than as a
  // `stale_review` warning: three facts an Operator reading "stale" per entry could not have got.
  assert.ok(report.info.some((i) => i === "review_superseded: manifest.yaml#/reviews/0 — the method review of 2026-09-15 is superseded by the method review of 2026-09-16 at the current digest; it is history, not a reason to review again (recorded by agent:test/method)"),
    JSON.stringify(report.info));
  assert.equal(report.info.filter((i) => i.startsWith("review_superseded:")).length, 3, JSON.stringify(report.info));
  assert.deepEqual(report.warnings.filter((w) => w.category === "stale_review"), [],
    "nothing is stale, so `review status` carries no stale_review warning of its own and none from the check it ran");

  // `aftergrid check` reads the same module, so it agrees: three info lines, no warning, and the exit code of a
  // Finding with nothing wrong with it.
  const checked = checkArtifact({ dir });
  assert.deepEqual(checked.warnings.filter((w) => w.category === "stale_review"), [], JSON.stringify(checked.warnings));
  assert.equal(checked.info.filter((i) => i.startsWith("review_superseded:")).length, 3, JSON.stringify(checked.info));
  assert.equal(exitCodeFor(checked), 0, "a superseded review is not a reason for `check` to fail either");

  // And once a kind has no review at the current digest at all, that kind is stale: it is reviewed again, and
  // the reviewer named is the newest of the two, not the round-1 one behind it.
  const reviews: ReviewEntry[] = manifestOf(dir).reviews;
  assert.equal(newestByKind(reviews).get("method")!.reviewer, "agent:test/method");
  assert.equal(newestByKind(reviews).get("method")!.date, "2026-09-16", "the newest review of a kind is the later one");
  const rolledBack = decideHalt({
    reviews: reviews.map((r) => (r.kind === "method" && r.date === "2026-09-16"
      ? { ...r, reviewer: "agent:test/method-round-2", content_digest: { algorithm: "sha256" as const, value: "1".repeat(64) } }
      : r)),
    currentDigest: digest,
  });
  assert.deepEqual(rolledBack.stale, [{ kind: "method", reviewer: "agent:test/method-round-2" }],
    "the kind with no review at the current digest is stale, named by its newest review");
  assert.deepEqual(rolledBack.superseded.map((s) => s.kind), ["method", "question", "reader"],
    "every round-1 review is superseded: two by a current review, and method's by the round-2 review that is itself the stale one");
  assert.deepEqual(rolledBack.missing_kinds, ["method"]);
  assert.equal(rolledBack.next, "halt");
});

test("only a kind's newest review can be stale: one warning for the kind, not one per entry behind it", () => {
  const dir = findingWithoutReviews();
  const digest = manifestOf(dir).content_digest.value;
  const at = (value: string) => ({ algorithm: "sha256", value });
  const manifest = manifestOf(dir);
  // Method reviewed twice and never at the current digest; question and reader current. One kind to review
  // again, one entry of history behind it.
  manifest.reviews = [
    { kind: "method", reviewer: "agent:test/method-round-1", date: "2026-09-15", content_digest: at("0".repeat(64)), blocking: [], non_blocking: [] },
    { kind: "method", reviewer: "agent:test/method-round-2", date: "2026-09-16", content_digest: at("1".repeat(64)), blocking: [], non_blocking: [] },
    { kind: "question", reviewer: "agent:test/question", date: "2026-09-16", content_digest: at(digest), blocking: [], non_blocking: [] },
    { kind: "reader", reviewer: "agent:test/reader", date: "2026-09-16", content_digest: at(digest), blocking: [], non_blocking: [] },
  ];
  writeFileSync(join(dir, "manifest.yaml"), toYaml(manifest, { lineWidth: 0 }));

  // `aftergrid check`: one warning, naming the newest method review by its own index, and one info line for the
  // entry behind it. Before this bead both entries were warned about, and the pile read as "the reviews are stale".
  const checked = checkArtifact({ dir });
  assert.deepEqual(checked.warnings.filter((w) => w.category === "stale_review"),
    [{ category: "stale_review", location: "manifest.yaml#/reviews/1", message: "the newest method review is for a different content digest" }],
    JSON.stringify(checked.warnings));
  assert.deepEqual(checked.info.filter((i) => i.startsWith("review_superseded:")),
    ["review_superseded: manifest.yaml#/reviews/0 — the method review of 2026-09-15 is superseded by the method review of 2026-09-16, which is itself not at the current digest; that kind's staleness is reported once, against its newest review"],
    JSON.stringify(checked.info));

  // `review status`: the same split, reported as the error that makes the command exit 1, and named per kind.
  const report = reviewStatus({ dir });
  assert.equal(report.info[0], "reviews: 2 current, 1 superseded, 1 stale", JSON.stringify(report.info));
  assert.deepEqual(report.errors.filter((e) => e.category === "stale_review").map((e) => e.location), ["reviews/method"]);
  assert.deepEqual(report.warnings.filter((w) => w.category === "stale_review"), [],
    "the staleness is said once, as an error: the validator's per-entry warning is not repeated beside it");
  assert.equal(report.info.filter((i) => i.startsWith("review_superseded:")).length, 1);
  assert.equal(exitCodeFor(report), 1);
});

test("the eval asserts that the produced Finding's newest review of each kind is at its own digest", () => {
  const golden = loadGoldens(INSTANCE).find((g) => g.id === "price_change_cancellations")!;
  const unavailable = { status: "unavailable", reason: "not needed for this assertion" } as const;
  const assertOne = (manifest: any) =>
    assertCase({ golden, dir: PRICE, manifest, memo: "", reference: unavailable }).find((a) => a.id === "reviews_current")!;

  const shipped = manifestOf(PRICE);
  const current = assertOne(shipped);
  assert.equal(current.status, "pass", JSON.stringify(current));
  assert.equal(current.category, "analytical");
  assert.match(current.observed, /superseded review\(s\) behind them/, "the exemplar's round-1 review is history, and passes");

  const digest = shipped.content_digest.value;
  const stale = assertOne({ ...shipped, reviews: shipped.reviews.map((r: any) => ({ ...r, content_digest: { algorithm: "sha256", value: "f".repeat(64) } })) });
  assert.equal(stale.status, "fail", JSON.stringify(stale));
  assert.match(stale.observed, /edited after it was reviewed/);

  const none = assertOne({ ...shipped, reviews: [] });
  assert.equal(none.status, "fail");
  assert.match(none.observed, /records no review at all/);

  const visualOnly = assertOne({ ...shipped, reviews: [{ kind: "visual", reviewer: "agent:x", date: "2026-09-17", content_digest: { algorithm: "sha256", value: digest }, blocking: [], non_blocking: [] }] });
  assert.equal(visualOnly.status, "fail", "a visual review is not one of the three that complete a draft");
  assert.match(visualOnly.observed, /none of a required kind/);

  const unpinned = assertOne({ ...shipped, content_digest: undefined });
  assert.equal(unpinned.status, "not_evaluated");
  assert.equal(unpinned.category, "infrastructure", "a manifest with no digest is a broken artifact, not a wrong answer");
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

/* ------------------------------------------------------------------ the command analyzer, for real */

// These four run the REAL command analyzer — the one no model exercises — against binaries that stand in for
// the ways a headless orchestrator fails: a non-zero exit, a binary that is not there, and one that exits
// clean having written nothing. A draft manifest already exists when the analyzer starts (`new finding` wrote
// it), so "there is a manifest.yaml" is not evidence the analyzer produced anything.
const PRICE_RUN = join(REPO, "fixtures", "runs", "4ka-price_change_cancellations", "output");

test("an analyzer that exits non-zero is infrastructure, with no assertion and no analytical verdict", async () => {
  const report = await runEval({ golden: "referral_campaign", analyzer: "command", analyzerCommand: "/usr/bin/false {finding_dir}" });
  const record = report.cases[0]!;
  assert.equal(record.outcome, "error", record.reason);
  assert.equal(record.failure_category, "infrastructure");
  assert.deepEqual(record.assertions, [], "a crashed analyzer is not a wrong answer: nothing was asserted");
  assert.equal(record.failure_cause, "analyzer_exit_1");
  assert.ok(report.errors.every((e) => e.category !== "eval_case_failed"), JSON.stringify(report.errors));
});

test("an analyzer binary that does not exist is infrastructure, not a declined case", async () => {
  const report = await runEval({ golden: "referral_campaign", analyzer: "command", analyzerCommand: "/nonexistent-aftergrid-analyzer {finding_dir}" });
  const record = report.cases[0]!;
  assert.equal(record.outcome, "error", record.reason);
  assert.equal(record.failure_category, "infrastructure");
  assert.equal(record.failure_cause, "analyzer_spawn_failed");
  assert.deepEqual(record.assertions, []);
});

test("an analyzer that exits clean without touching the draft Finding produced nothing, and the run says so", async () => {
  const report = await runEval({ golden: "referral_campaign", analyzer: "command", analyzerCommand: "/usr/bin/true {finding_dir}" });
  const record = report.cases[0]!;
  assert.equal(record.outcome, "error", record.reason);
  assert.equal(record.failure_cause, "analyzer_wrote_nothing",
    "the draft manifest `new finding` wrote is unchanged, so nothing was produced");
  assert.deepEqual(record.assertions, [], "asserting a draft against a Golden Question would manufacture failures");
});

test("a produced Finding records the cost the analyzer reported, and never one it did not", async () => {
  const script = join(temp(), "analyzer.mjs");
  writeFileSync(script, [
    'import { cpSync, rmSync } from "node:fs";',
    'const [dir, source] = process.argv.slice(2);',
    'rmSync(dir, { recursive: true, force: true });',
    'cpSync(source, dir, { recursive: true });',
    'console.log(JSON.stringify({ type: "result", subtype: "success", total_cost_usd: 0.1234, usage: { input_tokens: 111, output_tokens: 22 } }));',
  ].join("\n"));

  const report = await runEval({
    golden: "price_change_cancellations", analyzer: "command",
    analyzerCommand: `${process.execPath} ${script} {finding_dir} ${PRICE_RUN}`,
  });
  const record = report.cases[0]!;
  assert.equal(record.outcome, "pass", record.reason);
  assert.deepEqual(record.cost, { input_tokens: 111, output_tokens: 22, usd: 0.1234 });

  // Silence is null, never zero: an analyzer that reports no cost leaves the field unknown.
  const quiet = join(temp(), "quiet.mjs");
  writeFileSync(quiet, [
    'import { cpSync, rmSync } from "node:fs";',
    'const [dir, source] = process.argv.slice(2);',
    'rmSync(dir, { recursive: true, force: true });',
    'cpSync(source, dir, { recursive: true });',
    'console.log(JSON.stringify({ type: "result" }));',
  ].join("\n"));
  const unknown = await runEval({
    golden: "price_change_cancellations", analyzer: "command",
    analyzerCommand: `${process.execPath} ${quiet} {finding_dir} ${PRICE_RUN}`,
  });
  assert.deepEqual(unknown.cases[0]!.cost, { input_tokens: null, output_tokens: null, usd: null });
});

/* ------------------------------------------------------------------ what a record may claim */

test("a --model given to the fixture analyzer names nothing that ran, in every per-case record", async () => {
  const report = await runEval({ golden: "all", analyzer: "fixture", model: "claude-not-actually-run" });
  for (const record of report.cases) {
    assert.equal(record.model, null, `${record.case} recorded a model no case reported`);
  }
});

test("a --sha that is not a usable directory name is refused by `eval` itself, and nothing is written", async () => {
  const out = join(temp(), "records");
  const report = await runEval({ golden: "all", analyzer: "fixture", outDir: out, sha: "../escape" });
  assert.ok(report.errors.some((e) => e.category === "unsafe_path"), JSON.stringify(report.errors));
  assert.equal(report.syntax, "invalid");
  assert.equal(existsSync(join(out, "..", "escape")), false, "a revision name never becomes a path outside --out");
  assert.deepEqual(report.cases, [], "the refusal happens before any case runs");
});
