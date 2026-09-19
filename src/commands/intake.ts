// `aftergrid intake`: run Issue requests in the background with states a human can act on (spec stories 8 and
// 35-37, docs/contracts/intake.md).
//
// The runner is deliberately thin. It does not analyze anything: it claims a request at a stable revision,
// refuses to dispatch when enforcement is absent, hands the request to a harness, then **checks** what came
// back rather than believing it, and reports one of a small set of honest states on the Issue and in one pull
// request per run. Three rules shape almost every line below:
//
//   1. Nothing is reported as dispatched, complete or approved unless it is true. A draft pull request exists
//      or it does not; `check` said evidence is valid or it did not; publication approval is never claimed here.
//   2. Issue text and data are task input, never permission. Nothing in a request can relax preflight, change
//      the Instance policy, add a label the runner does not add on its own, or reach a URL.
//   3. Ids and category names travel; results do not. No number from a result reaches a log line, a comment or
//      a pull request body.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { check } from "./check.ts";
import { emptyReport, type Category, type Report } from "../report.ts";
import { errorClassOf } from "../publication/github.ts";
// @ts-ignore: shared path containment.
import { safePath } from "../../scripts/fixture-safety.mjs";
import { stamp, systemClock, withRetry, type Clock } from "../intake/clock.ts";
import { createClaudeCodeHarness, createFixtureHarness, findingExists, within, type Harness, type HarnessResult, type IntakeRequest, type NeedsInput } from "../intake/harness.ts";
import { addLabel, createFetchIssueSource, NEEDS_INFO_LABEL, READY_FOR_HUMAN_LABEL, TRIGGER_LABEL, type Issue, type IssueSource } from "../intake/issues.ts";
import { branchFor, createFetchPullRequestTarget, type PullRequestRef, type PullRequestTarget } from "../intake/pull-requests.ts";
import { intakePreflight, type PreflightResult } from "../intake/preflight.ts";
import {
  appendLog, claimRun, findingsDirOf, newState, readRequest, readState, relativeToInstance, runDir, runIdFor,
  scratchDir, supersedeOlderRuns, updateState, writeRequest, writeState, type RunState, type RunStatus,
} from "../intake/runs.ts";

/** A deliberately injected fault, used by tests to simulate the process dying mid-run. Never caught. */
export class InjectedFault extends Error {}

/**
 * Run ids this *process* is working on right now. The claim file makes a claim atomic; this set makes two
 * concurrent passes in one process — a poller and a manual `--once`, or two awaited calls — agree about which
 * of them owns the dispatch, without turning an interrupted run into a run nobody ever picks up again.
 *
 * It is not a lease. Two runners in two processes can both take over a run whose state is still `running`; the
 * pull request stays single (it is keyed by run id and looked up before it is created) but the Analysis would
 * run twice. A lease with an expiry is future work, and docs/contracts/intake.md says so.
 */
const ACTIVE = new Set<string>();

export type RunSummary = {
  run_id: string;
  issue: number;
  status: RunStatus | "already_claimed";
  pr: number | null;
  finding_dir: string | null;
  /** Ids, axis words and category names. Never a value from a result. */
  reasons: string[];
};

export type IntakeReport = Report & { runs: RunSummary[] };

export type IntakeOptions = {
  repo?: string;
  label?: string;
  instanceDir?: string;
  cwd?: string;
  settingsPath?: string;
  once?: boolean;
  pollSeconds?: number;
  /** Test seam: stop the poll loop after this many passes. */
  maxPolls?: number;
  harness?: Harness;
  harnessKind?: "fixture" | "command";
  harnessCommand?: string;
  /** Fixture harness only: the Finding directory it copies. */
  fixtureSource?: string;
  source?: IssueSource;
  pullRequests?: PullRequestTarget;
  resume?: string;
  provided?: string[];
  timeoutMs?: number;
  maxAttempts?: number;
  baseBranch?: string;
  clock?: Clock;
  /** Test seam: the preflight result. Defaults to really running it. */
  preflight?: () => PreflightResult;
  /** Test seams for faults that cannot be provoked any other way. */
  faults?: { afterPullRequest?: (ref: PullRequestRef) => void };
};

