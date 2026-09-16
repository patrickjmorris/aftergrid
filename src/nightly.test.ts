// ag-nightly-eval-0dv: the scheduled golden run, its artifacts, and the one issue a failure opens.
//
// Seam: `runNightly` in, a report plus `<out>/<sha>/` on disk out; `reportFailures` in, a fake issue sink out.
// **No test contacts GitHub and no model runs here.** The GitHub issue sink is constructed nowhere in this
// file; the command analyzer is selected once, to prove it reports itself as not exercised and to prove a
// credential in its template never reaches a written file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as toYaml } from "yaml";
import { contentDigest } from "./digest.ts";
import { loadGoldens } from "./eval/runner.ts";
import {
  DEFAULT_BUDGET_MS, RUN_FILE, SUMMARY_FILE, COMPARISON_FILE, RUN_LEVEL_ASSERTION,
  failuresOf, fingerprintFor, nightlyExitCode, readCaseRecords, redactCommand, runNightly,
  type NightlyReport,
} from "./eval/nightly.ts";
import { compareCommand, compareRuns } from "./eval/compare.ts";
import { createFakeIssueSink, createGitHubIssueSink, markerFor, reportCommand, reportFailures } from "./eval/report.ts";

const REPO = resolve(fileURLToPath(new URL("../", import.meta.url)));
const INSTANCE = join(REPO, "fixtures", "instance", "analytics");
const PRICE_RUN = join(REPO, "fixtures", "runs", "4ka-price_change_cancellations", "output");
/** The goldens with a recorded run: everything else has no analyzer and is `not_run`. */
const RECORDED = ["onboarding_checklist_retention", "price_change_cancellations"];
const SHA = "0".repeat(40);

/** A decimal planted in a Finding's results and nowhere else: it must never reach a summary or an issue. */
const SENTINEL_NUMBER = "0.86753090000042";
/** A credential-shaped string: it must never reach ANY file this run writes, nor any issue body. */
const SENTINEL_TOKEN = "ghp_nightly_test_sentinel_token_do_not_log";

const cleanup: string[] = [];
process.on("exit", () => { for (const d of cleanup) rmSync(d, { recursive: true, force: true }); });
const temp = (): string => { const d = mkdtempSync(join(tmpdir(), "ag-nightly-")); cleanup.push(d); return d; };

/**
 * A fixture-analyzer root holding one recorded run for `golden`, copied from the price Finding and damaged the
 * way a model regression would damage it: it answers where the Golden Question expects an abstention.
 */
function injectedRun(golden: string, opts: { outcome?: string; sentinel?: boolean } = {}): string {
  const root = temp();
  const output = join(root, golden, "output");
  cpSync(PRICE_RUN, output, { recursive: true });
  const manifest: any = parseYaml(readFileSync(join(output, "manifest.yaml"), "utf8"));
  if (opts.sentinel) {
    const entry = manifest.results[0];
    const path = join(output, entry.path);
    const result = JSON.parse(readFileSync(path, "utf8"));
    const row = result.rows[0];
    const column = Object.keys(row).find((k) => typeof row[k] === "number" || /^[0-9.]+$/.test(String(row[k])));
    row[column ?? Object.keys(row)[0]!] = SENTINEL_NUMBER;
    writeFileSync(path, JSON.stringify(result, null, 2) + "\n");
  }
  manifest.finding.outcome = opts.outcome ?? "answered";
  manifest.content_digest = contentDigest(manifest, output);
  writeFileSync(join(output, "manifest.yaml"), toYaml(manifest, { lineWidth: 0 }));
  return root;
}

/** Every file a run left behind, read as text. */
function writtenFiles(dir: string): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      const p = join(d, entry);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      out.push({ path: p, text: readFileSync(p, "utf8") });
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

/* ------------------------------------------------------------------ a complete scheduled run */

test("a full nightly run over the goldens records every version, writes summary.md, and claims nothing it did not do", async () => {
  const out = temp();
  const report = await runNightly({ golden: "all", analyzer: "fixture", outDir: out, sha: SHA });

  const goldens = loadGoldens(INSTANCE);
  assert.equal(report.cases.length, goldens.length, "every Golden Question is a case");
  assert.equal(nightlyExitCode(report), 0, "every case that ran passed and no bound stopped the run");

  const dir = join(out, SHA);
  assert.equal(report.run_dir, dir);
  // The per-case records are written exactly as `aftergrid eval` writes them, plus the nightly's own two files.
  for (const g of goldens) assert.ok(existsSync(join(dir, `${g.id}.json`)), `${g.id}.json was retained`);
  assert.ok(existsSync(join(dir, "summary.json")), "the eval summary is still written");
  const run = JSON.parse(readFileSync(join(dir, RUN_FILE), "utf8"));

  // Versions: every one the result depends on, and null where a fact is genuinely unknown.
  assert.equal(run.git_sha, SHA);
  assert.equal(run.aftergrid_version, "0.0.0");
  assert.equal(run.plugin_version, "0.0.0");
  assert.equal(run.model, null, "no model ran, so the model id is null rather than a placeholder");
  assert.ok(Object.keys(run.skill_versions).length >= 9, JSON.stringify(run.skill_versions));
  assert.equal(run.skill_versions["analyze"] !== undefined, true, "the analyze skill's version is recorded");
  assert.deepEqual(run.analyzer, { kind: "fixture", exercised: true, command_template: null });
  assert.equal(run.budget_ms, DEFAULT_BUDGET_MS);
  assert.ok(run.started && run.finished && run.elapsed_ms >= 0);

  // Case outcomes, and the cases that did not reach one.
  assert.equal(run.partial, false, "no bound stopped this run");
  assert.equal(run.totals.pass, RECORDED.length);
  assert.equal(run.totals.fail, 0);
  assert.deepEqual(run.not_run.map((n: any) => n.cause), Array(goldens.length - RECORDED.length).fill("declined"),
    "a case the analyzer declined is listed as not run, with the reason, and is not a failure");
  assert.deepEqual(run.failures, [], "nothing failed, so nothing is fingerprinted");
  for (const id of RECORDED) {
    const c = run.cases.find((c: any) => c.case === id);
    assert.equal(c.outcome, "pass", JSON.stringify(c));
    assert.equal(c.record, `${id}.json`);
  }

  const summary = readFileSync(join(dir, SUMMARY_FILE), "utf8");
  for (const g of goldens) {
    assert.ok(summary.includes(`\`${g.id}\``), `${g.id} has a line in summary.md`);
    assert.ok(summary.includes(`(./${g.id}.json)`), `${g.id}'s line links its retained record by relative path`);
  }
  assert.match(summary, /never a merge gate/);
  assert.match(summary, /model `none — no model ran`/, "the summary says no model ran rather than implying one did");
  assert.match(summary, /partial: \*\*no\*\*/);
  assert.equal(report.summary_markdown, summary);
});

