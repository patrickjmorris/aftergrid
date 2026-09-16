// What a golden eval run leaves behind: one JSON record per case and one summary, written under
// `<out>/<sha>/`. Contract: docs/contracts/eval.md.
//
// The record is the whole point of the eval: a green run that cannot say which model, which skill versions and
// which commit produced it proves nothing later. Fields that are genuinely unknown in this environment — the
// model id when no model ran, every cost field — are recorded as `null`, never as a zero or a guess.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

export type AssertionStatus = "pass" | "fail" | "not_evaluated";

/**
 * Which kind of thing an assertion is a fact about. `analytical` is about the Analysis — the outcome it
 * reached, the claim type it earned, the numbers it reports. `infrastructure` is about the machinery — the
 * analyzer, the adapter, the fixture data. An eval that cannot tell them apart reports a broken warehouse as a
 * bad answer.
 */
export type AssertionCategory = "analytical" | "infrastructure";

export type Assertion = {
  id: string;
  status: AssertionStatus;
  category: AssertionCategory;
  /** What the Golden Question asked for, in words. */
  expected: string;
  /** What the run actually produced, in words. */
  observed: string;
};

export type CaseOutcome = "pass" | "fail" | "error" | "not_run";

export type CaseRecord = {
  schema_version: "0.1.0";
  case: string;
  outcome: CaseOutcome;
  /** Null unless the case failed; says whether the failure was about the Analysis or about the machinery. */
  failure_category: AssertionCategory | null;
  reason: string;
  analyzer: { name: string; exercised: boolean; source: string | null };
  finding: { dir: string | null; id: string | null; state: string | null; outcome: string | null };
  assertions: Assertion[];
  model: string | null;
  skill_versions: Record<string, string>;
  plugin_version: string | null;
  git_sha: string | null;
  aftergrid_version: string | null;
  started: string;
  finished: string;
  cost: { input_tokens: number | null; output_tokens: number | null; usd: number | null };
  /**
   * Present only when a *bound* rather than the analyzer decided this case: `budget` when the run's wall-clock
   * budget was already spent before the case started (outcome `not_run`), `timeout` when the case outran its
   * per-case timeout (outcome `error`, category infrastructure). Absent on every ordinary case, so an
   * unbounded `aftergrid eval` writes exactly what it wrote before.
   */
  stopped_by?: "budget" | "timeout";
  /**
   * Present only when the analyzer itself reported *how* it broke, as a stable word rather than as prose:
   * `analyzer_exit_<code>`, `analyzer_spawn_failed`, `analyzer_killed`, `analyzer_wrote_nothing`. It travels
   * into summary.md and the issue body, where a message (which can quote a number read out of a Finding)
   * must not. Absent on every ordinary case.
   */
  failure_cause?: string;
};

export type EvalSummary = {
  schema_version: "0.1.0";
  git_sha: string | null;
  aftergrid_version: string | null;
  analyzer: { name: string; exercised: boolean };
  instance: string;
  started: string;
  finished: string;
  totals: { cases: number; pass: number; fail: number; error: number; not_run: number; analytical_failures: number; infrastructure_failures: number };
  cases: { case: string; outcome: CaseOutcome; failure_category: AssertionCategory | null; reason: string }[];
  not_exercised: string[];
};

/** `version` from each promoted skill's frontmatter, or `unversioned` when the skill does not carry one. */
export function collectSkillVersions(repoRoot: string): Record<string, string> {
  const out: Record<string, string> = {};
  const skillsRoot = join(repoRoot, "skills");
  if (!existsSync(skillsRoot)) return out;
  for (const entry of readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
    const skillPath = join(skillsRoot, entry.name, "SKILL.md");
    if (!existsSync(skillPath)) continue;
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?(?:\n|$)/.exec(readFileSync(skillPath, "utf8"));
    let version = "unversioned";
    if (m) {
      try {
        const fm = parseYaml(m[1]!) as Record<string, unknown> | null;
        if (fm && typeof fm.version === "string" && fm.version.trim()) version = fm.version.trim();
      } catch { /* an unparseable frontmatter is the plugin validator's problem, not the eval's */ }
    }
    out[entry.name] = version;
  }
  return out;
}

export function pluginVersion(repoRoot: string): string | null {
  const p = join(repoRoot, ".claude-plugin", "plugin.json");
  if (!existsSync(p)) return null;
  try { return String(JSON.parse(readFileSync(p, "utf8")).version ?? "") || null; } catch { return null; }
}

export function packageVersion(repoRoot: string): string | null {
  const p = join(repoRoot, "package.json");
  if (!existsSync(p)) return null;
  try { return String(JSON.parse(readFileSync(p, "utf8")).version ?? "") || null; } catch { return null; }
}

/** The commit the Engine was at, or null. An eval that cannot name its commit says null rather than guessing. */
export function gitSha(repoRoot: string): string | null {
  try {
    const sha = execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
  } catch { return null; }
}

/** `<out>/<sha>/<case>.json`. `sha` falls back to `unknown-sha` so a run without git still lands somewhere. */
export function recordDir(outDir: string, sha: string | null): string {
  return join(outDir, sha ?? "unknown-sha");
}

export function writeCaseRecord(outDir: string, sha: string | null, record: CaseRecord): string {
  const dir = recordDir(outDir, sha);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${record.case}.json`);
  writeFileSync(path, JSON.stringify(record, null, 2) + "\n");
  return path;
}

export function writeSummary(outDir: string, sha: string | null, summary: EvalSummary): string {
  const dir = recordDir(outDir, sha);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "summary.json");
  writeFileSync(path, JSON.stringify(summary, null, 2) + "\n");
  return path;
}

export function summarise(cases: CaseRecord[], head: Omit<EvalSummary, "totals" | "cases">): EvalSummary {
  const totals = {
    cases: cases.length,
    pass: cases.filter((c) => c.outcome === "pass").length,
    fail: cases.filter((c) => c.outcome === "fail").length,
    error: cases.filter((c) => c.outcome === "error").length,
    not_run: cases.filter((c) => c.outcome === "not_run").length,
    analytical_failures: cases.filter((c) => c.failure_category === "analytical").length,
    infrastructure_failures: cases.filter((c) => c.failure_category === "infrastructure").length,
  };
  return { ...head, totals, cases: cases.map((c) => ({ case: c.case, outcome: c.outcome, failure_category: c.failure_category, reason: c.reason })) };
}