type Context = {
  instanceRoot: string;
  repo: string;
  label: string;
  findingsDir: string;
  harness: Harness;
  source: IssueSource;
  target: PullRequestTarget;
  clock: Clock;
  maxAttempts: number;
  timeoutMs?: number;
  baseBranch: string;
  automationLogin: string;
  preflight: PreflightResult;
  faults: IntakeOptions["faults"];
  report: IntakeReport;
  /** Run ids this process is already working on, so a concurrent pass never dispatches the same run twice. */
  active: Set<string>;
};

const PUBLICATION_SENTENCE =
  "Publication requires a human APPROVED review on this pull request from a login on the Instance's trusted allowlist, verified at the reviewed commit (docs/contracts/publication.md). This is an automated draft: it is not approved, and nothing in it is an approval.";

const err = (report: Report, category: Category, location: string, message: string, remedy?: string) =>
  report.errors.push({ category, location, message, ...(remedy ? { remedy } : {}) });

export async function intake(opts: IntakeOptions): Promise<IntakeReport> {
  const report = emptyReport("intake") as IntakeReport;
  report.runs = [];
  report.readiness = "unknown";
  report.readiness_reasons.push("publication readiness is a fact about a Finding, verified per Finding by `aftergrid check`; intake never reports approved");
  const clock = opts.clock ?? systemClock;

  const preflight = (opts.preflight ?? (() => intakePreflight({ instanceDir: opts.instanceDir, cwd: opts.cwd, settingsPath: opts.settingsPath })))();
  for (const fact of preflight.facts) report.info.push(`preflight ${fact}`);
  if (!preflight.instance) {
    report.errors.push(...preflight.problems);
    report.syntax = "invalid";
    return report;
  }
  const instanceRoot = preflight.instance.root;
  const publication = (preflight.instance.config as any)?.publication ?? {};
  const repo = opts.repo ?? publication.repository;
  if (typeof repo !== "string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    err(report, "syntax", "--repo", `'${repo ?? ""}' is not an owner/repo string`, "pass --repo owner/repo, or set publication.repository in aftergrid.yaml");
    report.syntax = "invalid";
    return report;
  }

  let harness: Harness;
  try { harness = resolveHarness(opts); }
  catch (e) { err(report, "syntax", "--harness", (e as Error).message); report.syntax = "invalid"; return report; }
  if (!harness.exercised) {
    report.info.push(`harness '${harness.name}': not exercised — no test in this repository runs it and no model runs in CI, so its real behavior is untested`);
  }

  const ctx: Context = {
    instanceRoot,
    repo,
    label: opts.label ?? TRIGGER_LABEL,
    findingsDir: findingsDirOf(instanceRoot),
    harness,
    source: opts.source ?? createFetchIssueSource(),
    target: opts.pullRequests ?? createFetchPullRequestTarget(),
    clock,
    maxAttempts: Math.max(1, opts.maxAttempts ?? 3),
    timeoutMs: opts.timeoutMs,
    baseBranch: opts.baseBranch ?? "main",
    automationLogin: String(publication.automation_login ?? "aftergrid-bot"),
    preflight,
    faults: opts.faults,
    report,
    active: ACTIVE,
  };
  if (!preflight.ok) report.info.push("preflight failed: nothing will be dispatched. Absent enforcement prevents dispatch; there is no bypass flag.");

  try {
    if (opts.resume) await resumeRun(ctx, opts.resume, opts.provided ?? []);
    else await poll(ctx, opts);
  } catch (e) {
    if (e instanceof InjectedFault) throw e;
    err(report, "api_error", ctx.repo, `intake stopped: ${(e as Error).message} (${errorClassOf(e)})`, "the runs already claimed keep their state on disk; rerun to continue them");
  }

  summarize(report);
  return report;
}

function resolveHarness(opts: IntakeOptions): Harness {
  if (opts.harness) return opts.harness;
  const kind = opts.harnessKind ?? (opts.harnessCommand ? "command" : "fixture");
  if (kind === "command") {
    if (!opts.harnessCommand?.trim()) throw new Error("--harness command needs --harness-command \"<template>\"");
    return createClaudeCodeHarness({ command: opts.harnessCommand, timeoutMs: opts.timeoutMs });
  }
  if (!opts.fixtureSource) throw new Error("--harness fixture needs a Finding directory to copy (fixtureSource); it exists for tests and rehearsals, not for real Analyses");
  return createFixtureHarness({ source: opts.fixtureSource });
}

