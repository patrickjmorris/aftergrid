// Turning a nightly failure into one actionable issue — and only one.
// Contract: docs/contracts/eval.md ("Nightly"). Bead: ag-nightly-eval-0dv.
//
// Two rules govern everything here:
//
//   1. **One issue per failure, not one per night.** Every issue body carries a marker
//      `<!-- aftergrid-eval:<fingerprint> -->`. Before opening anything the sink looks for that marker among the
//      open issues; if it is there the run comments on the existing issue instead. A failure that repeats for a
//      week is one issue with seven comments, not seven issues.
//   2. **Identifiers only.** An issue names the case, the assertion ids, the category, the run's sha and model
//      and the artifact paths. It never carries a query, a result, a number read out of a Finding, a prompt or
//      a credential: those live in the retained run artifacts, and `src/nightly.test.ts` greps a planted
//      sentinel over every issue body to keep it that way.
//
// Only **analytical** failures open an issue. An infrastructure error says the machinery broke, not that the
// Analysis is wrong; it is recorded in run.json and summary.md and reported as `eval_infrastructure`, because
// filing it as a regression would send a reader to read the wrong thing.
import { resolve } from "node:path";
import { assertRepo, createApi, type Api, type ApiOptions } from "../intake/api.ts";
import { emptyReport, type Report } from "../report.ts";
import { RUN_FILE, readRun, type EvalFailure, type NightlyRun } from "./nightly.ts";

export const ISSUE_LABEL = "aftergrid-eval";
export const MARKER_PREFIX = "aftergrid-eval:";

export const markerFor = (fingerprint: string): string => `<!-- ${MARKER_PREFIX}${fingerprint} -->`;

export type EvalIssue = {
  id: number | string;
  title: string;
  body: string;
  url?: string | null;
};

export type NewIssue = { title: string; body: string; labels: string[] };

/**
 * Where a nightly failure is reported. Three operations, so a fake is trivial and no test touches GitHub.
 *
 * `find` is the dedup: given a fingerprint it returns the open issue already carrying that marker, or null.
 */
export interface IssueSink {
  find(fingerprint: string): Promise<EvalIssue | null>;
  create(issue: NewIssue): Promise<EvalIssue>;
  comment(issue: EvalIssue, body: string): Promise<void>;
}

/* ------------------------------------------------------------------ what an issue says */

export function issueTitle(failure: EvalFailure): string {
  return `nightly eval: ${failure.case} fails ${failure.assertion_id}`;
}

/** Identifiers, versions and artifact paths. Nothing read out of a Finding. */
export function issueBody(failure: EvalFailure, run: NightlyRun, artifactBase?: string | null): string {
  const artifact = artifactBase ? `${artifactBase.replace(/\/+$/, "")}/${failure.record}` : failure.record;
  const summary = artifactBase ? `${artifactBase.replace(/\/+$/, "")}/summary.md` : "summary.md";
  return [
    markerFor(failure.fingerprint),
    `A scheduled golden eval recorded an **${failure.category}** failure.`,
    "",
    `- case: \`${failure.case}\``,
    `- assertion: \`${failure.assertion_id}\``,
    `- category: \`${failure.category}\``,
    `- fingerprint: \`${failure.fingerprint}\``,
    `- revision: \`${run.git_sha ?? "unknown"}\``,
    `- model: \`${run.model ?? "none — no model ran"}\``,
    `- aftergrid: \`${run.aftergrid_version ?? "unknown"}\`, plugin \`${run.plugin_version ?? "unknown"}\``,
    `- analyzer: \`${run.analyzer.kind}\`${run.analyzer.exercised ? "" : " (not exercised by any test in this repository)"}`,
    `- skill versions: ${Object.entries(run.skill_versions).map(([k, v]) => `\`${k}@${v}\``).join(", ") || "none recorded"}`,
    `- run artifacts: \`${artifact}\`, \`${summary}\``,
    "",
    "What the assertion means, and what an honest Analysis must do to hold it: docs/contracts/eval.md#the-assertions.",
    "",
    "This issue carries identifiers only. The expected and observed values, the Finding and the queries stay in",
    "the retained run artifacts linked above; a nightly eval is evaluation material and never a merge gate.",
  ].join("\n");
}

/** A repeat of a failure that already has an issue: the new run's revision and artifacts, nothing else. */
export function commentBody(failure: EvalFailure, run: NightlyRun, artifactBase?: string | null): string {
  const artifact = artifactBase ? `${artifactBase.replace(/\/+$/, "")}/${failure.record}` : failure.record;
  return [
    markerFor(failure.fingerprint),
    `Still failing on \`${run.git_sha ?? "unknown"}\` (model \`${run.model ?? "none — no model ran"}\`, analyzer \`${run.analyzer.kind}\`).`,
    "",
    `- case: \`${failure.case}\`, assertion: \`${failure.assertion_id}\` (${failure.category})`,
    `- run started \`${run.started}\`${run.partial ? " — this run was PARTIAL, so some cases were not attempted" : ""}`,
    `- run artifacts: \`${artifact}\``,
  ].join("\n");
}