test("a model id given alongside the fixture analyzer names nothing that ran, and the run records null", async () => {
  const out = temp();
  const report = await runNightly({ golden: "onboarding_checklist_retention", analyzer: "fixture", outDir: out, sha: "model001", model: "claude-not-actually-run" });
  assert.equal(report.run.model, null, "a replayed Finding is not a model run, whatever the flag said");
  assert.ok(report.info.some((i) => /names nothing this run exercised/.test(i)), JSON.stringify(report.info));
  assert.match(readFileSync(join(out, "model001", SUMMARY_FILE), "utf8"), /model `none — no model ran`/);
  assert.equal(readFileSync(join(out, "model001", SUMMARY_FILE), "utf8").includes("claude-not-actually-run"), false);
});

/* ------------------------------------------------------------------ an expected-abstention regression */

/** The referral Golden Question expects an abstention; this run answers instead. */
const regressionRun = (out: string, sha: string, opts: { sentinel?: boolean } = {}) =>
  runNightly({ golden: "referral_campaign", analyzer: "fixture", fixtureRoot: injectedRun("referral_campaign", opts), outDir: out, sha });

test("an answer where the Golden Question expects an abstention fails that case as analytical, and opens one issue", async () => {
  const out = temp();
  const report = await regressionRun(out, "regress01");
  const record = report.cases[0]!;

  assert.equal(record.case, "referral_campaign");
  assert.equal(record.outcome, "fail");
  assert.equal(record.failure_category, "analytical", "a wrong answer is a fact about the Analysis, not about the machinery");
  const outcome = record.assertions.find((a) => a.id === "outcome")!;
  assert.equal(outcome.status, "fail");
  assert.equal(outcome.expected, "outcome insufficient_data");
  assert.equal(outcome.observed, "outcome answered");
  assert.equal(nightlyExitCode(report), 1, "a failed case exits 1, distinct from a partial run");
  assert.ok(report.errors.some((e) => e.category === "eval_case_failed"), JSON.stringify(report.errors));
  assert.ok(!report.errors.some((e) => e.category === "eval_infrastructure"), "nothing about the machinery broke");

  // One fingerprint per failing assertion, over ids and categories only.
  const expected = fingerprintFor("referral_campaign", "outcome", "analytical");
  assert.ok(report.run.failures.some((f) => f.fingerprint === expected && f.assertion_id === "outcome"), JSON.stringify(report.run.failures));
  assert.equal(new Set(report.run.failures.map((f) => f.fingerprint)).size, report.run.failures.length, "two failures never share a fingerprint");

  const sink = createFakeIssueSink();
  const filed = await reportFailures({ run: report.run, sink, artifactBase: `eval-runs/regress01` });
  assert.equal(filed.created.filter((c) => c.fingerprint === expected).length, 1, "the abstention regression opens exactly one issue");
  assert.equal(filed.commented.length, 0, "nothing existed to comment on");
  assert.equal(sink.issues.length, filed.created.length);
  assert.equal(new Set(sink.issues.map((i) => i.title)).size, sink.issues.length, "no two issues describe the same failure");

  const issue = sink.issues.find((i) => i.body.includes(markerFor(expected)))!;
  assert.ok(issue, "the issue carries its fingerprint marker so a later run can find it");
  assert.match(issue.title, /referral_campaign/);
  assert.match(issue.body, /- case: `referral_campaign`/);
  assert.match(issue.body, /- assertion: `outcome`/);
  assert.match(issue.body, /- revision: `regress01`/);
  assert.match(issue.body, /eval-runs\/regress01\/referral_campaign\.json/, "the issue links the retained artifact by path");
  assert.match(issue.body, /docs\/contracts\/eval\.md/);
  assert.doesNotMatch(issue.body, /insufficient_data|answered/, "the issue carries identifiers, not the observed values");
});

test("a second identical run finds the existing issue and comments on it instead of opening another", async () => {
  const sink = createFakeIssueSink();
  const first = await regressionRun(temp(), "regress01");
  const opened = await reportFailures({ run: first.run, sink, artifactBase: "eval-runs/regress01" });
  assert.ok(opened.created.length >= 1);
  const after = sink.issues.length;

  // A different night, a different revision, the same failure.
  const second = await regressionRun(temp(), "regress02");
  const fingerprints = (r: NightlyReport) => r.run.failures.map((f) => f.fingerprint).sort();
  assert.deepEqual(fingerprints(second), fingerprints(first), "identical failures fingerprint identically across runs and revisions");

  const repeat = await reportFailures({ run: second.run, sink, artifactBase: "eval-runs/regress02" });
  assert.deepEqual(repeat.created, [], "no duplicate issue was opened");
  assert.equal(repeat.commented.length, opened.created.length);
  assert.equal(sink.issues.length, after, "the issue count did not move");
  assert.equal(sink.comments.length, opened.created.length);
  assert.match(sink.comments[0]!.body, /Still failing on `regress02`/);
});