async function poll(ctx: Context, opts: IntakeOptions) {
  const passes = opts.pollSeconds && !opts.once ? (opts.maxPolls ?? Number.POSITIVE_INFINITY) : 1;
  for (let pass = 1; pass <= passes; pass++) {
    const issues = await ctx.source.listLabelled(ctx.repo, ctx.label);
    ctx.report.info.push(`pass ${pass}: ${issues.length} Issue(s) labeled ${ctx.label} in ${ctx.repo}`);
    for (const issue of issues) await processIssue(ctx, issue);
    if (pass < passes) await ctx.clock.sleep(Math.max(1, opts.pollSeconds!) * 1000);
  }
}

/* ------------------------------------------------------------------ one Issue */

async function processIssue(ctx: Context, issue: Issue) {
  const runId = runIdFor(issue);
  const at = stamp(ctx.clock);
  const claim = claimRun(ctx.instanceRoot, runId, { repository: ctx.repo, issue: issue.number, at });

  if (!claim.claimed) {
    const existing = readState(ctx.instanceRoot, runId);
    // A run this process is already working on, or one that reached a state only a human moves on from.
    const settled = !existing || ctx.active.has(runId) || ["complete", "failed", "needs_attention", "needs_input", "superseded"].includes(existing.status);
    if (settled) {
      appendLog(ctx.instanceRoot, runId, { ts: at, event: "already_claimed", ids: { run_id: runId, issue: issue.number }, status: existing?.status ?? "claimed" });
      ctx.report.warnings.push({
        category: "already_claimed", location: runId,
        message: `Issue #${issue.number} at this revision is already claimed by run ${runId} (${existing?.status ?? "claimed"}); no second Analysis was started`,
        remedy: existing?.status === "needs_input" ? `supply what it needs, then \`aftergrid intake --resume ${runId}\`` : undefined,
      });
      push(ctx, { run_id: runId, issue: issue.number, status: "already_claimed", pr: existing?.pr?.number ?? null, finding_dir: existing?.finding_dir ?? null, reasons: [`already claimed (${existing?.status ?? "claimed"})`] });
      return;
    }
    // The claim is there but the run never reached a resting state: a previous runner was interrupted.
    appendLog(ctx.instanceRoot, runId, { ts: at, event: "taken_over", ids: { run_id: runId, issue: issue.number }, status: existing.status });
    ctx.report.info.push(`run ${runId} was interrupted in state ${existing.status}; continuing it rather than starting a second run`);
    ctx.active.add(runId);
    const request = readRequest(ctx.instanceRoot, runId) ?? snapshot(ctx, issue, runId, at);
    try { await dispatch(ctx, request, existing); } finally { ctx.active.delete(runId); }
    return;
  }

  ctx.active.add(runId);
  try { await claimed(ctx, issue, runId, at); } finally { ctx.active.delete(runId); }
}

async function claimed(ctx: Context, issue: Issue, runId: string, at: string) {
  const superseded = supersedeOlderRuns(ctx.instanceRoot, issue.number, runId, at);
  for (const old of superseded) {
    ctx.report.warnings.push({
      category: "superseded", location: old,
      message: `Issue #${issue.number} changed after run ${old} was claimed; ${runId} is the new input revision and ${old}'s artifacts were kept`,
      remedy: `read <instance>/intake/runs/${old}/ for what the earlier revision was asked`,
    });
    push(ctx, { run_id: old, issue: issue.number, status: "superseded", pr: readState(ctx.instanceRoot, old)?.pr?.number ?? null, finding_dir: readState(ctx.instanceRoot, old)?.finding_dir ?? null, reasons: [`superseded by ${runId}`] });
  }

  const request = snapshot(ctx, issue, runId, at);
  writeRequest(ctx.instanceRoot, request);
  let state = newState(runId, ctx.repo, issue.number, at);
  writeState(ctx.instanceRoot, state);
  appendLog(ctx.instanceRoot, runId, { ts: at, event: "claimed", ids: { run_id: runId, issue: issue.number }, status: "claimed" });

  if (!ctx.preflight.ok) { blocked(ctx, state); return; }
  await dispatch(ctx, request, state);
}

