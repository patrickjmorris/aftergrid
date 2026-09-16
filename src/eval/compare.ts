// `aftergrid eval compare <baseline-run-dir> <run-dir>`: what changed between two recorded runs.
// Contract: docs/contracts/eval.md ("Nightly").
//
// A nightly is only actionable against a baseline: "three cases fail" is not news, "this case passed last night
// and fails now" is. Classification reads the retained per-case records of both runs — nothing is re-run and
// nothing is re-judged here, so a comparison can never turn a declined case into a verdict.
import { existsSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { emptyReport, type Report } from "../report.ts";
import type { CaseRecord } from "./record.ts";
import { COMPARISON_FILE, appendToSummary, readCaseRecords, readRun } from "./nightly.ts";

/**
 * - `unchanged` — the same verdict on both sides, or the same *absence* of one on both sides.
 * - `regressed` — passed in the baseline, fails now. The only class that is news.
 * - `fixed` — failed in the baseline, passes now.
 * - `new` — this case has no baseline record.
 * - `no_verdict` — exactly one side reached a verdict. A case that passed and now declines has not held its
 *   pass, and a case that never ran and now fails has not regressed from one: calling either `unchanged`
 *   would report a hole as stability.
 * - `infrastructure` — either side errored or failed on an infrastructure assertion. A broken runner is not a
 *   regression in the Analysis, and calling it one would send someone to read the wrong thing.
 */
export type Classification = "unchanged" | "regressed" | "fixed" | "new" | "no_verdict" | "infrastructure";

export type CaseComparison = {
  case: string;
  baseline_outcome: CaseRecord["outcome"] | null;
  outcome: CaseRecord["outcome"] | null;
  classification: Classification;
  /** The failing assertion ids on the current side, for a regression. Ids only: no observed values. */
  failing_assertions: string[];
};

export type Comparison = {
  schema_version: "0.1.0";
  baseline: { dir: string; git_sha: string | null; cases: number };
  run: { dir: string; git_sha: string | null; cases: number };
  totals: Record<Classification, number> & { missing_from_run: number };
  cases: CaseComparison[];
  /** Cases the baseline recorded and this run has no record for at all. Not a verdict, a hole. */
  missing_from_run: string[];
  /** Record files on either side that could not be read as a case record. A hole too, and a different one. */
  malformed: { baseline: string[]; run: string[] };
};

const isInfrastructure = (r: CaseRecord | undefined): boolean =>
  !!r && (r.outcome === "error" || (r.outcome === "fail" && r.failure_category === "infrastructure"));

/** A case reached a verdict when it passed or failed. `not_run` and `error` are holes, not verdicts. */
const hasVerdict = (r: CaseRecord | undefined): boolean => !!r && (r.outcome === "pass" || r.outcome === "fail");

export function classify(baseline: CaseRecord | undefined, current: CaseRecord): Classification {
  if (isInfrastructure(baseline) || isInfrastructure(current)) return "infrastructure";
  if (!baseline) return "new";
  if (hasVerdict(baseline) !== hasVerdict(current)) return "no_verdict";
  if (baseline.outcome === "pass" && current.outcome === "fail") return "regressed";
  if (baseline.outcome === "fail" && current.outcome === "pass") return "fixed";
  return "unchanged";
}

export function compareRuns(baselineDir: string, runDir: string): Comparison {
  const baseDir = resolve(baselineDir);
  const curDir = resolve(runDir);
  const baseRead = readCaseRecords(baseDir);
  const curRead = readCaseRecords(curDir);
  const baseline = new Map(baseRead.records.map((r) => [r.case, r]));
  const current = curRead.records;

  const cases: CaseComparison[] = current.map((r) => {
    const prior = baseline.get(r.case);
    return {
      case: r.case,
      baseline_outcome: prior?.outcome ?? null,
      outcome: r.outcome,
      classification: classify(prior, r),
      // A record written by an older schema, or truncated, may carry no assertions at all.
      failing_assertions: (r.assertions ?? []).filter((a) => a.status === "fail").map((a) => a.id),
    };
  });
  const seen = new Set(current.map((r) => r.case));
  const missing = [...baseline.keys()].filter((c) => !seen.has(c)).sort();

  const totals = { unchanged: 0, regressed: 0, fixed: 0, new: 0, no_verdict: 0, infrastructure: 0, missing_from_run: missing.length };
  for (const c of cases) totals[c.classification]++;

  return {
    schema_version: "0.1.0",
    baseline: { dir: baseDir, git_sha: readRun(baseDir)?.git_sha ?? [...baseline.values()][0]?.git_sha ?? null, cases: baseline.size },
    run: { dir: curDir, git_sha: readRun(curDir)?.git_sha ?? current[0]?.git_sha ?? null, cases: current.length },
    totals,
    cases,
    missing_from_run: missing,
    malformed: { baseline: baseRead.malformed, run: curRead.malformed },
  };
}

export function writeComparison(runDir: string, comparison: Comparison): string {
  const path = join(resolve(runDir), COMPARISON_FILE);
  writeFileSync(path, JSON.stringify(comparison, null, 2) + "\n");
  return path;
}

/** The section appended to the run's summary.md. Ids and classifications only, as everywhere else. */
export function renderComparisonMarkdown(comparison: Comparison): string {
  const L: string[] = [];
  L.push(`## Compared against ${comparison.baseline.git_sha ?? "an unnamed baseline"}`);
  L.push("");
  L.push(`- baseline \`${comparison.baseline.dir}\` (${comparison.baseline.cases} case records)`);
  L.push(`- ${comparison.totals.regressed} regressed, ${comparison.totals.fixed} fixed, ${comparison.totals.unchanged} unchanged, ${comparison.totals.new} new, ${comparison.totals.no_verdict} with a verdict on only one side, ${comparison.totals.infrastructure} infrastructure, ${comparison.totals.missing_from_run} missing from this run`);
  L.push("");
  for (const c of comparison.cases) {
    const detail = c.classification === "regressed" && c.failing_assertions.length
      ? ` — failing assertion(s): ${c.failing_assertions.map((a) => `\`${a}\``).join(", ")}`
      : "";
    L.push(`- \`${c.case}\` — **${c.classification}** (${c.baseline_outcome ?? "no baseline"} → ${c.outcome ?? "no record"})${detail}`);
  }
  for (const c of comparison.missing_from_run) L.push(`- \`${c}\` — **missing from this run** (the baseline has a record and this run does not)`);
  for (const [side, paths] of [["baseline", comparison.malformed.baseline], ["run", comparison.malformed.run]] as const) {
    for (const p of paths) L.push(`- \`${basename(p)}\` — **malformed record** in the ${side} (it could not be read as a case record, so it is neither a verdict nor a missing case)`);
  }
  L.push("");
  return L.join("\n");
}

