// `aftergrid eval --golden <id|all>`: run Golden Questions end to end and record what happened.
// Contract: docs/contracts/eval.md. Golden Questions: docs/contracts/golden-questions.md.
//
// The runner does four things and nothing else: it creates a Finding from a raw ask in a throwaway copy of the
// Instance, hands that Finding directory to an analyzer, asserts the Golden Question's expectations against
// whatever came back, and writes a record. It never edits a Finding, never approves one, and never turns a
// broken analyzer into a wrong answer: an analyzer that crashes, a warehouse that will not open and a golden
// whose own reference query no longer reproduces its value are all `infrastructure`, reported apart from the
// `analytical` verdicts.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { DuckDbAdapter } from "../adapters/duckdb.ts";
import { AdapterError } from "../adapters/contract.ts";
import { newFinding } from "../commands/new-finding.ts";
import { emptyReport, type Report } from "../report.ts";
import {
  collectSkillVersions, gitSha, packageVersion, pluginVersion, recordDir, summarise,
  writeCaseRecord, writeSummary, type Assertion, type CaseOutcome, type CaseRecord, type EvalSummary,
} from "./record.ts";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const DEFAULT_INSTANCE = join(REPO_ROOT, "fixtures", "instance", "analytics");
const DEFAULT_FIXTURE_RUNS = join(REPO_ROOT, "fixtures", "runs");

/**
 * The per-case spend ceiling substituted into an analyzer template as `{max_cost_usd}`.
 *
 * The runner does not meter anything: it hands the number to the analyzer, which is what enforces it (the
 * headless CLI's own `--max-budget-usd`). What the runner records is what the analyzer *reported* spending.
 */
export const DEFAULT_MAX_COST_USD = 2;

/** A revision name has to be usable as one directory component: `--sha` can come from a workflow input. */
export const SHA_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/* ------------------------------------------------------------------ goldens */

export type GoldenQuestion = {
  id: string;
  raw_ask: string;
  reader: string;
  expected: {
    outcome: string;
    definition_ids: string[];
    tables_read: string[];
    claim_type?: "descriptive" | "associational" | "causal";
    values?: { id: string; reference: string; value: number | string | null; tolerance: number; unit: string }[];
    must_not?: string[];
    must_state?: string[];
  };
  /** The evidence constraints an honest Analysis must respect (schema/golden-question.schema.json). */
  constraints?: {
    window?: { start: string; end: string; timezone: string };
    population?: string;
    data_to?: string;
    required_checks?: string[];
  };
  reference: { parameters?: Record<string, string | number | boolean>; queries: { id: string; row_key: string; sql: string }[] };
};

export function loadGoldens(instanceDir: string): GoldenQuestion[] {
  const dir = join(instanceDir, "golden");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .sort()
    .map((f) => parseYaml(readFileSync(join(dir, f), "utf8")) as GoldenQuestion);
}

/* ------------------------------------------------------------------ the Instance's definition library */

/** One entry of `<instance>/definitions/`: which version of a Definition is current there, and its lifecycle. */
export type InstanceDefinition = { id: string; version: number | string | null; lifecycle: string | null };

/**
 * The Instance's Definition library, by id.
 *
 * The Golden Question names definition **ids** and says nothing about versions
 * (schema/golden-question.schema.json: "any version"), so the version an honest Analysis must cite is not in
 * the golden — it is whatever the Instance currently approves. This is where that fact comes from, and it is
 * what `definition_versions` asserts the Finding against.
 */