function snapshot(ctx: Context, issue: Issue, runId: string, at: string): IntakeRequest {
  return {
    run_id: runId, repository: ctx.repo, issue: issue.number, title: issue.title,
    body: issue.body ?? "", updated_at: issue.updated_at, labels: [...issue.labels], snapshot_at: at,
  };
}

function blocked(ctx: Context, state: RunState) {
  const at = stamp(ctx.clock);
  const reasons = ctx.preflight.problems.map((p) => `${p.category}: ${p.message}`);
  updateState(ctx.instanceRoot, state, { status: "blocked", last_error: reasons.join("; ") }, at);
  appendLog(ctx.instanceRoot, state.run_id, { ts: at, event: "dispatch_refused", ids: { run_id: state.run_id, issue: state.issue }, status: "blocked" });
  for (const p of ctx.preflight.problems) if (!ctx.report.errors.some((e) => e.category === p.category && e.location === p.location)) ctx.report.errors.push(p);
  err(ctx.report, "dispatch_refused", state.run_id,
    `run ${state.run_id} was not dispatched: ${reasons.length} preflight problem(s). Nothing was written under findings/.`,
    "fix the preflight problems above and rerun; there is no flag that dispatches without them");
  push(ctx, { run_id: state.run_id, issue: state.issue, status: "blocked", pr: null, finding_dir: null, reasons });
}

/* ------------------------------------------------------------------ dispatch */

