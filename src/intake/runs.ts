// Run identity, the claim, the state file and the log. Everything a run needs to survive a restart lives on
// disk under `<instance>/intake/runs/<run_id>/`, and every path goes through the shared `safePath`.
//
// Identity is derived from the request, not minted: `intake_<issue>_<sha256(number + body + updated_at)[:12]>`.
// Two consequences the contract leans on:
//   - the same Issue at the same revision always produces the same run id, so a duplicate or concurrent trigger
//     finds the existing claim instead of starting a second Analysis;
//   - an Issue edited after dispatch produces a *different* run id, so an edit is a new input revision rather
//     than a silent change of what the running Analysis was asked.
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, openSync, closeSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
// @ts-ignore: shared path containment and error type.
import { safePath, ContractError } from "../../scripts/fixture-safety.mjs";
import type { NeedsInput, IntakeRequest } from "./harness.ts";
import type { Issue } from "./issues.ts";

export const RUN_ID_RE = /^intake_\d{1,18}_[0-9a-f]{12}$/;

export type RunStatus =
  | "claimed"        // the claim file exists; nothing has been dispatched
  | "blocked"        // preflight refused: enforcement or policy is absent, so nothing was dispatched
  | "running"        // handed to the harness
  | "needs_input"    // paused: named things are missing, and guessing is not allowed
  | "needs_attention"// something came back that a human must look at (invalid evidence, out-of-scope output)
  | "complete"       // a Finding was produced, checked, and a draft pull request exists
  | "failed"         // a technical failure, with a recoverable reason
  | "superseded";    // the Issue was edited after dispatch; a newer revision owns the request

export type RunState = {
  run_id: string;
  repository: string;
  issue: number;
  status: RunStatus;
  attempts: number;
  pr: { number: number; url?: string } | null;
  finding_dir: string | null;
  last_error: string | null;
  /** What a `needs_input` pause is waiting for, so `--resume` can tell when it has been supplied. */
  needs?: NeedsInput[];
  superseded_by?: string;
  created: string;
  updated: string;
};

export type LogLine = {
  ts: string;
  event: string;
  ids: { run_id: string; issue?: number; pr?: number; finding?: string };
  status: string;
};

/** `intake_<issue>_<sha256(issue number + issue body + updated_at)[:12]>`. */
export function runIdFor(issue: Pick<Issue, "number" | "body" | "updated_at">): string {
  const digest = createHash("sha256").update(`${issue.number}\n${issue.body ?? ""}\n${issue.updated_at ?? ""}`).digest("hex");
  return `intake_${issue.number}_${digest.slice(0, 12)}`;
}

export function assertRunId(runId: string): string {
  if (!RUN_ID_RE.test(runId)) throw new ContractError("unsafe_path", runId, `'${runId}' is not an intake run id`);
  return runId;
}

export const runsRoot = (instanceRoot: string): string => safePath(instanceRoot, "intake/runs");
export const runDir = (instanceRoot: string, runId: string): string => safePath(instanceRoot, `intake/runs/${assertRunId(runId)}`);
export const runFile = (instanceRoot: string, runId: string, name: string): string => safePath(instanceRoot, `intake/runs/${assertRunId(runId)}/${name}`);

/**
 * Create-if-absent, atomically: `wx` either creates the claim or tells us somebody else already did. This is
 * the whole of the concurrency story — two triggers for the same Issue revision race for one file, and the
 * loser reports `already_claimed` rather than running a second Analysis.
 */
export function claimRun(instanceRoot: string, runId: string, meta: { repository: string; issue: number; at: string }): { claimed: boolean; path: string } {
  const path = runFile(instanceRoot, runId, "claim.json");
  mkdirSync(dirname(path), { recursive: true });
  try {
    const fd = openSync(path, "wx");
    try { writeFileSync(fd, JSON.stringify({ run_id: runId, ...meta, pid: process.pid }, null, 2) + "\n"); }
    finally { closeSync(fd); }
    return { claimed: true, path };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") return { claimed: false, path };
    throw e;
  }
}

const writeJson = (path: string, value: unknown) => {
  mkdirSync(dirname(path), { recursive: true });
  // Written beside the destination and renamed, so a reader never sees half a state file.
  const tmp = `${path}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n");
  renameSync(tmp, path);
};

const readJson = <T>(path: string): T | null => {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf8")) as T; } catch { return null; }
};

export const writeRequest = (instanceRoot: string, request: IntakeRequest): string => {
  const path = runFile(instanceRoot, request.run_id, "request.json");
  writeJson(path, request);
  return path;
};
export const readRequest = (instanceRoot: string, runId: string): IntakeRequest | null =>
  readJson<IntakeRequest>(runFile(instanceRoot, runId, "request.json"));

export const writeState = (instanceRoot: string, state: RunState): string => {
  const path = runFile(instanceRoot, state.run_id, "state.json");
  writeJson(path, state);
  return path;
};
export const readState = (instanceRoot: string, runId: string): RunState | null =>
  readJson<RunState>(runFile(instanceRoot, runId, "state.json"));

export function newState(runId: string, repository: string, issue: number, at: string): RunState {
  return { run_id: runId, repository, issue, status: "claimed", attempts: 0, pr: null, finding_dir: null, last_error: null, created: at, updated: at };
}

/** Every write goes through here so `updated` is never stale and the change is logged with the same clock. */
export function updateState(instanceRoot: string, state: RunState, patch: Partial<RunState>, at: string): RunState {
  const next: RunState = { ...state, ...patch, updated: at };
  writeState(instanceRoot, next);
  return next;
}

/** One line per event. Ids and statuses only: no query results, no numbers from results, no credentials. */
export function appendLog(instanceRoot: string, runId: string, line: LogLine): void {
  const path = runFile(instanceRoot, runId, "log.jsonl");
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(line) + "\n");
}

export function readLog(instanceRoot: string, runId: string): LogLine[] {
  const path = runFile(instanceRoot, runId, "log.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as LogLine);
}

export function listRunIds(instanceRoot: string): string[] {
  let root: string;
  try { root = runsRoot(instanceRoot); } catch { return []; }
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory() && RUN_ID_RE.test(e.name)).map((e) => e.name).sort();
}

/**
 * An Issue edited after dispatch arrives as a new run id. The older run for the same Issue is marked
 * `superseded` and its artifacts are kept: a partial Analysis is evidence about what was asked, and deleting
 * it would hide the edit rather than record it.
 */
export function supersedeOlderRuns(instanceRoot: string, issue: number, currentRunId: string, at: string): string[] {
  const done = new Set<RunStatus>(["complete", "failed", "superseded"]);
  const superseded: string[] = [];
  for (const id of listRunIds(instanceRoot)) {
    if (id === currentRunId) continue;
    const state = readState(instanceRoot, id);
    if (!state || state.issue !== issue || done.has(state.status)) continue;
    updateState(instanceRoot, state, { status: "superseded", superseded_by: currentRunId }, at);
    appendLog(instanceRoot, id, { ts: at, event: "superseded", ids: { run_id: id, issue }, status: "superseded" });
    superseded.push(id);
  }
  return superseded;
}

/** The scratch directory a run's harness may use. Not evidence: intake never reads it back. */
export function scratchDir(instanceRoot: string, runId: string): string {
  const path = runFile(instanceRoot, runId, "scratch");
  mkdirSync(path, { recursive: true });
  return path;
}

export const relativeToInstance = (instanceRoot: string, path: string): string => {
  const prefix = instanceRoot.endsWith("/") ? instanceRoot : instanceRoot + "/";
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
};

export const findingsDirOf = (instanceRoot: string): string => safePath(instanceRoot, "findings");