export type CompareReport = Report & { comparison: Comparison | null };

/** The command: classify, write comparison.json next to the run, append the section to its summary.md. */
export function compareCommand(opts: { baseline: string; run: string; write?: boolean }): CompareReport {
  const report = emptyReport("eval") as CompareReport;
  report.comparison = null;
  report.readiness = "unknown";
  report.readiness_reasons.push("a comparison approves nothing: it says which cases changed verdict between two recorded runs");

  for (const [flag, dir] of [["<baseline-run-dir>", opts.baseline], ["<run-dir>", opts.run]] as const) {
    if (!dir || !existsSync(resolve(dir))) {
      report.errors.push({ category: "missing_file", location: flag, message: `no run directory at ${dir ?? "(none)"}`, remedy: "pass the <out>/<sha> directory a nightly run wrote" });
      report.syntax = "invalid";
      return report;
    }
  }

  const comparison = compareRuns(opts.baseline, opts.run);
  report.comparison = comparison;
  if (!comparison.run.cases) {
    report.errors.push({ category: "missing_file", location: opts.run, message: "this run directory holds no per-case records", remedy: "point at the <out>/<sha> directory a nightly run wrote" });
    return report;
  }
  if (!comparison.baseline.cases) {
    report.warnings.push({ category: "eval_infrastructure", location: opts.baseline, message: "the baseline directory holds no per-case records, so every case is classified new" });
  }

  if (opts.write !== false) {
    writeComparison(opts.run, comparison);
    appendToSummary(resolve(opts.run), renderComparisonMarkdown(comparison));
    report.info.push(`comparison written to ${join(resolve(opts.run), COMPARISON_FILE)} and appended to summary.md`);
  }

  for (const c of comparison.cases.filter((c) => c.classification === "regressed")) {
    report.errors.push({
      category: "eval_case_failed",
      location: `golden/${c.case}`,
      message: `passed in the baseline and fails in this run; failing assertion(s): ${c.failing_assertions.join(", ") || "(none recorded)"}`,
      remedy: "read the retained per-case record before changing either the Analysis or the Golden Question",
    });
  }
  for (const c of comparison.cases.filter((c) => c.classification === "infrastructure")) {
    report.warnings.push({ category: "eval_infrastructure", location: `golden/${c.case}`, message: "one side of this comparison is an infrastructure failure, so no analytical change is claimed" });
  }
  for (const [side, paths] of [["baseline", comparison.malformed.baseline], ["run", comparison.malformed.run]] as const) {
    for (const p of paths) {
      report.warnings.push({ category: "eval_infrastructure", location: p, message: `a malformed record in the ${side} could not be read, so this case is neither compared nor reported missing` });
    }
  }
  report.info.push(`${comparison.totals.regressed} regressed, ${comparison.totals.fixed} fixed, ${comparison.totals.unchanged} unchanged, ${comparison.totals.new} new, ${comparison.totals.no_verdict} with a verdict on only one side, ${comparison.totals.infrastructure} infrastructure`);
  report.content = comparison.missing_from_run.length || comparison.malformed.baseline.length || comparison.malformed.run.length ? "incomplete" : "complete";
  if (comparison.missing_from_run.length) report.info.push(`${comparison.missing_from_run.length} baseline case(s) have no record in this run: ${comparison.missing_from_run.join(", ")}`);
  return report;
}