async function dispatch(ctx: Context, request: IntakeRequest, state: RunState) {
  const runId = state.run_id;
  if (!ctx.preflight.ok) { blocked(ctx, state); return; }
  let at = stamp(ctx.clock);
  state = updateState(ctx.instanceRoot, state, { status: "running", attempts: state.attempts + 1 }, at);
  appendLog(ctx.instanceRoot, runId, { ts: at, event: "dispatch", ids: { run_id: runId, issue: state.issue }, status: "running" });

  // The deadline is an abort signal handed to the harness, not a kill: a harness that ignores its signal is not
  // stopped here, and the run is reported as timed out only when that is what actually happened.
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (ctx.timeoutMs && ctx.timeoutMs > 0) {
    timer = setTimeout(() => { timedOut = true; controller.abort(new Error(`the harness exceeded --timeout-ms ${ctx.timeoutMs}`)); }, ctx.timeoutMs);
    (timer as { unref?: () => void }).unref?.();
  }
  let result: HarnessResult;
  try {
    result = await ctx.harness.run(request, {
      instanceRoot: ctx.instanceRoot, runId, runDir: runDir(ctx.instanceRoot, runId),
      scratchDir: scratchDir(ctx.instanceRoot, runId), findingsDir: ctx.findingsDir, signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof InjectedFault) throw e;
    result = { status: "failed", reason: `the harness raised ${errorClassOf(e)}: ${(e as Error).message}` };
  } finally {
    if (timer) clearTimeout(timer);
  }

  at = stamp(ctx.clock);
  appendLog(ctx.instanceRoot, runId, { ts: at, event: "harness_result", ids: { run_id: runId, issue: state.issue }, status: timedOut ? `${result.status} after timeout` : result.status });
  if (timedOut && result.status !== "complete") {
    return failed(ctx, state, `the harness was aborted after --timeout-ms ${ctx.timeoutMs} and came back ${result.status}${result.reason ? `: ${result.reason}` : ""}`);
  }

  if (result.status === "needs_input") return needsInput(ctx, state, result.needs_input ?? []);
  if (result.status === "failed") return failed(ctx, state, result.reason ?? "the harness failed without naming a reason");
  if (result.status === "needs_attention") return needsAttention(ctx, state, [], result.reason ?? "the harness asked for a human to look");
  return complete(ctx, request, state, result);
}

async function complete(ctx: Context, request: IntakeRequest, state: RunState, result: HarnessResult) {
  const runId = state.run_id;
  const dir = result.finding_dir ? resolve(result.finding_dir) : "";
  // Scope: a produced Finding lives inside <instance>/findings or it is not a Finding this run may report.
  if (!dir || !within(ctx.findingsDir, dir) || !findingExists(dir)) {
    ctx.report.errors.push({
      category: "scope_violation", location: dir || "(no directory)",
      message: `run ${runId} reported a Finding outside ${relativeToInstance(ctx.instanceRoot, ctx.findingsDir)}/ or with no manifest.yaml`,
      remedy: "a produced Finding must be a directory inside the Instance's findings/",
    });
    return needsAttention(ctx, state, ["scope_violation"], "the produced Finding is out of scope", dir || null);
  }

  const checked = await check({ dir, github: null });        // offline: no API call, no readiness claim
  const categories = [...new Set([...checked.errors, ...checked.warnings].map((p) => p.category))].sort();
  const at = stamp(ctx.clock);
  appendLog(ctx.instanceRoot, runId, {
    ts: at, event: "check", ids: { run_id: runId, issue: state.issue, finding: checked.finding },
    status: `evidence=${checked.evidence} content=${checked.content} categories=${categories.join("|") || "none"}`,
  });
  if (checked.evidence !== "valid" || checked.errors.length) {
    for (const e of checked.errors) ctx.report.errors.push({ ...e, location: `${relativeToInstance(ctx.instanceRoot, dir)}: ${e.category}`, message: `run ${runId}: evidence problem reported by \`aftergrid check\`` });
    return needsAttention(ctx, state, categories, "`aftergrid check` reported invalid evidence", dir);
  }

  const manifest: any = parseYaml(readFileSync(safePath(dir, "manifest.yaml"), "utf8"));
  const title = `[aftergrid] ${manifest?.finding?.title ?? "Finding"} (run ${runId})`;
  const body = pullRequestBody({
    repo: ctx.repo, issue: state.issue, runId,
    findingRelative: relativeToInstance(ctx.instanceRoot, dir),
    findingId: String(manifest?.finding?.id ?? "unknown"),
    revision: Number(manifest?.finding?.revision ?? 1),
    check: checked, categories,
  });

  let ref: PullRequestRef;
  try { ref = await openOrUpdate(ctx, state, title, body); }
  catch (e) {
    if (e instanceof InjectedFault) throw e;
    return failed(ctx, state, `the Finding is valid but the pull request could not be written: ${errorClassOf(e)} — ${(e as Error).message}`, dir);
  }

  ctx.faults?.afterPullRequest?.(ref);   // test seam: the process dies here, after the pull request exists

  const done = stamp(ctx.clock);
  state = updateState(ctx.instanceRoot, state, { status: "complete", pr: { number: ref.number, url: ref.url }, finding_dir: dir, last_error: null }, done);
  appendLog(ctx.instanceRoot, runId, { ts: done, event: "pull_request", ids: { run_id: runId, issue: state.issue, pr: ref.number, finding: checked.finding }, status: "complete" });

  await notify(ctx, state, READY_FOR_HUMAN_LABEL, [
    `aftergrid run \`${runId}\` produced a Finding and opened draft pull request #${ref.number}.`,
    "",
    `- Finding: \`${checked.finding ?? "unknown"}\` in \`${relativeToInstance(ctx.instanceRoot, dir)}\``,
    "- Evidence check (`aftergrid check`, artifact mode): evidence valid, content complete, SQL not re-executed.",
    "",
    PUBLICATION_SENTENCE,
    "",
    "This comment carries ids and category names only: no query results and no numbers from results.",
  ].join("\n"));

  ctx.report.info.push(`run ${runId}: Finding ${checked.finding} checked valid, draft pull request #${ref.number}`);
  push(ctx, { run_id: runId, issue: state.issue, status: "complete", pr: ref.number, finding_dir: dir, reasons: [`categories: ${categories.join(", ") || "none"}`] });
}

/**
 * One pull request per run: `findByRun` decides, never a local flag. It is asked before the create and again
 * before every retry, so an interruption after the pull request landed — and a retry of a call that had
 * actually succeeded — both end in an update instead of a second pull request.
 */
async function openOrUpdate(ctx: Context, state: RunState, title: string, body: string): Promise<PullRequestRef> {
  const runId = state.run_id;
  const retry = {
    maxAttempts: ctx.maxAttempts, clock: ctx.clock,
    onRetry: ({ attempt, delayMs, error }: { attempt: number; delayMs: number; error: unknown }) => {
      appendLog(ctx.instanceRoot, runId, { ts: stamp(ctx.clock), event: "retry", ids: { run_id: runId, issue: state.issue }, status: `${errorClassOf(error)} attempt=${attempt} backoff_ms=${delayMs}` });
      ctx.report.info.push(`run ${runId}: transient ${errorClassOf(error)} from GitHub; retry ${attempt} after ${delayMs}ms`);
    },
  };
  const existing = await withRetry(() => ctx.target.findByRun(ctx.repo, runId), retry);
  if (existing) {
    appendLog(ctx.instanceRoot, runId, { ts: stamp(ctx.clock), event: "pull_request_reused", ids: { run_id: runId, issue: state.issue, pr: existing.number }, status: "update" });
    return withRetry(() => ctx.target.update(ctx.repo, existing.number, { title, body }), retry);
  }
  return withRetry(() => ctx.target.create(ctx.repo, { title, body, head: branchFor(runId), base: ctx.baseBranch, draft: true }), {
    ...retry,
    recover: () => ctx.target.findByRun(ctx.repo, runId),
  });
}

function needsInput(ctx: Context, state: RunState, needs: NeedsInput[]) {
  const at = stamp(ctx.clock);
  const listed = needs.length ? needs : [{ kind: "unspecified", description: "", owner: "unassigned" }];
  state = updateState(ctx.instanceRoot, state, { status: "needs_input", needs: listed, last_error: null }, at);
  appendLog(ctx.instanceRoot, state.run_id, { ts: at, event: "needs_input", ids: { run_id: state.run_id, issue: state.issue }, status: listed.map((n) => n.kind).join("|") });
  ctx.report.warnings.push({
    category: "needs_input", location: state.run_id,
    message: `run ${state.run_id} paused: ${listed.map((n) => `${n.kind} (owner ${n.owner})`).join(", ")}`,
    remedy: `\`aftergrid intake --repo ${ctx.repo} --resume ${state.run_id} --provided <kind>\`, or answer on Issue #${state.issue}`,
  });
  push(ctx, { run_id: state.run_id, issue: state.issue, status: "needs_input", pr: state.pr?.number ?? null, finding_dir: state.finding_dir, reasons: listed.map((n) => `${n.kind} — ${n.owner}`) });
  return notify(ctx, state, NEEDS_INFO_LABEL, [
    `aftergrid run \`${state.run_id}\` paused: it needs input before the Analysis can continue. Nothing was guessed.`,
    "",
    "Needs (kind — owner):",
    ...listed.map((n) => `- \`${n.kind}\` — ${n.owner}`),
    "",
    `Answer on this Issue, or resume with \`aftergrid intake --repo ${ctx.repo} --resume ${state.run_id} --provided ${listed[0]!.kind}\`.`,
    "",
    "This comment carries kinds, owners and ids only: no data, no query results and no numbers from results.",
  ].join("\n"));
}

function needsAttention(ctx: Context, state: RunState, categories: string[], why: string, dir: string | null = null) {
  const at = stamp(ctx.clock);
  updateState(ctx.instanceRoot, state, { status: "needs_attention", finding_dir: dir ?? state.finding_dir, last_error: why }, at);
  appendLog(ctx.instanceRoot, state.run_id, { ts: at, event: "needs_attention", ids: { run_id: state.run_id, issue: state.issue }, status: categories.join("|") || "unspecified" });
  ctx.report.errors.push({
    category: "needs_attention", location: state.run_id,
    message: `run ${state.run_id}: ${why}. Categories: ${categories.join(", ") || "none"}. No pull request was opened.`,
    remedy: "read the Finding directory named in the run state; the categories say which axis failed",
  });
  push(ctx, { run_id: state.run_id, issue: state.issue, status: "needs_attention", pr: state.pr?.number ?? null, finding_dir: dir ?? state.finding_dir, reasons: categories.length ? categories : [why] });
}

function failed(ctx: Context, state: RunState, reason: string, dir: string | null = null) {
  const at = stamp(ctx.clock);
  const next = updateState(ctx.instanceRoot, state, { status: "failed", last_error: reason, finding_dir: dir ?? state.finding_dir }, at);
  appendLog(ctx.instanceRoot, state.run_id, { ts: at, event: "failed", ids: { run_id: state.run_id, issue: state.issue }, status: `attempts=${next.attempts}` });
  ctx.report.errors.push({
    category: "harness_failed", location: state.run_id,
    message: `run ${state.run_id} failed after ${next.attempts} attempt(s): ${reason}`,
    remedy: `the run's artifacts are kept under intake/runs/${state.run_id}/; rerun \`aftergrid intake\` to try the same request again`,
  });
  push(ctx, { run_id: state.run_id, issue: state.issue, status: "failed", pr: state.pr?.number ?? null, finding_dir: dir ?? state.finding_dir, reasons: [reason, `attempts: ${next.attempts}`] });
}

/** Label and comment, both retried on a transient error. Neither can turn a true state into a false one: a
 *  failure here is reported as a failure to notify, and the run's own state is left as it really is. */
async function notify(ctx: Context, state: RunState, label: string, body: string) {
  const retry = { maxAttempts: ctx.maxAttempts, clock: ctx.clock };
  try {
    const issue = await withRetry(() => ctx.source.getIssue(ctx.repo, state.issue), retry);
    const added = await withRetry(() => addLabel(ctx.source, ctx.repo, issue, label), retry);
    appendLog(ctx.instanceRoot, state.run_id, { ts: stamp(ctx.clock), event: added ? "labeled" : "label_already_present", ids: { run_id: state.run_id, issue: state.issue }, status: label });
    await withRetry(() => ctx.source.comment(ctx.repo, state.issue, body), retry);
    appendLog(ctx.instanceRoot, state.run_id, { ts: stamp(ctx.clock), event: "commented", ids: { run_id: state.run_id, issue: state.issue }, status: state.status });
  } catch (e) {
    if (e instanceof InjectedFault) throw e;
    appendLog(ctx.instanceRoot, state.run_id, { ts: stamp(ctx.clock), event: "notify_failed", ids: { run_id: state.run_id, issue: state.issue }, status: errorClassOf(e) });
    ctx.report.warnings.push({
      category: "api_error", location: `${ctx.repo}#${state.issue}`,
      message: `run ${state.run_id} is ${state.status}, but the Issue could not be updated (${errorClassOf(e)}); the state on disk is the truth`,
      remedy: "check the token's Issues: write permission, then rerun",
    });
  }
}

/* ------------------------------------------------------------------ resume */

async function resumeRun(ctx: Context, runId: string, provided: string[]) {
  const state = readState(ctx.instanceRoot, runId);
  const request = readRequest(ctx.instanceRoot, runId);
  if (!state || !request) {
    err(ctx.report, "missing_file", runId, `no claimed run ${runId} under ${relativeToInstance(ctx.instanceRoot, runDir(ctx.instanceRoot, runId))}`, "list <instance>/intake/runs/ for run ids");
    ctx.report.syntax = "invalid";
    return;
  }
  if (state.status !== "needs_input") {
    err(ctx.report, "needs_input", runId, `run ${runId} is ${state.status}; --resume continues a run that paused for input`, state.status === "complete" ? "nothing to resume: this run already produced a pull request" : "rerun `aftergrid intake` to continue a run that was interrupted");
    return;
  }

  // A human comment left after the request was snapshotted counts as the answer. The runner cannot tell which
  // need a sentence answers, so a new comment marks every outstanding need provided — and says so.
  let newComments: NonNullable<IntakeRequest["provided_comments"]> = [];
  try {
    const issue = await ctx.source.getIssue(ctx.repo, state.issue);
    newComments = (issue.comments ?? [])
      .filter((c) => c.author !== ctx.automationLogin && c.created_at > request.snapshot_at)
      .map((c) => ({ id: c.id, author: c.author, created_at: c.created_at, body: c.body }));
  } catch (e) {
    ctx.report.warnings.push({ category: "api_error", location: `${ctx.repo}#${state.issue}`, message: `the Issue's comments could not be read (${errorClassOf(e)}); only --provided was considered` });
  }

  const needs = state.needs ?? [];
  const already = new Set(request.provided ?? []);
  for (const kind of provided) already.add(kind);
  if (newComments.length) for (const n of needs) already.add(n.kind);
  const outstanding = needs.filter((n) => !already.has(n.kind));

  const at = stamp(ctx.clock);
  const next: IntakeRequest = { ...request, provided: [...already], ...(newComments.length ? { provided_comments: [...(request.provided_comments ?? []), ...newComments] } : {}) };
  writeRequest(ctx.instanceRoot, next);
  appendLog(ctx.instanceRoot, runId, {
    ts: at, event: "resume", ids: { run_id: runId, issue: state.issue },
    status: `provided=${[...already].join("|") || "none"} comments=${newComments.length} outstanding=${outstanding.length}`,
  });

  if (outstanding.length) {
    ctx.report.warnings.push({
      category: "needs_input", location: runId,
      message: `run ${runId} still needs ${outstanding.map((n) => `${n.kind} (owner ${n.owner})`).join(", ")}; it was not dispatched`,
      remedy: `add --provided <kind> for each, or answer on Issue #${state.issue}`,
    });
    push(ctx, { run_id: runId, issue: state.issue, status: "needs_input", pr: state.pr?.number ?? null, finding_dir: state.finding_dir, reasons: outstanding.map((n) => `${n.kind} — ${n.owner}`) });
    return;
  }
  if (newComments.length) ctx.report.info.push(`run ${runId}: ${newComments.length} new Issue comment(s) recorded; the runner cannot tell which need each answers, so all outstanding needs were marked provided`);
  if (ctx.active.has(runId)) {
    ctx.report.warnings.push({ category: "already_claimed", location: runId, message: `run ${runId} is already being dispatched in this process; --resume did not start a second dispatch` });
    return;
  }
  ctx.active.add(runId);
  try { await dispatch(ctx, next, state); } finally { ctx.active.delete(runId); }
}

/* ------------------------------------------------------------------ report */

function push(ctx: Context, summary: RunSummary) {
  const at = ctx.report.runs.findIndex((r) => r.run_id === summary.run_id);
  if (at >= 0) ctx.report.runs[at] = summary; else ctx.report.runs.push(summary);
}

function summarize(report: IntakeReport) {
  const runs = report.runs;
  const completed = runs.filter((r) => r.status === "complete");
  report.state = runs.length === 1 ? runs[0]!.status : `${runs.length} run(s)`;
  report.outcome = runs.length ? [...new Set(runs.map((r) => r.status))].sort().join(",") : "no_requests";
  report.content = runs.length > 0 && runs.every((r) => r.status === "complete") ? "complete" : "incomplete";
  report.evidence = runs.some((r) => r.status === "needs_attention") ? "invalid" : completed.length ? "valid" : "not_evaluated";
  report.sql_execution = "not_performed";
  if (report.errors.some((e) => e.category === "dispatch_refused")) report.readiness = "not_ready";
  for (const r of runs) report.info.push(`run ${r.run_id}: issue #${r.issue}, ${r.status}${r.pr ? `, pull request #${r.pr}` : ""}${r.finding_dir ? `, ${r.finding_dir}` : ""}`);
}

export function pullRequestBody(o: {
  repo: string; issue: number; runId: string; findingRelative: string; findingId: string; revision: number;
  check: Report; categories: string[];
}): string {
  return [
    `Opened by \`aftergrid intake\` for run \`${o.runId}\`.`,
    "",
    `- Issue: https://github.com/${o.repo}/issues/${o.issue}`,
    `- Run id: \`${o.runId}\``,
    `- Finding directory: \`${o.findingRelative}\``,
    `- Finding id: \`${o.findingId}\` revision ${o.revision}`,
    "",
    "## Check",
    "",
    `\`aftergrid check\` (artifact mode): syntax ${o.check.syntax}, content ${o.check.content}, evidence ${o.check.evidence}, sql ${o.check.sql_execution}.`,
    `Categories reported: ${o.categories.length ? o.categories.map((c) => `\`${c}\``).join(", ") : "none"}.`,
    "",
    "## Publication",
    "",
    PUBLICATION_SENTENCE,
    "",
    "Category names, ids and axis words only: this body carries no query results and no numbers from results. Read the Finding itself for the evidence.",
  ].join("\n");
}
