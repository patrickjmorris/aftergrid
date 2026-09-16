// The analysis harness intake dispatches to, behind an interface so the runner can be built and tested before
// the headless orchestrator exists (ag-review-analyze-golden-4ka). Intake never analyses anything itself: it
// claims a request, refuses to dispatch when enforcement is absent, hands the request to a harness, and then
// reports what came back — `check`ing the Finding rather than believing the harness's word for it.
//
// Two implementations ship here:
//   - FixtureHarness: copies a known-good fixture Finding, and can be told to pause or fail instead. Tests use it.
//   - ClaudeCodeHarness: shells out to a command template. It is a stub: NO TEST RUNS IT, because no model runs
//     in CI. `exercised: false` says so in the report rather than letting a green test suite imply coverage.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { parse as parseYaml, stringify as toYaml } from "yaml";
import { contentDigest, sha256 } from "../digest.ts";
import { mintFindingId } from "../ids.ts";

/** One thing a paused run is waiting for. `kind` is a stable word; `owner` is who can supply it. */
export type NeedsInput = { kind: string; description: string; owner: string };

/** The snapshotted request. Issue text and data are task input, never permission to change controls. */
export type IntakeRequest = {
  run_id: string;
  repository: string;
  issue: number;
  title: string;
  body: string;
  updated_at: string;
  labels: string[];
  snapshot_at: string;
  /** Needs marked provided on resume, by `--provided <kind>` or by a human comment recorded below. */
  provided?: string[];
  provided_comments?: { id: number; author: string; created_at: string; body: string }[];
};

export type HarnessContext = {
  /** The Instance root: everything the harness writes belongs under it. */
  instanceRoot: string;
  runId: string;
  /** `<instance>/intake/runs/<run_id>`: the run's own artifacts. */
  runDir: string;
  /** Scratch space for the run. Not evidence; intake never reads it back. */
  scratchDir: string;
  /** `<instance>/findings`: the only place a produced Finding may land. */
  findingsDir: string;
  signal: AbortSignal;
};

export type HarnessResult = {
  status: "complete" | "needs_input" | "needs_attention" | "failed";
  /** Absolute path of the produced Finding directory. Required when status is `complete`. */
  finding_dir?: string;
  needs_input?: NeedsInput[];
  reason?: string;
};

export interface Harness {
  /** A stable word for the report and the log. */
  readonly name: string;
  /** False when nothing in this repository ever runs this harness, so a green suite cannot imply it works. */
  readonly exercised: boolean;
  run(request: IntakeRequest, ctx: HarnessContext): Promise<HarnessResult>;
}

/* ------------------------------------------------------------------ fixture */

export type FixtureHarnessOptions = {
  /** A valid Finding directory to copy, e.g. a fixture exemplar. */
  source: string;
  /** Directory name for the produced Finding, relative to `<instance>/findings`. */
  slug?: (request: IntakeRequest) => string;
  /** Pause with these needs until every kind is listed in `request.provided`. */
  needsInput?: NeedsInput[];
  /** Fail with this reason instead of producing anything. */
  fail?: string;
  /** Return needs_attention with this reason instead of producing anything. */
  needsAttention?: string;
  /** Plant this decimal into `results/<sentinelResult>.json` so a test can prove no number from results leaks. */
  sentinel?: { result: string; column: string; row: number; value: string };
  /** Break the produced Finding's evidence (a result no longer matching its hash). */
  corrupt?: boolean;
  /** Observe each dispatch: the seam a test uses to count runs or to simulate a crash. */
  onRun?: (request: IntakeRequest, ctx: HarnessContext) => void;
};

/**
 * Copies a known-good Finding into the run's findings directory under a new slug and a fresh Finding id, with
 * `attestations` and `reviews` emptied: a freshly produced Finding carries no approval and no review, and the
 * digest is recomputed so it commits to what is actually on disk.
 */