export function loadDefinitions(instanceDir: string): Map<string, InstanceDefinition> {
  const out = new Map<string, InstanceDefinition>();
  const dir = join(instanceDir, "definitions");
  if (!existsSync(dir)) return out;
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith(".md")) continue;
    let text: string;
    try { text = readFileSync(join(dir, file), "utf8"); } catch { continue; }
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?(?:\n|$)/.exec(text);
    if (!m) continue;
    let front: any;
    try { front = parseYaml(m[1]!); } catch { continue; }
    const id = typeof front?.id === "string" && front.id.trim() ? front.id.trim() : file.replace(/\.md$/, "");
    out.set(id, {
      id,
      version: typeof front?.version === "number" || typeof front?.version === "string" ? front.version : null,
      lifecycle: typeof front?.lifecycle === "string" ? front.lifecycle : null,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ analyzers */

export type AnalyzerContext = {
  golden: GoldenQuestion;
  rawAsk: string;
  /** The Finding directory `aftergrid new finding` just created, inside a throwaway copy of the Instance. */
  findingDir: string;
  instanceRoot: string;
  /** This Engine checkout. An analyzer that must load the shipped plugin (`/analyze`) needs to be told where it is. */
  repoRoot: string;
  /** The spend ceiling the analyzer is asked to enforce on itself, in US dollars. */
  maxCostUsd: number;
};

/** What an analyzer said it spent. Every field is null unless the analyzer reported a figure: never a zero, never a guess. */
export type AnalyzerCost = { input_tokens: number | null; output_tokens: number | null; usd: number | null };

export type AnalyzerOutcome =
  | { status: "produced"; finding_dir: string; source?: string | null; model?: string | null; cost?: AnalyzerCost | null }
  /** The analyzer ran and refused the case. Not a failure: the case is `not_run`. */
  | { status: "declined"; reason: string }
  /**
   * The analyzer broke. This is infrastructure — the case is an `error` with no assertion — and `cause` is the
   * stable word summary.md and any issue body will carry. It is never a verdict on the Analysis.
   */
  | { status: "failed"; cause: string; reason: string };

export interface Analyzer {
  readonly name: string;
  /** False when nothing in this repository runs it, so a green suite cannot imply it works. */
  readonly exercised: boolean;
  analyze(ctx: AnalyzerContext): Promise<AnalyzerOutcome>;
}

/**
 * Replays a recorded run: a prepared Finding directory under `<root>/<golden id>/output` (or
 * `<root>/4ka-<golden id>/output`). This is how the assertion machinery is tested without a model. With no
 * recorded output it declines and says so; a declined case is `not_run`, never a pass.
 */
export function createFixtureAnalyzer(opts: { root?: string } = {}): Analyzer {
  const root = resolve(opts.root ?? DEFAULT_FIXTURE_RUNS);
  return {
    name: "fixture",
    exercised: true,
    async analyze(ctx) {
      const candidates = [join(root, ctx.golden.id, "output"), join(root, `4ka-${ctx.golden.id}`, "output")];
      const source = candidates.find((c) => existsSync(join(c, "manifest.yaml")));
      if (!source) {
        return { status: "declined", reason: `no recorded run for '${ctx.golden.id}' under ${root}; this case needs a live analyzer (--analyzer command)` };
      }
      rmSync(ctx.findingDir, { recursive: true, force: true });
      cpSync(source, ctx.findingDir, { recursive: true });
      return { status: "produced", finding_dir: ctx.findingDir, source, model: null };
    },
  };
}

/** Substitute per token, never into a shell line: there is no shell here. */
export function renderAnalyzerCommand(template: string, ctx: AnalyzerContext): string[] {
  const values: Record<string, string> = {
    "{finding_dir}": ctx.findingDir,
    "{raw_ask}": ctx.rawAsk,
    "{instance}": ctx.instanceRoot,
    "{golden}": ctx.golden.id,
    "{reader}": ctx.golden.reader,
    "{repo_root}": ctx.repoRoot,
    "{max_cost_usd}": String(ctx.maxCostUsd),
  };
  const tokens = template.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) throw new Error("--analyzer-command is empty");
  return tokens.map((t) => (Object.hasOwn(values, t) ? values[t]! : t));
}

/**
 * Shells out to a headless `/analyze` and reads its last JSON line.
 *
 * **Not exercised by a model.** No model runs in this repository's suite, so what a real orchestrator prints
 * and how long it takes are untested; `exercised: false` travels into the run record and the report rather than
 * letting a green suite imply coverage. The *failure* paths below are exercised, by binaries that stand in for
 * the ways an orchestrator breaks (`src/eval.test.ts`).
 *
 * What counts as "produced" is deliberately narrow. `aftergrid new finding` has already written a draft
 * manifest.yaml into the Finding directory before the analyzer starts, so the presence of a manifest proves
 * nothing: a crashed analyzer would be scored against the Golden Question and every expectation would "fail",
 * manufacturing analytical failures out of a broken orchestrator. A Finding is produced only when the command
 * exited 0 **and** the draft manifest is no longer the one `new finding` wrote.
 */
export function createCommandAnalyzer(opts: { command: string; timeoutMs?: number; spawnImpl?: typeof spawn; model?: string | null }): Analyzer {
  return {
    name: "command",
    exercised: false,
    analyze(ctx) {
      let argv: string[];
      try { argv = renderAnalyzerCommand(opts.command, ctx); }
      catch (e) { return Promise.resolve({ status: "declined", reason: (e as Error).message } as AnalyzerOutcome); }
      const spawnFn = opts.spawnImpl ?? spawn;
      // The draft as it stands before the analyzer touches it. An analyzer that leaves this unchanged produced
      // nothing, whatever its exit code said.
      const draft = manifestDigest(ctx.findingDir);
      return new Promise<AnalyzerOutcome>((resolvePromise) => {
        let child: ReturnType<typeof spawn>;
        try {
          child = spawnFn(argv[0]!, argv.slice(1), {
            cwd: ctx.instanceRoot,
            env: { ...process.env, AFTERGRID_INSTANCE: ctx.instanceRoot, AFTERGRID_FINDING_DIR: ctx.findingDir },
            stdio: ["ignore", "pipe", "pipe"],
            timeout: opts.timeoutMs,
          });
        } catch (e) {
          resolvePromise({ status: "failed", cause: "analyzer_spawn_failed", reason: `the analyzer command could not start: ${(e as Error).message}` });
          return;
        }
        let out = "", err = "";
        child.stdout?.on("data", (c) => { out += String(c); });
        child.stderr?.on("data", (c) => { err += String(c); });
        child.on("error", (e) => resolvePromise({ status: "failed", cause: "analyzer_spawn_failed", reason: `the analyzer command failed to run: ${e.message}` }));
        child.on("close", (code) => {
          const parsed = lastJsonLine(out);
          const dir = parsed && typeof parsed.finding_dir === "string" && parsed.finding_dir.trim()
            ? (isAbsolute(parsed.finding_dir) ? parsed.finding_dir : join(ctx.instanceRoot, parsed.finding_dir))
            : ctx.findingDir;
          const tail = err.trim() ? `: ${err.trim().split("\n").slice(-1)[0]}` : "";
          // An analyzer that says it declined has made a judgement, and that is not a crash.
          if (parsed && parsed.status === "declined") {
            resolvePromise({ status: "declined", reason: String(parsed.reason ?? "the analyzer declined without a reason") });
            return;
          }
          if (code !== 0) {
            resolvePromise({
              status: "failed",
              cause: code === null ? "analyzer_killed" : `analyzer_exit_${code}`,
              reason: code === null
                ? `the analyzer command was killed before it exited (a timeout or a signal)${tail}`
                : `the analyzer command exited ${code}${tail}`,
            });
            return;
          }
          const produced = existsSync(join(dir, "manifest.yaml"))
            && !(resolve(dir) === resolve(ctx.findingDir) && draft !== null && manifestDigest(dir) === draft);
          if (produced) {
            resolvePromise({ status: "produced", finding_dir: resolve(dir), source: argv.join(" "), model: opts.model ?? null, cost: costFromEnvelope(parsed) });
            return;
          }
          resolvePromise({
            status: "failed",
            cause: "analyzer_wrote_nothing",
            reason: `the analyzer command exited 0 and left the draft Finding at ${dir} exactly as \`new finding\` wrote it${tail}`,
          });
        });
      });
    },
  };
}

/** The bytes of a Finding's manifest, or null when there is none to compare against. */
function manifestDigest(dir: string): string | null {
  try { return createHash("sha256").update(readFileSync(join(dir, "manifest.yaml"))).digest("hex"); }
  catch { return null; }
}

/**
 * What the headless CLI's `--output-format json` envelope said the run cost.
 *
 * Only what is actually there: a missing or non-finite figure stays null, because an eval that records 0 where
 * it means "unknown" makes a spend look free.
 */
export function costFromEnvelope(parsed: Record<string, unknown> | null): AnalyzerCost {
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const usage = (parsed?.usage ?? null) as Record<string, unknown> | null;
  return {
    input_tokens: num(usage?.input_tokens),
    output_tokens: num(usage?.output_tokens),
    usd: num(parsed?.total_cost_usd),
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

/* ------------------------------------------------------------------ assertions */

const CLAIM_STRENGTH: Record<string, number> = { descriptive: 0, associational: 1, causal: 2 };

/** Lowercase, punctuation to spaces, whitespace collapsed: a crude lexical screen, and only that. */
export function normalisePhrase(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const pass = (id: string, category: Assertion["category"], expected: string, observed: string): Assertion => ({ id, status: "pass", category, expected, observed });
const fail = (id: string, category: Assertion["category"], expected: string, observed: string): Assertion => ({ id, status: "fail", category, expected, observed });
const skip = (id: string, category: Assertion["category"], expected: string, observed: string): Assertion => ({ id, status: "not_evaluated", category, expected, observed });

/** Every numeric cell in the Finding's saved results, as decimal numbers, with where it came from. */
function numericCells(dir: string, manifest: any): { where: string; value: number }[] {
  const out: { where: string; value: number }[] = [];
  for (const res of manifest.results ?? []) {
    let data: any;
    try { data = JSON.parse(readFileSync(join(dir, res.path), "utf8")); } catch { continue; }
    for (const row of data.rows ?? []) {
      for (const [col, raw] of Object.entries(row)) {
        if (raw === null || typeof raw === "boolean") continue;
        const n = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isFinite(n) || (typeof raw === "string" && !/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(raw))) continue;
        out.push({ where: `${res.id}.${row[data.row_key]}.${col}`, value: n });
      }
    }
  }
  return out;
}

export type AssertOptions = {
  golden: GoldenQuestion;
  dir: string;
  manifest: any;
  memo: string;
  /** Reference values recomputed from the warehouse, or a reason they could not be. */
  reference: { status: "checked"; mismatches: string[] } | { status: "unavailable"; reason: string };
  /** The Instance's Definition library, for asserting the version the Finding cites. Null when it was not read. */
  definitions?: Map<string, InstanceDefinition> | null;
};

/** The Golden Question's expectations, one assertion each. Nothing here writes to the Finding. */
export function assertCase(opts: AssertOptions): Assertion[] {
  const { golden, manifest, memo } = opts;
  const out: Assertion[] = [];
  const expected = golden.expected;

  const gotOutcome = manifest?.finding?.outcome ?? "(none)";
  out.push(gotOutcome === expected.outcome
    ? pass("outcome", "analytical", `outcome ${expected.outcome}`, `outcome ${gotOutcome}`)
    : fail("outcome", "analytical", `outcome ${expected.outcome}`, `outcome ${gotOutcome}`));

  const citedDefs: string[] = (manifest?.definitions ?? []).map((d: any) => String(d.id));
  const missingDefs = expected.definition_ids.filter((d) => !citedDefs.includes(d));
  out.push(expected.definition_ids.length === 0
    ? skip("definitions_cited", "analytical", "no definition is required", `the Finding cites ${citedDefs.join(", ") || "none"}`)
    : missingDefs.length === 0
      ? pass("definitions_cited", "analytical", `cites ${expected.definition_ids.join(", ")}`, `cites ${citedDefs.join(", ") || "none"}`)
      : fail("definitions_cited", "analytical", `cites ${expected.definition_ids.join(", ")}`, `does not cite ${missingDefs.join(", ")}`));

  // The version, not just the id. The golden names ids only, so the version an honest Analysis must cite is the
  // one the Instance's library currently carries: citing a superseded or differently-lifecycled Definition is a
  // different Analysis from the one the Golden Question describes.
  out.push(assertDefinitionVersions(expected.definition_ids, manifest, opts.definitions ?? null));

  // Only tables the Snapshot *declares* it read. An input id is a name the author chose, not provenance, so it
  // is never taken as a table: a Finding that named its extracts after the tables would otherwise satisfy the
  // permitted-evidence check with no recorded source at all.
  const snapshotTables = new Set<string>();
  for (const input of manifest?.snapshot?.inputs ?? []) {
    for (const t of input?.source?.tables ?? []) snapshotTables.add(String(t));
  }
  const unread = expected.tables_read.filter((t) => !snapshotTables.has(t));
  out.push(expected.tables_read.length === 0
    ? skip("tables_read", "analytical", "no table is required", `the Snapshot retains ${[...snapshotTables].join(", ") || "nothing"}`)
    : unread.length === 0
      ? pass("tables_read", "analytical", `reads ${expected.tables_read.join(", ")}`, `the Snapshot retains ${[...snapshotTables].sort().join(", ")}`)
      : fail("tables_read", "analytical", `reads ${expected.tables_read.join(", ")}`, `the Snapshot retains no ${unread.join(", ")}`));

  // The golden's own numbers, recomputed from the warehouse. A mismatch is a fixture or data problem.
  if (!(expected.values ?? []).length) {
    out.push(skip("reference_values", "infrastructure", "no reference value is declared", "nothing to recompute"));
  } else if (opts.reference.status === "unavailable") {
    out.push(skip("reference_values", "infrastructure", `${expected.values!.length} reference value(s) recomputed from the warehouse`, opts.reference.reason));
  } else {
    out.push(opts.reference.mismatches.length === 0
      ? pass("reference_values", "infrastructure", `${expected.values!.length} reference value(s) recomputed from the warehouse`, "every one reproduced within tolerance")
      : fail("reference_values", "infrastructure", `${expected.values!.length} reference value(s) recomputed from the warehouse`, opts.reference.mismatches.join("; ")));
  }

  // The Finding's own saved results have to contain the numbers the Golden Question expects.
  const cells = numericCells(opts.dir, manifest);
  for (const v of expected.values ?? []) {
    const id = `value:${v.id}`;
    if (typeof v.value !== "number") {
      out.push(skip(id, "analytical", `${v.id} = ${JSON.stringify(v.value)}`, "a not-available or text expectation is judged by the render contract, not by searching result cells"));
      continue;
    }
    const hit = cells.find((c) => Math.abs(c.value - v.value) <= v.tolerance);
    if (hit) { out.push(pass(id, "analytical", `${v.value} ± ${v.tolerance} ${v.unit}`, `${hit.value} at ${hit.where}`)); continue; }
    const nearest = cells.reduce<{ where: string; value: number } | null>((best, c) => (!best || Math.abs(c.value - v.value) < Math.abs(best.value - v.value) ? c : best), null);
    out.push(fail(id, "analytical", `${v.value} ± ${v.tolerance} ${v.unit} somewhere in the saved results`, nearest ? `nearest saved value is ${nearest.value} at ${nearest.where}` : "the Finding saved no numeric result"));
  }

  // `must_not` is a substring screen with one informative outcome. A memo that reproduces the forbidden wording
  // fails. A memo that does not has proved nothing: the goldens' entries are prose descriptions of a forbidden
  // conclusion ("recommend keeping or rolling back the price"), which no memo reproduces verbatim, so recording
  // the absence as a pass would count an assertion that can never fire as evidence the Finding held. It is
  // `not_evaluated`, and the Question and Method reviewers do the judging.
  const memoNorm = normalisePhrase(memo);
  (expected.must_not ?? []).forEach((phrase, i) => {
    const id = `must_not:${i + 1}:${normalisePhrase(phrase).slice(0, 40).replace(/ /g, "_")}`;
    const expectation = `the memo does not reproduce "${phrase}"`;
    out.push(memoNorm.includes(normalisePhrase(phrase))
      ? fail(id, "analytical", expectation, "the memo reproduces that wording")
      : skip(id, "analytical", expectation, "the memo does not reproduce that wording, which is not evidence it avoided the conclusion: a substring screen cannot see the conclusion drawn in other words"));
  });

  const answerClaim = (manifest?.claims ?? []).find((c: any) => c.answer_bearing) ?? (manifest?.claims ?? [])[0];
  if (!expected.claim_type) {
    out.push(skip("claim_type", "analytical", "no claim type is declared", `the answer-bearing Claim is ${answerClaim?.type ?? "(none)"}`));
  } else if (!answerClaim) {
    out.push(fail("claim_type", "analytical", `at most ${expected.claim_type}`, "the Finding has no Claim"));
  } else {
    const got = String(answerClaim.type);
    const stronger = (CLAIM_STRENGTH[got] ?? 99) > (CLAIM_STRENGTH[expected.claim_type] ?? 0);
    out.push(stronger
      ? fail("claim_type", "analytical", `at most ${expected.claim_type}`, `the answer-bearing Claim is ${got}`)
      : pass("claim_type", "analytical", `at most ${expected.claim_type}`, `the answer-bearing Claim is ${got}`));
  }

  out.push(...assertConstraints(golden, manifest));

  return out;
}

/** The cited Definition's version against the Instance's current one. Version, then lifecycle. */
function assertDefinitionVersions(expectedIds: string[], manifest: any, library: Map<string, InstanceDefinition> | null): Assertion {
  const id = "definition_versions";
  if (!expectedIds.length) return skip(id, "analytical", "no definition is required", "nothing to version");
  const known = expectedIds.filter((d) => library?.has(d));
  if (!library || !known.length) {
    return skip(id, "infrastructure", `each of ${expectedIds.join(", ")} is cited at the Instance's current version`,
      library ? `the Instance library declares none of ${expectedIds.join(", ")}, so no current version exists to compare against` : "the Instance's definition library was not read");
  }
  const cited: any[] = manifest?.definitions ?? [];
  const wanted = known.map((d) => `${d} v${library.get(d)!.version ?? "(none)"} (${library.get(d)!.lifecycle ?? "no lifecycle"})`);
  const observed: string[] = [];
  const problems: string[] = [];
  for (const d of known) {
    const lib = library.get(d)!;
    const got = cited.find((c) => String(c?.id) === d);
    if (!got) { problems.push(`${d} is not cited at all`); continue; }
    observed.push(`${d} v${got.version ?? "(none)"} (${got.lifecycle ?? "no lifecycle"})`);
    if (String(got.version ?? "") !== String(lib.version ?? "")) {
      problems.push(`${d} is cited at version ${got.version ?? "(none)"}, and the Instance's current version is ${lib.version ?? "(none)"}`);
    } else if (String(got.lifecycle ?? "") !== String(lib.lifecycle ?? "")) {
      problems.push(`${d} is cited as ${got.lifecycle ?? "(no lifecycle)"}, and the Instance library records it as ${lib.lifecycle ?? "(none)"}`);
    }
  }
  return problems.length === 0
    ? pass(id, "analytical", `cites ${wanted.join(", ")}`, `cites ${observed.join(", ")}`)
    : fail(id, "analytical", `cites ${wanted.join(", ")}`, problems.join("; "));
}

/**
 * The golden's `constraints` block: the evidence the case is allowed to rest on.
 *
 * `window`, `data_to` and `required_checks` are declared in fields a Finding also declares, so each is compared
 * directly. `population` is prose and is not asserted here — like `expected.must_state`, a reviewer judges it.
 */
function assertConstraints(golden: GoldenQuestion, manifest: any): Assertion[] {
  const out: Assertion[] = [];
  const c = golden.constraints ?? {};

  const window = c.window;
  const got = manifest?.question?.window ?? {};
  const shape = (w: any) => `${w?.start ?? "(none)"}..${w?.end ?? "(none)"} ${w?.timezone ?? "(no timezone)"}`;
  out.push(!window
    ? skip("constraint:window", "analytical", "the Golden Question constrains no window", `the Finding's Question window is ${shape(got)}`)
    : shape(got) === shape(window)
      ? pass("constraint:window", "analytical", `the Question window is ${shape(window)}`, `the Finding's Question window is ${shape(got)}`)
      : fail("constraint:window", "analytical", `the Question window is ${shape(window)}`, `the Finding's Question window is ${shape(got)}`));

  const dataTo = c.data_to;
  const coverage = manifest?.coverage?.data_to;
  out.push(!dataTo
    ? skip("constraint:data_to", "analytical", "the Golden Question constrains no data cut-off", `the Finding covers data to ${coverage ?? "(none declared)"}`)
    : String(coverage ?? "") === dataTo
      ? pass("constraint:data_to", "analytical", `data to ${dataTo}`, `the Finding covers data to ${coverage}`)
      : fail("constraint:data_to", "analytical", `data to ${dataTo}`, `the Finding covers data to ${coverage ?? "(none declared)"}`));

  const required = c.required_checks ?? [];
  const kinds = new Set((manifest?.checks ?? []).map((k: any) => String(k?.kind)));
  const recorded = [...kinds].sort().join(", ") || "no Checks";
  const missing = required.filter((k) => !kinds.has(k));
  out.push(!required.length
    ? skip("required_checks", "analytical", "the Golden Question requires no Check kind", `the Finding records ${recorded}`)
    : missing.length === 0
      ? pass("required_checks", "analytical", `runs a ${required.join(", ")} Check`, `the Finding records ${recorded}`)
      : fail("required_checks", "analytical", `runs a ${required.join(", ")} Check`, `the Finding records no ${missing.join(", ")} Check (it records ${recorded})`));

  return out;
}

/* ------------------------------------------------------------------ the run */

export type EvalOptions = {
  /** A Golden Question id, or `all`. */
  golden?: string;
  analyzer?: "fixture" | "command";
  analyzerCommand?: string;
  /** Test seam: an analyzer object, used instead of building one from the flags. */
  analyzerImpl?: Analyzer;
  instanceDir?: string;
  outDir?: string;
  /** Where recorded runs live, for the fixture analyzer. */
  fixtureRoot?: string;
  sha?: string;
  model?: string;
  /** Date used for the throwaway Finding directory name. */
  date?: string;
  now?: () => Date;
  /**
   * Wall-clock budget for the whole run, in milliseconds. A case that has not started when the budget is spent
   * is recorded `not_run` with `stopped_by: "budget"` and is never attempted: the run says which cases it did
   * not reach rather than reporting a suite it only partly ran. Omitted (the default) means no budget, which is
   * what `aftergrid eval` has always done.
   */
  budgetMs?: number;
  /**
   * Per-case timeout, in milliseconds. A case that outruns it is recorded as an infrastructure `error` with
   * `stopped_by: "timeout"`; nothing is claimed about the Analysis. Omitted means no per-case bound.
   */
  caseTimeoutMs?: number;
  /** Passed to the command analyzer, so the child process itself is bounded and not merely abandoned. */
  analyzerTimeoutMs?: number;
  /**
   * The per-case spend ceiling substituted into an analyzer template as `{max_cost_usd}`, in US dollars.
   * The runner meters nothing; the analyzer enforces it. Defaults to `DEFAULT_MAX_COST_USD`.
   */
  maxCostUsd?: number;
};

/** A promise that resolves after `ms`, without holding the event loop open on its own. */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => { const t = setTimeout(r, ms); (t as { unref?: () => void }).unref?.(); });
}

export type EvalReport = Report & { cases: CaseRecord[]; summary: EvalSummary | null };

/** What running one case establishes. Returned rather than written, so a timed-out case cannot edit its record. */
type CasePatch = {
  outcome: CaseOutcome;
  failure_category: CaseRecord["failure_category"];
  reason: string;
  finding?: CaseRecord["finding"];
  assertions?: Assertion[];
  analyzerSource?: string | null;
  model?: string | null;
  /** The stable word for an infrastructure failure the analyzer itself reported. */
  failureCause?: string;
  cost?: CaseRecord["cost"];
  sqlExecuted?: boolean;
};

function applyPatch(record: CaseRecord, patch: CasePatch): void {
  record.outcome = patch.outcome;
  record.failure_category = patch.failure_category;
  record.reason = patch.reason;
  if (patch.finding) record.finding = patch.finding;
  if (patch.assertions) record.assertions = patch.assertions;
  if (patch.analyzerSource !== undefined) record.analyzer.source = patch.analyzerSource;
  if (patch.model !== undefined) record.model = patch.model;
  if (patch.failureCause !== undefined) record.failure_cause = patch.failureCause;
  if (patch.cost) record.cost = patch.cost;
}

/** The warehouse the golden reference queries read, taken from the Instance's connection profile. */
export function resolveWarehouse(instanceDir: string): { path: string } | { reason: string } {
  const configPath = join(instanceDir, "aftergrid.yaml");
  if (!existsSync(configPath)) return { reason: `no aftergrid.yaml at ${instanceDir}` };
  let config: any;
  try { config = parseYaml(readFileSync(configPath, "utf8")); } catch (e) { return { reason: `aftergrid.yaml could not be read: ${(e as Error).message}` }; }
  const declared = config?.connection?.duckdb?.path;
  if (typeof declared !== "string" || !declared.trim()) return { reason: "the Instance connection profile names no DuckDB path, so reference values cannot be recomputed here" };
  const candidates = isAbsolute(declared) ? [declared] : [join(instanceDir, declared), join(dirname(instanceDir), declared)];
  const found = candidates.find((c) => existsSync(c));
  return found ? { path: found } : { reason: `the declared warehouse '${declared}' was not found at ${candidates.join(" or ")}` };
}

/**
 * Recompute one golden's reference values through the DuckDB adapter, the way `src/golden.test.ts` does.
 *
 * `onExecuted` fires after each query that actually ran, including when a later one throws: the run report's
 * `sql_execution` axis is about SQL that executed, not about an adapter that was constructed.
 */
async function recomputeReference(adapter: DuckDbAdapter, golden: GoldenQuestion, onExecuted: () => void): Promise<string[]> {
  const results: Record<string, Record<string, any>> = {};
  for (const q of golden.reference.queries) {
    const r = await adapter.execute(q.sql, (golden.reference.parameters ?? {}) as any);
    onExecuted();
    results[q.id] = Object.fromEntries(r.rows.map((row) => [String(row[q.row_key]), row]));
  }
  const mismatches: string[] = [];
  for (const v of golden.expected.values ?? []) {
    const [qid, key, col] = v.reference.split(".") as [string, string, string];
    const row = results[qid]?.[key];
    if (!row) { mismatches.push(`${v.id}: reference row ${qid}.${key} is missing`); continue; }
    const got = row[col];
    if (v.value === null) { if (got !== null) mismatches.push(`${v.id}: expected not available, got ${got}`); continue; }
    if (typeof v.value === "number") {
      if (got === null || !(Math.abs(Number(got) - v.value) <= v.tolerance)) mismatches.push(`${v.id}: got ${got}, expected ${v.value} ± ${v.tolerance}`);
      continue;
    }
    if (String(got) !== v.value) mismatches.push(`${v.id}: got ${got}, expected ${v.value}`);
  }
  return mismatches;
}

/** A throwaway copy of the Instance. The real one is never written to, so an eval can run against a live Instance. */
function copyInstance(instanceDir: string): string {
  const root = mkdtempSync(join(tmpdir(), "aftergrid-eval-"));
  const dest = join(root, basename(instanceDir));
  const skip = new Set([join(instanceDir, "findings"), join(instanceDir, "intake")]);
  cpSync(instanceDir, dest, { recursive: true, filter: (src) => !skip.has(src) });
  return dest;
}

export async function runEval(opts: EvalOptions = {}): Promise<EvalReport> {
  const report = emptyReport("eval") as EvalReport;
  report.cases = [];
  report.summary = null;
  report.readiness = "unknown";
  report.readiness_reasons.push("an eval never approves a Finding: publication readiness is decided by `aftergrid check` against a human APPROVED review");

  // The revision names a directory under `--out`, and it can come from a flag or from a workflow input. Both
  // entry points (`eval` and `eval nightly`) share this check, so neither can write outside the directory it
  // was given.
  if (opts.sha !== undefined && !SHA_RE.test(opts.sha)) {
    report.errors.push({ category: "unsafe_path", location: "--sha", message: `'${opts.sha}' is not a usable revision name`, remedy: "pass a git sha, tag or branch name made of letters, digits, dot, dash or underscore" });
    report.syntax = "invalid";
    return report;
  }

  const instanceDir = resolve(opts.instanceDir ?? DEFAULT_INSTANCE);
  if (!existsSync(join(instanceDir, "aftergrid.yaml"))) {
    report.errors.push({ category: "missing_file", location: instanceDir, message: "no aftergrid.yaml here", remedy: "pass --instance <dir> pointing at an Instance root" });
    report.syntax = "invalid";
    return report;
  }
  const all = loadGoldens(instanceDir);
  if (!all.length) {
    report.errors.push({ category: "missing_file", location: join(instanceDir, "golden"), message: "the Instance holds no Golden Questions", remedy: "add golden/*.yaml (docs/contracts/golden-questions.md)" });
    return report;
  }
  const wanted = opts.golden ?? "all";
  const goldens = wanted === "all" ? all : all.filter((g) => g.id === wanted);
  if (!goldens.length) {
    report.errors.push({ category: "unresolved_reference", location: "--golden", message: `no Golden Question '${wanted}'`, remedy: `known ids: ${all.map((g) => g.id).join(", ")}` });
    return report;
  }

  let analyzer: Analyzer;
  if (opts.analyzerImpl) analyzer = opts.analyzerImpl;
  else if (opts.analyzer === "command") {
    if (!opts.analyzerCommand?.trim()) {
      report.errors.push({ category: "incomplete", location: "--analyzer-command", message: "the command analyzer needs a command template", remedy: 'pass --analyzer-command "<cmd> {finding_dir} {raw_ask}"' });
      return report;
    }
    analyzer = createCommandAnalyzer({ command: opts.analyzerCommand, model: opts.model ?? null, timeoutMs: opts.analyzerTimeoutMs });
  } else {
    analyzer = createFixtureAnalyzer({ root: opts.fixtureRoot });
  }
  if (!analyzer.exercised) report.info.push(`analyzer '${analyzer.name}' is not exercised by any test in this repository: what it does with a real model is unverified here`);

  const definitions = loadDefinitions(instanceDir);
  const warehouse = resolveWarehouse(instanceDir);
  let adapter: DuckDbAdapter | null = null;
  let referenceUnavailable: string | null = null;
  /** Whether any reference query actually ran. Opening an adapter executes nothing. */
  let sqlExecuted = false;
  if ("path" in warehouse) {
    try {
      const isDir = statSync(warehouse.path).isDirectory();
      adapter = new DuckDbAdapter({ source: isDir ? { kind: "csv_dir", path: warehouse.path } : { kind: "duckdb_file", path: warehouse.path }, estimate_cap_rows: 1e9 });
    } catch (e) { referenceUnavailable = `the warehouse at ${warehouse.path} could not be opened: ${(e as Error).message}`; }
  } else {
    referenceUnavailable = warehouse.reason;
  }

  const sha = opts.sha ?? gitSha(REPO_ROOT);
  const skillVersions = collectSkillVersions(REPO_ROOT);
  const aftergridVersion = packageVersion(REPO_ROOT);
  const plugin = pluginVersion(REPO_ROOT);
  const now = opts.now ?? (() => new Date());
  const runStarted = now().toISOString();
  const date = opts.date ?? runStarted.slice(0, 10);
  const maxCostUsd = opts.maxCostUsd ?? DEFAULT_MAX_COST_USD;
  const caseTimeoutMs = opts.caseTimeoutMs && opts.caseTimeoutMs > 0 ? opts.caseTimeoutMs : null;
  const deadline = opts.budgetMs !== undefined && opts.budgetMs >= 0 ? now().getTime() + opts.budgetMs : null;

  try {
    for (const golden of goldens) {
      const started = now().toISOString();
      const record: CaseRecord = {
        schema_version: "0.1.0",
        case: golden.id,
        outcome: "error",
        failure_category: "infrastructure",
        reason: "",
        analyzer: { name: analyzer.name, exercised: analyzer.exercised, source: null },
        finding: { dir: null, id: null, state: null, outcome: null },
        assertions: [],
        // Only a case that ran can name the model that ran it. `--model` is a label on the run, not evidence.
        model: null,
        skill_versions: skillVersions,
        plugin_version: plugin,
        git_sha: sha,
        aftergrid_version: aftergridVersion,
        started,
        finished: started,
        cost: { input_tokens: null, output_tokens: null, usd: null },
      };

      // One case, as a value rather than as mutation: a case that outruns its timeout must not keep writing
      // into a record the run has already reported.
      const runOne = async (): Promise<CasePatch> => {
        const patch: CasePatch = { outcome: "error", failure_category: "infrastructure", reason: "", finding: { ...record.finding } };
        let temp: string | null = null;
        try {
          temp = copyInstance(instanceDir);
          const slug = golden.id.replace(/_/g, "-");
          const created = newFinding({ slug, ask: golden.raw_ask, reader: golden.reader, instanceDir: temp, date });
          if (created.errors.length) {
            patch.outcome = "error";
            patch.failure_category = "infrastructure";
            patch.reason = `aftergrid new finding refused: ${created.errors.map((e) => `${e.category} ${e.message}`).join("; ")}`;
          } else {
            const findingDir = join(temp, "findings", `${date}-${slug}`);
            patch.finding!.dir = findingDir;
            let produced: AnalyzerOutcome;
            try {
              produced = await analyzer.analyze({ golden, rawAsk: golden.raw_ask, findingDir, instanceRoot: temp, repoRoot: REPO_ROOT, maxCostUsd });
            } catch (e) {
              produced = { status: "declined", reason: `__threw__: ${(e as Error).message}` };
            }
            if (produced.status === "declined" && produced.reason.startsWith("__threw__: ")) {
              patch.outcome = "error";
              patch.failure_category = "infrastructure";
              patch.reason = `the analyzer threw: ${produced.reason.slice("__threw__: ".length)}`;
            } else if (produced.status === "failed") {
              // The analyzer broke. Nothing is asserted, so nothing is claimed about the Analysis.
              patch.outcome = "error";
              patch.failure_category = "infrastructure";
              patch.reason = produced.reason;
              patch.failureCause = produced.cause;
            } else if (produced.status === "declined") {
              patch.outcome = "not_run";
              patch.failure_category = null;
              patch.reason = produced.reason;
            } else {
              patch.analyzerSource = produced.source ?? null;
              patch.model = produced.model ?? null;
              if (produced.cost) patch.cost = produced.cost;
              patch.finding!.dir = produced.finding_dir;
              const assessed = await assess(produced.finding_dir, golden, adapter, referenceUnavailable, definitions);
              patch.sqlExecuted = assessed.sqlExecuted;
              patch.assertions = assessed.assertions;
              patch.finding!.id = assessed.findingId;
              patch.finding!.state = assessed.state;
              patch.finding!.outcome = assessed.outcome;
              const failed = assessed.assertions.filter((a) => a.status === "fail");
              if (assessed.fatal) {
                patch.outcome = "error";
                patch.failure_category = "infrastructure";
                patch.reason = assessed.fatal;
              } else if (failed.length) {
                patch.outcome = "fail";
                patch.failure_category = failed.some((a) => a.category === "infrastructure") ? "infrastructure" : "analytical";
                patch.reason = failed.map((a) => `${a.id}: expected ${a.expected}, got ${a.observed}`).join("; ");
              } else {
                patch.outcome = "pass";
                patch.failure_category = null;
                patch.reason = `every assertion held (${assessed.assertions.filter((a) => a.status === "pass").length} checked, ${assessed.assertions.filter((a) => a.status === "not_evaluated").length} not evaluated)`;
              }
            }
          }
        } catch (e) {
          patch.outcome = "error";
          patch.failure_category = "infrastructure";
          patch.reason = `the eval runner failed before it could judge this case: ${(e as Error).message}`;
        } finally {
          if (temp) rmSync(dirname(temp), { recursive: true, force: true });
        }
        return patch;
      };

      if (deadline !== null && now().getTime() >= deadline) {
        // Not attempted, and said so: a case skipped for budget is neither a pass nor a failure.
        record.outcome = "not_run";
        record.failure_category = null;
        record.stopped_by = "budget";
        record.reason = `the run's ${opts.budgetMs} ms wall-clock budget was spent before this case started, so it was not attempted`;
      } else {
        const work = runOne();
        const patch = caseTimeoutMs === null
          ? await work
          : await Promise.race([work, sleep(caseTimeoutMs).then(() => null)]);
        if (patch) {
          applyPatch(record, patch);
          if (patch.sqlExecuted) sqlExecuted = true;
        } else {
          // The case is still running somewhere; nothing it produces afterwards is believed. A bound that was
          // hit is a fact about the machinery, never a verdict on the Analysis.
          record.outcome = "error";
          record.failure_category = "infrastructure";
          record.stopped_by = "timeout";
          record.reason = `the case outran its ${caseTimeoutMs} ms timeout and was abandoned; nothing is claimed about the Analysis`;
          work.catch(() => {});
        }
      }

      record.finished = now().toISOString();
      report.cases.push(record);

      const where = `golden/${golden.id}`;
      if (record.outcome === "fail") {
        report.errors.push({
          category: record.failure_category === "infrastructure" ? "eval_infrastructure" : "eval_case_failed",
          location: where,
          message: record.reason,
          remedy: record.failure_category === "infrastructure" ? "fix the runner, the warehouse or the golden's own reference query before reading the analytical verdicts" : "the Analysis did not meet the Golden Question; read the record before changing either",
        });
      } else if (record.outcome === "error") {
        report.errors.push({ category: "eval_infrastructure", location: where, message: record.reason, remedy: "this says nothing about the Analysis: the machinery failed" });
      } else if (record.outcome === "not_run") {
        report.warnings.push({ category: "eval_infrastructure", location: where, message: record.reason });
      } else {
        report.info.push(`${golden.id}: pass — ${record.reason}`);
      }
    }
  } finally {
    if (adapter) await adapter.close();
  }

  const finished = now().toISOString();
  const summary = summarise(report.cases, {
    schema_version: "0.1.0",
    git_sha: sha,
    aftergrid_version: aftergridVersion,
    analyzer: { name: analyzer.name, exercised: analyzer.exercised },
    instance: instanceDir,
    started: runStarted,
    finished,
    not_exercised: analyzer.exercised ? [] : [`analyzer:${analyzer.name}`],
  });
  report.summary = summary;

  if (opts.outDir) {
    const out = resolve(opts.outDir);
    for (const record of report.cases) writeCaseRecord(out, sha, record);
    writeSummary(out, sha, summary);
    report.info.push(`records written to ${recordDir(out, sha)}`);
  } else {
    report.info.push("no --out given, so nothing was written; the run exists only in this report");
  }
  report.info.push(`${summary.totals.pass} pass, ${summary.totals.fail} fail, ${summary.totals.error} error, ${summary.totals.not_run} not run (${summary.totals.analytical_failures} analytical, ${summary.totals.infrastructure_failures} infrastructure)`);
  // A run is complete when every case reached a verdict. A case the analyzer declined, or one the machinery
  // broke on, leaves a hole in the run, and a report that called that `complete` would be describing a run of
  // the cases that happened to work.
  const unjudged = report.cases.filter((c) => c.outcome !== "pass" && c.outcome !== "fail");
  report.content = report.cases.length && !unjudged.length ? "complete" : "incomplete";
  if (unjudged.length) report.info.push(`${unjudged.length} of ${report.cases.length} case(s) reached no verdict (${unjudged.map((c) => `${c.case}: ${c.outcome}`).join(", ")}), so this run is incomplete`);
  report.evidence = "not_evaluated";
  report.info.push("an eval asserts a Golden Question's expectations; it does not validate a Finding's evidence — that is `aftergrid check`");
  // The axis is about SQL that ran. Constructing the adapter runs none: a run where every case declined opens
  // the warehouse, executes nothing, and says `not_performed`.
  report.sql_execution = sqlExecuted ? "performed" : "not_performed";
  if (referenceUnavailable) report.warnings.push({ category: "runtime_unavailable", location: "reference.queries", message: referenceUnavailable });
  else if (!sqlExecuted) report.info.push("no reference query ran: no case reached the point of recomputing a golden's own numbers, so the golden values in this run were read from the file and not reproduced");
  return report;
}

async function assess(
  dir: string,
  golden: GoldenQuestion,
  adapter: DuckDbAdapter | null,
  referenceUnavailable: string | null,
  definitions: Map<string, InstanceDefinition> | null,
) {
  const empty = { assertions: [] as Assertion[], findingId: null, state: null, outcome: null, sqlExecuted: false };
  const manifestPath = join(dir, "manifest.yaml");
  if (!existsSync(manifestPath)) {
    return { ...empty, fatal: `the analyzer reported a Finding at ${dir} but there is no manifest.yaml there` };
  }
  let manifest: any;
  try { manifest = parseYaml(readFileSync(manifestPath, "utf8")); }
  catch (e) { return { ...empty, fatal: `manifest.yaml could not be parsed: ${(e as Error).message}` }; }
  const memoPath = join(dir, "memo.md");
  const memo = existsSync(memoPath) ? readFileSync(memoPath, "utf8") : "";

  let sqlExecuted = false;
  let reference: AssertOptions["reference"];
  if (!adapter) reference = { status: "unavailable", reason: referenceUnavailable ?? "no warehouse adapter" };
  else {
    try { reference = { status: "checked", mismatches: await recomputeReference(adapter, golden, () => { sqlExecuted = true; }) }; }
    catch (e) { reference = { status: "unavailable", reason: `the reference query failed: ${e instanceof AdapterError ? `${e.category}: ` : ""}${(e as Error).message}` }; }
  }

  return {
    assertions: assertCase({ golden, dir, manifest, memo, reference, definitions }),
    fatal: null as string | null,
    findingId: manifest?.finding?.id ?? null,
    state: manifest?.finding?.state ?? null,
    outcome: manifest?.finding?.outcome ?? null,
    sqlExecuted,
  };
}

export type { CaseOutcome };