/* ------------------------------------------------------------------ infrastructure is not a wrong answer */

test("an analyzer that throws is recorded as infrastructure and opens no analytical issue", async () => {
  const out = temp();
  const report = await runNightly({
    golden: "referral_campaign", outDir: out, sha: "infra001",
    analyzerImpl: { name: "thrower", exercised: true, async analyze() { throw new Error("the model connection dropped"); } },
  });

  const record = report.cases[0]!;
  assert.equal(record.outcome, "error");
  assert.equal(record.failure_category, "infrastructure");
  assert.deepEqual(record.assertions, [], "nothing was asserted, so nothing is claimed about the Analysis");
  assert.ok(report.errors.some((e) => e.category === "eval_infrastructure"));
  assert.ok(!report.errors.some((e) => e.category === "eval_case_failed"), "a broken runner is never reported as a wrong answer");

  const failure = report.run.failures[0]!;
  assert.equal(failure.category, "infrastructure");
  assert.equal(failure.assertion_id, RUN_LEVEL_ASSERTION);
  assert.equal(failure.cause, "analyzer_threw");
  assert.equal(failure.recoverable, true);
  assert.equal(failure.fingerprint, fingerprintFor("referral_campaign", RUN_LEVEL_ASSERTION, "infrastructure"));

  const sink = createFakeIssueSink();
  const filed = await reportFailures({ run: report.run, sink });
  assert.deepEqual(filed.created, [], "an infrastructure error opens no analytical regression issue");
  assert.equal(sink.issues.length, 0);
  assert.equal(filed.skipped.length, 1);
  assert.match(filed.skipped[0]!.reason, /says the machinery broke, not that the Analysis is wrong/);

  const summary = readFileSync(join(out, "infra001", SUMMARY_FILE), "utf8");
  assert.match(summary, /infrastructure error.*cause `analyzer_threw`.*a retry may clear it/);
  for (const line of summary.split("\n").filter((l) => l.startsWith("- `"))) {
    assert.doesNotMatch(line, /analytical failure/, "no case line calls a broken runner a wrong answer");
  }
});

/* ------------------------------------------------------------------ bounds */

test("a one-millisecond budget marks the run partial, names the cases it did not attempt, and exits 4", async () => {
  const out = temp();
  const report = await runNightly({ golden: "all", analyzer: "fixture", outDir: out, sha: "budget01", budgetMs: 1 });

  assert.equal(report.run.partial, true);
  assert.equal(nightlyExitCode(report), 4, "a partial run exits non-zero, and distinctly from a failure");
  assert.equal(report.run.totals.pass, 0, "nothing passed, and nothing pretends to have");
  assert.equal(report.run.totals.fail, 0);
  const skipped = report.run.not_run.filter((n) => n.cause === "budget");
  assert.ok(skipped.length >= loadGoldens(INSTANCE).length - 1, `expected almost every case to be skipped: ${JSON.stringify(report.run.not_run)}`);
  for (const n of skipped) assert.match(n.reason, /budget was spent before this case started/);

  const run = JSON.parse(readFileSync(join(out, "budget01", RUN_FILE), "utf8"));
  assert.equal(run.partial, true);
  assert.ok(run.not_exercised.some((n: string) => /budget or a timeout/.test(n)));
  assert.match(readFileSync(join(out, "budget01", SUMMARY_FILE), "utf8"), /partial: \*\*yes\*\*/);
  assert.equal(report.content, "incomplete", "a run that reached no verdict is not a complete one");
});

test("a case that outruns its per-case timeout is abandoned as infrastructure, not judged", async () => {
  const out = temp();
  const report = await runNightly({
    golden: "referral_campaign", outDir: out, sha: "timeout1", caseTimeoutMs: 1,
    analyzerImpl: {
      name: "slow", exercised: true,
      analyze: () => new Promise((r) => { const t = setTimeout(() => r({ status: "declined", reason: "too late" }), 200); (t as any).unref?.(); }),
    },
  });

  const record = report.cases[0]!;
  assert.equal(record.outcome, "error");
  assert.equal(record.failure_category, "infrastructure");
  assert.equal(record.stopped_by, "timeout");
  assert.match(record.reason, /outran its 1 ms timeout/);
  assert.deepEqual(record.assertions, []);
  assert.equal(report.run.partial, true, "a bound stopped this run, and the run says so");
  assert.equal(report.run.failures[0]!.cause, "case_timeout");
  assert.equal(nightlyExitCode(report), 1, "an errored case is a failure of the run, not merely a partial one");
});

/* ------------------------------------------------------------------ comparison */