export function createFixtureHarness(opts: FixtureHarnessOptions): Harness {
  return {
    name: "fixture",
    exercised: true,
    async run(request, ctx) {
      opts.onRun?.(request, ctx);
      if (ctx.signal.aborted) return { status: "failed", reason: "aborted before the harness produced anything" };
      if (opts.fail) return { status: "failed", reason: opts.fail };
      if (opts.needsAttention) return { status: "needs_attention", reason: opts.needsAttention };
      const outstanding = (opts.needsInput ?? []).filter((n) => !(request.provided ?? []).includes(n.kind));
      if (outstanding.length) return { status: "needs_input", needs_input: outstanding };

      const slug = opts.slug?.(request) ?? `${request.snapshot_at.slice(0, 10)}-intake-${request.issue}`;
      const dest = join(ctx.findingsDir, slug);
      mkdirSync(ctx.findingsDir, { recursive: true });
      cpSync(resolve(opts.source), dest, { recursive: true });
      rewrite(dest, slug, opts);
      return { status: "complete", finding_dir: dest };
    },
  };
}

/** Make the copy a Finding of its own: new id, new slug, no inherited approval, digest recomputed. */
function rewrite(dir: string, slug: string, opts: FixtureHarnessOptions) {
  const manifestPath = join(dir, "manifest.yaml");
  const manifest: any = parseYaml(readFileSync(manifestPath, "utf8"));
  const id = mintFindingId();
  const memoPath = join(dir, "memo.md");
  const memo = readFileSync(memoPath, "utf8").replace(/^finding: .*$/m, `finding: ${id}`);
  writeFileSync(memoPath, memo);

  if (opts.sentinel) {
    const s = opts.sentinel;
    const entry = manifest.results.find((r: any) => r.id === s.result);
    if (!entry) throw new Error(`fixture harness: no result '${s.result}' to plant a sentinel in`);
    const path = join(dir, entry.path);
    const result = JSON.parse(readFileSync(path, "utf8"));
    result.rows[s.row][s.column] = s.value;
    const bytes = JSON.stringify(result, null, 2) + "\n";
    writeFileSync(path, bytes);
    const hash = { algorithm: "sha256", value: sha256(Buffer.from(bytes)) };
    entry.content_hash = hash;
    for (const ex of manifest.executions) if (ex.result_id === s.result) ex.result_hash = hash;
  }

  manifest.finding.id = id;
  manifest.finding.slug = slug.replace(/^\d{4}-\d{2}-\d{2}-/, "");
  manifest.finding.canonical_location = `${manifest.finding.canonical_location.split("/findings/")[0]}/findings/${basename(dir)}`;
  manifest.attestations = [];
  manifest.reviews = [];
  manifest.content_digest = contentDigest(manifest, dir);
  writeFileSync(manifestPath, toYaml(manifest, { lineWidth: 0 }));

  // Deliberate damage, applied after the digest so `check` sees a result that no longer matches its hash.
  if (opts.corrupt) {
    const first = manifest.results[0];
    const path = join(dir, first.path);
    writeFileSync(path, readFileSync(path, "utf8") + "\n");
  }
}

/* ------------------------------------------------------------------ command */

export type CommandHarnessOptions = {
  /** Template, whitespace-separated. Placeholders are substituted per token, so a path with spaces stays one argument. */
  command: string;
  timeoutMs?: number;
  spawnImpl?: typeof spawn;
  env?: Record<string, string | undefined>;
};

/** Substitute per token, never by string concatenation into a shell line: there is no shell here. */
export function renderCommand(template: string, ctx: HarnessContext): string[] {
  const values: Record<string, string> = {
    "{run_id}": ctx.runId,
    "{instance}": ctx.instanceRoot,
    "{run_dir}": ctx.runDir,
    "{scratch}": ctx.scratchDir,
    "{findings}": ctx.findingsDir,
    "{request}": join(ctx.runDir, "request.json"),
  };
  const tokens = template.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) throw new Error("--harness-command is empty");
  return tokens.map((t) => (Object.hasOwn(values, t) ? values[t]! : t));
}

