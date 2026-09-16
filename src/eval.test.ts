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
import { decideHalt, recordReview, reviewStatus, type ReviewEntry } from "./commands/review.ts";
import { emptyReport } from "./report.ts";
import {
  assertCase, createCommandAnalyzer, createFixtureAnalyzer, loadDefinitions, loadGoldens, normalisePhrase,
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

  // Two entries sharing a 40-character normalised prefix used to truncate to the same id.
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