/* ------------------------------------------------------------------ the reporting step */

export type ReportOutcome = {
  created: { fingerprint: string; issue: EvalIssue }[];
  commented: { fingerprint: string; issue: EvalIssue }[];
  /** Failures that deliberately open nothing, with the reason. */
  skipped: { fingerprint: string; reason: string }[];
  /** Failures the sink refused or errored on. Never silent: a sink that could not report is reported. */
  errors: { fingerprint: string; message: string }[];
};

export type ReportOptions = {
  run: NightlyRun;
  sink: IssueSink;
  /** Prefix for artifact links, e.g. `eval-runs/<sha>`. Relative by contract; never a credentialed URL. */
  artifactBase?: string | null;
  labels?: string[];
};

/**
 * One pass over a run's failures: comment where the fingerprint already has an open issue, create where it does
 * not, and skip everything that is not an analytical failure.
 */
export async function reportFailures(opts: ReportOptions): Promise<ReportOutcome> {
  const out: ReportOutcome = { created: [], commented: [], skipped: [], errors: [] };
  const seen = new Set<string>();
  for (const failure of opts.run.failures) {
    if (seen.has(failure.fingerprint)) continue;
    seen.add(failure.fingerprint);
    if (failure.category !== "analytical") {
      out.skipped.push({ fingerprint: failure.fingerprint, reason: `an infrastructure failure (${failure.cause ?? "unclassified"}) says the machinery broke, not that the Analysis is wrong` });
      continue;
    }
    try {
      const existing = await opts.sink.find(failure.fingerprint);
      if (existing) {
        await opts.sink.comment(existing, commentBody(failure, opts.run, opts.artifactBase));
        out.commented.push({ fingerprint: failure.fingerprint, issue: existing });
        continue;
      }
      const issue = await opts.sink.create({
        title: issueTitle(failure),
        body: issueBody(failure, opts.run, opts.artifactBase),
        labels: opts.labels ?? [ISSUE_LABEL],
      });
      out.created.push({ fingerprint: failure.fingerprint, issue });
    } catch (e) {
      out.errors.push({ fingerprint: failure.fingerprint, message: (e as Error).message });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ the command */

export type IssueReport = Report & { outcome: ReportOutcome | null };

/**
 * `aftergrid eval report <run-dir>`: file the failures a run already recorded.
 *
 * It reads `run.json` and never re-runs anything, so the reporting step in a workflow cannot overwrite the run
 * it is reporting on, and a retry files the same failures against the same fingerprints.
 */
export async function reportCommand(opts: {
  runDir: string;
  repo?: string | null;
  artifactBase?: string | null;
  /** Test seam and dry run: a sink that is not GitHub. */
  sink?: IssueSink;
  dryRun?: boolean;
}): Promise<IssueReport> {
  const report = emptyReport("eval") as IssueReport;
  report.outcome = null;
  report.readiness = "unknown";
  report.readiness_reasons.push("reporting a failure approves nothing and re-runs nothing: it files what the run already recorded");

  const dir = resolve(opts.runDir);
  const run = readRun(dir);
  if (!run) {
    report.errors.push({ category: "missing_file", location: dir, message: `no ${RUN_FILE} here`, remedy: "point at the <out>/<sha> directory `aftergrid eval nightly` wrote" });
    report.syntax = "invalid";
    return report;
  }
  if (!run.failures.length) {
    report.content = "complete";
    report.info.push("this run recorded no failure, so nothing is filed");
    report.outcome = { created: [], commented: [], skipped: [], errors: [] };
    return report;
  }

  let sink = opts.sink ?? null;
  if (!sink) {
    if (opts.dryRun) {
      report.content = "complete";
      report.info.push(`${run.failures.filter((f) => f.category === "analytical").length} analytical failure(s) would be filed; --dry-run contacted nothing`);
      report.outcome = { created: [], commented: [], skipped: [], errors: [] };
      return report;
    }
    if (!opts.repo) {
      report.errors.push({ category: "incomplete", location: "--repo", message: "no repository to report to", remedy: "pass --repo owner/repo, or set publication.repository in the Instance's aftergrid.yaml" });
      return report;
    }
    try { sink = createGitHubIssueSink({ repo: opts.repo }); }
    catch (e) {
      report.errors.push({ category: "api_error", location: "--repo", message: (e as Error).message, remedy: "the run's own artifacts are unaffected: the failures are recorded in run.json" });
      return report;
    }
  }

  const outcome = await reportFailures({ run, sink, artifactBase: opts.artifactBase ?? null });
  report.outcome = outcome;
  report.info.push(`${outcome.created.length} issue(s) opened, ${outcome.commented.length} comment(s) on an issue that already existed, ${outcome.skipped.length} failure(s) not filed as analytical regressions`);
  for (const e of outcome.errors) {
    report.errors.push({ category: "api_error", location: `fingerprint ${e.fingerprint}`, message: e.message, remedy: "the failure is still recorded in the run artifacts; re-run this step once the API is reachable" });
  }
  report.content = outcome.errors.length ? "incomplete" : "complete";
  return report;
}

/* ------------------------------------------------------------------ the GitHub sink */

export type GitHubIssueSinkOptions = ApiOptions & {
  /** owner/repo. From the Instance policy (`publication.repository`) or `--repo`; never from Issue text. */
  repo: string;
  api?: Api;
  label?: string;
};

/** The open-issue search is bounded: 20 pages of 100 is 2000 open eval issues, far past anything sane. */
export const SEARCH_PAGE_SIZE = 100;
export const SEARCH_MAX_PAGES = 20;

/**
 * The real sink. It reads the open issues carrying the eval label and looks for the fingerprint marker in their
 * bodies, rather than trusting a text search index to have caught up: a search that silently missed would open
 * a duplicate, which is the one thing this is here to prevent.
 *
 * That is also why it pages. A single `per_page=100` GET stops looking at the hundredth open issue, and every
 * failure past it would be filed again every night. It follows pages until a short one ends the list, and if it
 * runs out of pages without an answer it **refuses** — the caller records an `api_error` and files nothing,
 * because a missing issue is recoverable and a stream of duplicates is not.
 *
 * The token comes from GITHUB_TOKEN / GH_TOKEN through `src/intake/api.ts` and from nowhere else. It is never
 * logged and never written into an issue body.
 */
export function createGitHubIssueSink(options: GitHubIssueSinkOptions): IssueSink {
  const repo = assertRepo(options.repo);
  const api = options.api ?? createApi({ ...options, userAgent: options.userAgent ?? "aftergrid-eval" });
  const label = options.label ?? ISSUE_LABEL;
  return {
    async find(fingerprint) {
      const marker = markerFor(fingerprint);
      for (let page = 1; page <= SEARCH_MAX_PAGES; page++) {
        const body = await api("GET", `/repos/${repo}/issues?state=open&per_page=${SEARCH_PAGE_SIZE}&page=${page}&labels=${encodeURIComponent(label)}`);
        if (!Array.isArray(body)) return null;
        for (const raw of body) {
          // The Issues endpoint returns pull requests too; a pull request is not an eval issue.
          if (raw?.pull_request) continue;
          const text = typeof raw?.body === "string" ? raw.body : "";
          if (!text.includes(marker)) continue;
          return { id: Number(raw.number), title: String(raw.title ?? ""), body: text, url: typeof raw.html_url === "string" ? raw.html_url : null };
        }
        // A short page is the end of the list, and the fingerprint is genuinely not open.
        if (body.length < SEARCH_PAGE_SIZE) return null;
      }
      throw new Error(`search window exhausted: ${SEARCH_MAX_PAGES} pages of ${SEARCH_PAGE_SIZE} open '${label}' issues did not settle whether this failure already has one, so none was created rather than risking a duplicate`);
    },
    async create(issue) {
      const created: any = await api("POST", `/repos/${repo}/issues`, { title: issue.title, body: issue.body, labels: issue.labels });
      return { id: Number(created?.number), title: String(created?.title ?? issue.title), body: issue.body, url: typeof created?.html_url === "string" ? created.html_url : null };
    },
    async comment(issue, body) {
      await api("POST", `/repos/${repo}/issues/${Number(issue.id)}/comments`, { body });
    },
  };
}

/* ------------------------------------------------------------------ the fake sink */

export type FakeIssueSink = IssueSink & {
  readonly issues: EvalIssue[];
  readonly comments: { issue: number | string; body: string }[];
  readonly calls: string[];
};

/** The test double. It holds issues in memory and contacts nothing. */
export function createFakeIssueSink(seed: EvalIssue[] = []): FakeIssueSink {
  const issues: EvalIssue[] = seed.map((i) => ({ ...i }));
  const comments: { issue: number | string; body: string }[] = [];
  const calls: string[] = [];
  let next = issues.length + 1;
  return {
    issues,
    comments,
    calls,
    async find(fingerprint) {
      calls.push(`find ${fingerprint}`);
      return issues.find((i) => i.body.includes(markerFor(fingerprint))) ?? null;
    },
    async create(issue) {
      calls.push(`create ${issue.title}`);
      const created: EvalIssue = { id: next++, title: issue.title, body: issue.body, url: `https://example.invalid/issues/${next - 1}` };
      issues.push(created);
      return created;
    },
    async comment(issue, body) {
      calls.push(`comment ${issue.id}`);
      comments.push({ issue: issue.id, body });
    },
  };
}