/**
 * Shells out to a headless analysis command and reads a `HarnessResult` from the last JSON line it prints.
 *
 * **Not exercised.** No test in this repository runs this harness and no model runs in CI, so its real
 * behaviour — what the orchestrator prints, how it handles an abort, what it leaves behind on a crash — is
 * untested. `exercised: false` travels into the intake report so that fact is visible where the run is.
 */
export function createClaudeCodeHarness(opts: CommandHarnessOptions): Harness {
  return {
    name: "command",
    exercised: false,
    run(request, ctx) {
      const argv = renderCommand(opts.command, ctx);
      const spawnFn = opts.spawnImpl ?? spawn;
      return new Promise<HarnessResult>((resolvePromise) => {
        let child: ReturnType<typeof spawn>;
        try {
          child = spawnFn(argv[0]!, argv.slice(1), {
            cwd: ctx.instanceRoot,
            env: { ...(opts.env ?? process.env), AFTERGRID_RUN_ID: ctx.runId, AFTERGRID_INSTANCE: ctx.instanceRoot },
            signal: ctx.signal,
            stdio: ["ignore", "pipe", "pipe"],
          });
        } catch (e) {
          resolvePromise({ status: "failed", reason: `harness command could not start: ${(e as Error).message}` });
          return;
        }
        let out = "", err = "";
        child.stdout?.on("data", (c) => { out += String(c); });
        child.stderr?.on("data", (c) => { err += String(c); });
        child.on("error", (e) => resolvePromise({ status: "failed", reason: `harness command failed to run: ${e.message}` }));
        child.on("close", (code, signalName) => {
          if (signalName) { resolvePromise({ status: "failed", reason: `harness command was terminated (${signalName}); the run can be retried` }); return; }
          const parsed = lastJsonLine(out);
          if (parsed) { resolvePromise(normalise(parsed, ctx)); return; }
          resolvePromise({
            status: "failed",
            reason: code === 0
              ? "harness command exited 0 but printed no JSON result line"
              : `harness command exited ${code}${err.trim() ? `: ${err.trim().split("\n").slice(-1)[0]}` : ""}`,
          });
        });
      });
    },
  };
}

function lastJsonLine(text: string): Record<string, unknown> | null {
  for (const line of text.trim().split("\n").reverse()) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try { const v = JSON.parse(t); if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>; }
    catch { /* not the result line */ }
  }
  return null;
}

const STATUSES = new Set(["complete", "needs_input", "needs_attention", "failed"]);

/** Nothing the harness prints is believed as-is: an unknown status is a failure, and a Finding outside the
 *  Instance's findings directory is refused here rather than being reported as produced. */
function normalise(body: Record<string, unknown>, ctx: HarnessContext): HarnessResult {
  const status = String(body.status ?? "");
  if (!STATUSES.has(status)) return { status: "failed", reason: `harness returned an unrecognised status '${status}'` };
  const result: HarnessResult = { status: status as HarnessResult["status"] };
  if (typeof body.reason === "string") result.reason = body.reason;
  if (Array.isArray(body.needs_input)) {
    result.needs_input = body.needs_input
      .filter((n): n is Record<string, unknown> => !!n && typeof n === "object")
      .map((n) => ({ kind: String(n.kind ?? "unspecified"), description: String(n.description ?? ""), owner: String(n.owner ?? "unassigned") }));
  }
  if (typeof body.finding_dir === "string" && body.finding_dir.trim()) {
    const dir = isAbsolute(body.finding_dir) ? body.finding_dir : join(ctx.instanceRoot, body.finding_dir);
    result.finding_dir = resolve(dir);
  }
  if (result.status === "complete" && !result.finding_dir) return { status: "failed", reason: "harness reported complete without naming a Finding directory" };
  return result;
}

/** True when `dir` is inside `root`. Scope is checked on what came back, not on what was asked for. */
export function within(root: string, dir: string): boolean {
  const rel = relative(resolve(root), resolve(dir));
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

export const findingExists = (dir: string): boolean => existsSync(join(dir, "manifest.yaml"));