test("compare classifies a regression and a fix from the retained records, and writes comparison.json", async () => {
  const baselineOut = temp();
  const regressedOut = temp();
  await runNightly({ golden: "all", analyzer: "fixture", outDir: baselineOut, sha: "base0001" });
  // The same suite, with one Golden Question's recorded run damaged.
  const fixtureRoot = temp();
  cpSync(join(REPO, "fixtures", "runs"), fixtureRoot, { recursive: true });
  const damaged = join(fixtureRoot, "price_change_cancellations", "output");
  mkdirSync(join(fixtureRoot, "price_change_cancellations"), { recursive: true });
  cpSync(PRICE_RUN, damaged, { recursive: true });
  const manifest: any = parseYaml(readFileSync(join(damaged, "manifest.yaml"), "utf8"));
  manifest.finding.outcome = "answered";
  manifest.content_digest = contentDigest(manifest, damaged);
  writeFileSync(join(damaged, "manifest.yaml"), toYaml(manifest, { lineWidth: 0 }));
  await runNightly({ golden: "all", analyzer: "fixture", outDir: regressedOut, sha: "head0001", fixtureRoot });

  const baseDir = join(baselineOut, "base0001");
  const headDir = join(regressedOut, "head0001");
  assert.equal(readCaseRecords(baseDir).records.length, loadGoldens(INSTANCE).length, "run.json and summary.json are not case records");
  assert.deepEqual(readCaseRecords(baseDir).malformed, [], "every retained record reads back");

  const report = compareCommand({ baseline: baseDir, run: headDir });
  const comparison = report.comparison!;
  const byCase = Object.fromEntries(comparison.cases.map((c) => [c.case, c.classification]));
  assert.equal(byCase["price_change_cancellations"], "regressed", JSON.stringify(comparison.cases));
  assert.equal(byCase["onboarding_checklist_retention"], "unchanged");
  assert.equal(byCase["referral_campaign"], "unchanged", "a case both runs declined did not change");
  assert.equal(comparison.totals.regressed, 1);
  assert.equal(comparison.totals.missing_from_run, 0);
  assert.ok(report.errors.some((e) => e.category === "eval_case_failed" && e.location === "golden/price_change_cancellations"));
  assert.deepEqual(comparison.cases.find((c) => c.case === "price_change_cancellations")!.failing_assertions, ["outcome"]);

  assert.ok(existsSync(join(headDir, COMPARISON_FILE)));
  assert.match(readFileSync(join(headDir, SUMMARY_FILE), "utf8"), /## Compared against base0001[\s\S]*price_change_cancellations` — \*\*regressed\*\*/);

  // The other direction is a fix, and a run with an unknown case is new.
  const back = compareRuns(headDir, baseDir);
  assert.equal(back.cases.find((c) => c.case === "price_change_cancellations")!.classification, "fixed");
  assert.equal(back.totals.regressed, 0);

  const empty = temp();
  const onlyOne = compareRuns(headDir, join((await runNightly({ golden: "onboarding_checklist_retention", analyzer: "fixture", outDir: empty, sha: "one00001" })).run_dir));
  assert.equal(onlyOne.cases[0]!.classification, "unchanged");
  assert.equal(onlyOne.totals.missing_from_run, loadGoldens(INSTANCE).length - 1, "cases the baseline has and this run does not are a hole, not a verdict");
});

test("a comparison against a directory that is not a run is refused rather than reported as all-new", () => {
  const report = compareCommand({ baseline: join(temp(), "nope"), run: temp() });
  assert.ok(report.errors.some((e) => e.category === "missing_file"), JSON.stringify(report.errors));
  assert.equal(report.syntax, "invalid");
});

/* ------------------------------------------------------------------ the reporting step, and the CLI */

test("the reporting step reads a recorded run and re-runs nothing; a directory without run.json is refused", async () => {
  const out = temp();
  const report = await regressionRun(out, "filed001");
  const before = readFileSync(join(out, "filed001", RUN_FILE), "utf8");

  const sink = createFakeIssueSink();
  const filed = await reportCommand({ runDir: join(out, "filed001"), sink, artifactBase: "eval-runs/filed001" });
  assert.deepEqual(filed.errors, [], JSON.stringify(filed.errors));
  assert.equal(filed.content, "complete");
  assert.equal(filed.readiness, "unknown");
  assert.equal(filed.outcome!.created.length, sink.issues.length);
  assert.ok(sink.issues.length >= 1);
  assert.equal(readFileSync(join(out, "filed001", RUN_FILE), "utf8"), before, "reporting a run never rewrites it");

  const dry = await reportCommand({ runDir: join(out, "filed001"), dryRun: true });
  assert.ok(dry.info.some((i) => /--dry-run contacted nothing/.test(i)));

  const missing = await reportCommand({ runDir: temp(), sink });
  assert.equal(missing.errors[0]!.category, "missing_file");
  assert.equal(missing.syntax, "invalid");

  const clean = await runNightly({ golden: "onboarding_checklist_retention", analyzer: "fixture", outDir: temp(), sha: "clean001" });
  const nothing = await reportCommand({ runDir: clean.run_dir, sink });
  assert.deepEqual(nothing.outcome, { created: [], commented: [], skipped: [], errors: [] });
  assert.ok(nothing.info.some((i) => /recorded no failure/.test(i)));
});

test("the CLI exits 0 on a clean nightly and 4 on a partial one, as documented", () => {
  const out = temp();
  const cli = (args: string[]) => spawnSync(process.execPath, [join(REPO, "src", "cli.ts"), "eval", "nightly", ...args], { encoding: "utf8", cwd: REPO });

  const clean = cli(["--golden", "onboarding_checklist_retention", "--out", out, "--sha", "cli00001", "--json"]);
  assert.equal(clean.status, 0, clean.stderr);
  assert.equal(JSON.parse(clean.stdout).run.partial, false);

  const partial = cli(["--golden", "all", "--out", out, "--sha", "cli00002", "--budget-ms", "1", "--json"]);
  assert.equal(partial.status, 4, "a partial run is non-zero and distinct from a failing case");
  assert.equal(JSON.parse(partial.stdout).run.partial, true);

  const refused = cli(["--golden", "all", "--out", out, "--sha", "../escape", "--json"]);
  assert.equal(refused.status, 2, "a revision name that is not a safe directory name is refused, not written");
  assert.equal(existsSync(join(out, "..", "escape")), false);

  const compare = spawnSync(process.execPath, [join(REPO, "src", "cli.ts"), "eval", "compare", join(out, "cli00001"), join(out, "cli00001"), "--json"], { encoding: "utf8", cwd: REPO });
  assert.equal(compare.status, 0, compare.stderr);
  assert.equal(JSON.parse(compare.stdout).comparison.totals.unchanged, 1);
});

/* ------------------------------------------------------------------ leaks */

test("no credential and no number from results reaches a file this run writes or an issue it files", async () => {
  // Part 1: a credential in the analyzer command template and in the environment.
  const out = temp();
  const previous = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = SENTINEL_TOKEN;
  let commandRun: NightlyReport;
  try {
    commandRun = await runNightly({
      golden: "referral_campaign", analyzer: "command", outDir: out, sha: "leak0001",
      analyzerCommand: `/nonexistent-aftergrid-analyzer --api-key ${SENTINEL_TOKEN} ANTHROPIC_API_KEY=${SENTINEL_TOKEN} {finding_dir} {raw_ask}`,
      caseTimeoutMs: 5_000,
    });
  } finally {
    if (previous === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = previous;
  }
  assert.equal(commandRun.run.analyzer.exercised, false, "no test runs a real analyzer command, and the run says so");
  assert.match(commandRun.run.analyzer.command_template!, /--api-key <redacted> ANTHROPIC_API_KEY=<redacted>/);
  assert.ok(commandRun.info.some((i) => /does not establish that the model-in-the-loop path works/.test(i)));

  // Part 2: a number planted in a Finding's results, in a run that fails and files issues.
  const failingOut = temp();
  const report = await regressionRun(failingOut, "leak0002", { sentinel: true });
  const results = writtenFiles(join(injectedSource(report), "results"));
  assert.ok(results.some((f) => f.text.includes(SENTINEL_NUMBER)), "the sentinel really is a number in the replayed Finding's results");
  const sink = createFakeIssueSink();
  await reportFailures({ run: report.run, sink, artifactBase: "eval-runs/leak0002" });
  assert.ok(sink.issues.length >= 1);

  const surfaces: { where: string; text: string }[] = [
    ...writtenFiles(out).map((f) => ({ where: f.path, text: f.text })),
    ...writtenFiles(failingOut).map((f) => ({ where: f.path, text: f.text })),
    ...sink.issues.map((i) => ({ where: `issue ${i.id} body`, text: i.body })),
    ...sink.issues.map((i) => ({ where: `issue ${i.id} title`, text: i.title })),
    ...sink.comments.map((c, n) => ({ where: `comment ${n}`, text: c.body })),
    { where: "the nightly report", text: JSON.stringify(commandRun) },
  ];
  assert.ok(surfaces.length > 8, `expected real surfaces to grep: ${surfaces.length}`);
  for (const s of surfaces) {
    assert.equal(s.text.includes(SENTINEL_TOKEN), false, `a credential leaked into ${s.where}`);
    assert.equal(/https?:\/\/[^\s/"']+:[^\s/"']+@/.test(s.text), false, `a credentialed URL leaked into ${s.where}`);
  }
  // The number from results may live in the retained per-case record — that record IS the evidence a human
  // reads — but never in the run's own summary, its run.json, or anything filed on an issue tracker.
  const authored = [
    { where: RUN_FILE, text: readFileSync(join(failingOut, "leak0002", RUN_FILE), "utf8") },
    { where: SUMMARY_FILE, text: readFileSync(join(failingOut, "leak0002", SUMMARY_FILE), "utf8") },
    ...sink.issues.map((i) => ({ where: `issue ${i.id}`, text: `${i.title}\n${i.body}` })),
    ...sink.comments.map((c, n) => ({ where: `comment ${n}`, text: c.body })),
  ];
  for (const s of authored) {
    assert.equal(s.text.includes(SENTINEL_NUMBER), false, `a number from results leaked into ${s.where}`);
  }
});

/** Where the injected run's Finding was replayed from, for the sentinel pre-check above. */
function injectedSource(report: NightlyReport): string {
  return report.cases[0]!.analyzer.source!;
}

test("the redactor keeps an environment reference and removes anything credential-shaped", () => {
  assert.equal(redactCommand(null), null);
  assert.equal(redactCommand("   "), null);
  assert.equal(
    redactCommand("claude -p /analyze --api-key sk-ant-abcdefghijklmnop --token $GH_TOKEN {finding_dir}"),
    "claude -p /analyze --api-key <redacted> --token $GH_TOKEN {finding_dir}",
  );
  assert.equal(redactCommand("env ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY claude {raw_ask}"), "env ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY claude {raw_ask}");
  assert.equal(redactCommand("claude ghp_0123456789abcdef {golden}"), "claude <redacted> {golden}");
});

test("a fingerprint is a function of the case, the assertion and the category, and of nothing else", () => {
  const a = fingerprintFor("referral_campaign", "outcome", "analytical");
  assert.equal(a, fingerprintFor("referral_campaign", "outcome", "analytical"));
  assert.notEqual(a, fingerprintFor("referral_campaign", "outcome", "infrastructure"));
  assert.notEqual(a, fingerprintFor("referral_campaign", "claim_type", "analytical"));
  assert.notEqual(a, fingerprintFor("price_change_cancellations", "outcome", "analytical"));
  assert.match(a, /^[0-9a-f]{64}$/);

  // The same failure with different timings and messages fingerprints the same.
  const base = {
    schema_version: "0.1.0" as const, case: "referral_campaign", outcome: "fail" as const,
    failure_category: "analytical" as const, analyzer: { name: "fixture", exercised: true, source: null },
    finding: { dir: null, id: null, state: null, outcome: null }, model: null, skill_versions: {},
    plugin_version: null, git_sha: null, aftergrid_version: null,
    cost: { input_tokens: null, output_tokens: null, usd: null },
    assertions: [{ id: "outcome", status: "fail" as const, category: "analytical" as const, expected: "x", observed: "y" }],
  };
  const monday = failuresOf({ ...base, reason: "outcome: expected 1", started: "2026-09-16T00:00:00Z", finished: "2026-09-16T00:01:00Z" });
  const tuesday = failuresOf({ ...base, reason: "outcome: expected 2", started: "2026-09-17T00:00:00Z", finished: "2026-09-17T00:09:00Z" });
  assert.deepEqual(monday.map((f) => f.fingerprint), tuesday.map((f) => f.fingerprint));
  assert.equal(monday[0]!.fingerprint, a);
});

/* ------------------------------------------------------------------ the command analyzer is not a verdict */

/** A per-case record written by hand, for the comparison classes that need one side to have no verdict. */
function writeRecord(dir: string, id: string, patch: Record<string, unknown>): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.json`), JSON.stringify({
    schema_version: "0.1.0", case: id, outcome: "pass", failure_category: null, reason: "",
    analyzer: { name: "fixture", exercised: true, source: null },
    finding: { dir: null, id: null, state: null, outcome: null }, assertions: [], model: null,
    skill_versions: {}, plugin_version: null, git_sha: null, aftergrid_version: null,
    started: "2026-09-16T00:00:00Z", finished: "2026-09-16T00:00:01Z",
    cost: { input_tokens: null, output_tokens: null, usd: null }, ...patch,
  }, null, 2) + "\n");
}

test("a crashed command analyzer is scored as infrastructure for every case, and opens no analytical issue", () => {
  const out = temp();
  const cli = spawnSync(process.execPath, [
    join(REPO, "src", "cli.ts"), "eval", "nightly", "--golden", "all",
    "--analyzer", "command", "--analyzer-command", "/usr/bin/false {finding_dir}",
    "--out", out, "--sha", "crash001", "--json",
  ], { encoding: "utf8", cwd: REPO });
  assert.equal(cli.status, 1, cli.stderr);
  const report = JSON.parse(cli.stdout);

  for (const c of report.cases) {
    assert.equal(c.outcome, "error", `${c.case}: ${c.reason}`);
    assert.equal(c.failure_category, "infrastructure");
    assert.deepEqual(c.assertions, [], `${c.case} was asserted against a draft the analyzer never wrote`);
    assert.equal(c.failure_cause, "analyzer_exit_1");
  }
  const run = JSON.parse(readFileSync(join(out, "crash001", RUN_FILE), "utf8"));
  assert.ok(run.failures.length >= 1);
  assert.ok(run.failures.every((f: any) => f.category === "infrastructure"), JSON.stringify(run.failures.slice(0, 3)));
  assert.ok(run.failures.every((f: any) => f.assertion_id === RUN_LEVEL_ASSERTION), "one run-level failure per case, not one per invented assertion");
  assert.equal(run.model, null, "no case reported a model, so the run names none");
});

test("a model named on the command line is never recorded when no case reported one", async () => {
  const out = temp();
  const report = await runNightly({
    golden: "referral_campaign", analyzer: "command", analyzerCommand: "/usr/bin/false {finding_dir}",
    outDir: out, sha: "model002", model: "claude-never-ran",
  });
  assert.equal(report.run.model, null, "the flag is a label; only a case that ran can name a model");
  assert.equal(readFileSync(join(out, "model002", RUN_FILE), "utf8").includes("claude-never-ran"), false);
});

test("an analyzer command template is recorded only for the analyzer that would run it", async () => {
  const out = temp();
  const report = await runNightly({
    golden: "onboarding_checklist_retention", analyzer: "fixture", outDir: out, sha: "tmpl0001",
    analyzerCommand: "claude -p /analyze --plugin-dir {repo_root} {finding_dir}",
  });
  assert.equal(report.run.analyzer.command_template, null, "the fixture analyzer runs no command, so it records none");
});

/* ------------------------------------------------------------------ what a clean run may claim */

test("a run with cases that reached no verdict never says it covered every selected case", async () => {
  const partlyDeclined = await runNightly({ golden: "all", analyzer: "fixture", outDir: temp(), sha: "cover001" });
  assert.ok(partlyDeclined.run.totals.not_run > 0, "the shipped goldens include cases with no recorded run");
  assert.equal(partlyDeclined.run.partial, false, "no bound stopped it: the hole is the analyzer declining");
  assert.equal(partlyDeclined.info.some((i) => /covered every selected case/.test(i)), false,
    `a run with a hole in it never claims full coverage: ${JSON.stringify(partlyDeclined.info)}`);
  assert.ok(partlyDeclined.info.some((i) => /reached no verdict/.test(i)), JSON.stringify(partlyDeclined.info));

  const whole = await runNightly({ golden: "onboarding_checklist_retention", analyzer: "fixture", outDir: temp(), sha: "cover002" });
  assert.ok(whole.info.some((i) => /covered every selected case/.test(i)), JSON.stringify(whole.info));
});

test("a run records the cost its cases reported, and null when none did", async () => {
  const report = await runNightly({ golden: "onboarding_checklist_retention", analyzer: "fixture", outDir: temp(), sha: "cost0001" });
  assert.equal(report.run.totals.cost_usd, null, "a replayed Finding cost nothing to produce, and no case claimed a figure");
  assert.equal(report.run.budget.max_cost_usd, 2, "the per-case ceiling the CLI is asked to enforce is recorded");
});

/* ------------------------------------------------------------------ the summary's own claim */

test("`eval summary` gates 'model in the loop' on the recorded run, not on a secret", () => {
  const out = temp();
  const summary = (dir: string) => spawnSync(process.execPath, [join(REPO, "src", "cli.ts"), "eval", "summary", dir], { encoding: "utf8", cwd: REPO });

  const fixtureDir = join(out, "gate0001");
  mkdirSync(fixtureDir, { recursive: true });
  const base = {
    schema_version: "0.1.0", kind: "nightly", git_sha: "gate0001", aftergrid_version: null, plugin_version: null,
    model: null, skill_versions: {}, analyzer: { kind: "fixture", exercised: true, command_template: null },
    instance: "", started: "", finished: "", elapsed_ms: 0, budget_ms: 0, case_timeout_ms: 0,
    budget: { max_cost_usd: 2 }, partial: false, not_run: [],
    totals: { cases: 1, pass: 1, fail: 0, error: 0, not_run: 0, analytical_failures: 0, infrastructure_failures: 0, cost_usd: null },
    cases: [], failures: [], not_exercised: [],
  };
  const write = (patch: Record<string, unknown>) => writeFileSync(join(fixtureDir, RUN_FILE), JSON.stringify({ ...base, ...patch }, null, 2));

  write({});
  assert.match(summary(fixtureDir).stdout, /Model in the loop: NOT exercised/);
  assert.match(summary(fixtureDir).stdout, /fixture/, "the reason names what actually ran");

  // The command analyzer ran, but every case broke before a verdict: still not exercised.
  write({ analyzer: { kind: "command", exercised: false, command_template: "claude -p /analyze" }, model: "claude-x",
    totals: { ...base.totals, pass: 0, fail: 0, error: 1 } });
  const noCase = summary(fixtureDir).stdout;
  assert.match(noCase, /Model in the loop: NOT exercised/);
  assert.match(noCase, /no case reached a verdict/);

  // The command analyzer ran, cases reached verdicts, and a case named the model.
  write({ analyzer: { kind: "command", exercised: false, command_template: "claude -p /analyze" }, model: "claude-x" });
  assert.match(summary(fixtureDir).stdout, /Model in the loop: exercised/);

  // Cases ran under the command analyzer but no case named a model: the claim is not earned.
  write({ analyzer: { kind: "command", exercised: false, command_template: "claude -p /analyze" }, model: null });
  const noModel = summary(fixtureDir).stdout;
  assert.match(noModel, /Model in the loop: NOT exercised/);
  assert.match(noModel, /no case reported a model/);

  const missing = summary(join(out, "nope"));
  assert.equal(missing.status, 2, "a directory that is not a run is a usage error, not a green claim");
});

/* ------------------------------------------------------------------ comparison */

test("a case that lost or gained its verdict is not 'unchanged'", () => {
  const baseDir = temp(), runDir = temp();
  writeRecord(baseDir, "a", { outcome: "pass" });
  writeRecord(runDir, "a", { outcome: "not_run", failure_category: null });
  writeRecord(baseDir, "b", { outcome: "fail", failure_category: "analytical", assertions: [{ id: "outcome", status: "fail", category: "analytical", expected: "x", observed: "y" }] });
  writeRecord(runDir, "b", { outcome: "not_run", failure_category: null });
  writeRecord(baseDir, "c", { outcome: "not_run", failure_category: null });
  writeRecord(runDir, "c", { outcome: "fail", failure_category: "analytical", assertions: [{ id: "outcome", status: "fail", category: "analytical", expected: "x", observed: "y" }] });
  writeRecord(baseDir, "d", { outcome: "not_run", failure_category: null });
  writeRecord(runDir, "d", { outcome: "not_run", failure_category: null });

  const comparison = compareRuns(baseDir, runDir);
  const byCase = Object.fromEntries(comparison.cases.map((c) => [c.case, c.classification]));
  assert.equal(byCase["a"], "no_verdict", "a case that passed and now did not run has not held its verdict");
  assert.equal(byCase["b"], "no_verdict");
  assert.equal(byCase["c"], "no_verdict", "a case that was never judged and now fails is not a regression from a pass");
  assert.equal(byCase["d"], "unchanged", "two declines really are the same non-verdict");
  assert.equal(comparison.totals.unchanged, 1);
  assert.equal(comparison.totals.no_verdict, 3);
  assert.equal(comparison.totals.regressed, 0, "a lost verdict is never reported as a regression in the Analysis");
});

test("a record without assertions, and one that is not JSON, are reported rather than crashing the comparison", () => {
  const baseDir = temp(), runDir = temp();
  writeRecord(baseDir, "a", { outcome: "pass" });
  // A record written by an older schema, or truncated: it has no `assertions` array at all.
  const legacy = JSON.parse(readFileSync(join(baseDir, "a.json"), "utf8"));
  delete legacy.assertions;
  legacy.outcome = "fail";
  legacy.failure_category = "analytical";
  writeFileSync(join(runDir, "a.json"), JSON.stringify(legacy, null, 2));
  writeFileSync(join(runDir, "broken.json"), "{ this is not json");

  const comparison = compareRuns(baseDir, runDir);
  assert.deepEqual(comparison.cases.find((c) => c.case === "a")!.failing_assertions, []);
  assert.deepEqual(comparison.malformed.run.map((p) => p.replace(/^.*\//, "")), ["broken.json"]);
  assert.deepEqual(comparison.malformed.baseline, []);

  const report = compareCommand({ baseline: baseDir, run: runDir });
  assert.ok(report.warnings.some((w) => /malformed/.test(w.message)), JSON.stringify(report.warnings));
  assert.match(readFileSync(join(runDir, SUMMARY_FILE), "utf8"), /broken\.json/);
});

/* ------------------------------------------------------------------ the issue sink, past the first page */

test("the issue sink pages through the open issues instead of duplicating past the first hundred", async () => {
  const fingerprint = fingerprintFor("referral_campaign", "outcome", "analytical");
  const page = (n: number, withMarker: boolean) =>
    Array.from({ length: 100 }, (_, i) => ({ number: n * 1000 + i, title: `issue ${n}.${i}`, body: withMarker && i === 7 ? `body\n${markerFor(fingerprint)}\n` : "unrelated body", html_url: null }));

  const seen: string[] = [];
  const found = createGitHubIssueSink({
    repo: "example/repo", token: null,
    api: async (_method, path) => { seen.push(path); return page(Number(/page=(\d+)/.exec(path)?.[1] ?? 1), /page=2\b/.test(path)); },
  });
  const hit = await found.find(fingerprint);
  assert.ok(hit, "the marker is on page 2 and a single un-paged GET would have missed it and opened a duplicate");
  assert.equal(seen.length, 2, JSON.stringify(seen));
  assert.match(seen[1]!, /page=2/);

  // A short page is the end of the list, and it is not an error.
  const absent = createGitHubIssueSink({
    repo: "example/repo", token: null,
    api: async () => [{ number: 1, title: "t", body: "nothing here" }],
  });
  assert.equal(await absent.find(fingerprint), null);

  // Every page full and no marker: the window was exhausted, so the sink refuses rather than duplicating.
  let calls = 0;
  const endless = createGitHubIssueSink({
    repo: "example/repo", token: null,
    api: async (_m, path) => { calls++; return page(Number(/page=(\d+)/.exec(path)?.[1] ?? 1), false); },
  });
  await assert.rejects(() => endless.find(fingerprint), /search window exhausted/);
  assert.equal(calls, 20, "the paging is bounded");

  const run = (await runNightly({ golden: "referral_campaign", analyzer: "fixture", fixtureRoot: injectedRun("referral_campaign"), outDir: temp(), sha: "page0001" })).run;
  const filed = await reportFailures({ run, sink: endless });
  assert.deepEqual(filed.created, [], "a sink that could not finish the search creates nothing");
  assert.ok(filed.errors.some((e) => /search window exhausted/.test(e.message)), JSON.stringify(filed.errors));
});

/* ------------------------------------------------------------------ redaction */

test("the redactor removes a credential however it was spelled on the command line", () => {
  // --flag=value, with the value glued to the flag.
  assert.equal(
    redactCommand("claude --api-key=sk-ant-api03-abcdefghijklmnop {finding_dir}"),
    "claude --api-key=<redacted> {finding_dir}",
  );
  // A flag name the old list did not know, matched by its shape rather than by an enumeration.
  assert.equal(
    redactCommand("claude --anthropic-api-key hunter2-not-a-known-shape {finding_dir}"),
    "claude --anthropic-api-key <redacted> {finding_dir}",
  );
  // A bare provider-shaped token carrying an underscore.
  assert.equal(
    redactCommand("claude sk-ant-api03-Abc_defGHI-jklmnop {golden}"),
    "claude <redacted> {golden}",
  );
  assert.equal(redactCommand("claude ghp_nightly_test_sentinel_token_do_not_log {golden}"), "claude <redacted> {golden}");
  // An environment reference is how the run was configured, and is not a secret.
  assert.equal(redactCommand("claude --api-key=$ANTHROPIC_API_KEY {golden}"), "claude --api-key=$ANTHROPIC_API_KEY {golden}");
  assert.equal(redactCommand("claude --max-budget-usd 2 --output-format json"), "claude --max-budget-usd 2 --output-format json");
});

test("no spelling of a credential reaches run.json or summary.md", async () => {
  const out = temp();
  const report = await runNightly({
    golden: "referral_campaign", analyzer: "command", outDir: out, sha: "redact01", caseTimeoutMs: 5_000,
    analyzerCommand: `/usr/bin/false --api-key=${SENTINEL_TOKEN} --anthropic-api-key ${SENTINEL_TOKEN} sk-ant-api03-${SENTINEL_TOKEN} {finding_dir}`,
  });
  const template = report.run.analyzer.command_template!;
  assert.equal(template.includes(SENTINEL_TOKEN), false, template);
  assert.equal(template.split("<redacted>").length - 1, 3, template);
  for (const file of [RUN_FILE, SUMMARY_FILE]) {
    assert.equal(readFileSync(join(out, "redact01", file), "utf8").includes(SENTINEL_TOKEN), false, `${file} carried the credential`);
  }
});

/* ------------------------------------------------------------------ the CLI's own numbers */

test("an empty or non-numeric millisecond bound is a usage error, not a zero budget", () => {
  const cli = (args: string[]) => spawnSync(process.execPath, [join(REPO, "src", "cli.ts"), "eval", "nightly", ...args], { encoding: "utf8", cwd: REPO });
  const out = temp();
  for (const raw of ["", "  ", "abc", "Infinity"]) {
    const r = cli(["--golden", "onboarding_checklist_retention", "--out", out, "--sha", "msbad001", "--budget-ms", raw, "--json"]);
    assert.equal(r.status, 2, `--budget-ms '${raw}' was accepted: ${r.stdout.slice(0, 200)}`);
  }
});
