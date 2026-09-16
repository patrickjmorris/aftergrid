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

/* ------------------------------------------------------------------ analyzers */

export type AnalyzerContext = {
  golden: GoldenQuestion;
  rawAsk: string;
  /** The Finding directory `aftergrid new finding` just created, inside a throwaway copy of the Instance. */
  findingDir: string;
  instanceRoot: string;
};

export type AnalyzerOutcome =
  | { status: "produced"; finding_dir: string; source?: string | null; model?: string | null }
  | { status: "declined"; reason: string };

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
  };
  const tokens = template.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) throw new Error("--analyzer-command is empty");
  return tokens.map((t) => (Object.hasOwn(values, t) ? values[t]! : t));
}

/**
 * Shells out to a headless `/analyze` and reads its last JSON line.
 *
 * **Not exercised.** No test in this repository runs it and no model runs in CI, so what a real orchestrator
 * prints, how long it takes and what it leaves behind on a crash are untested. `exercised: false` travels into
 * the run record and the report rather than letting a green suite imply coverage.
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
          resolvePromise({ status: "declined", reason: `analyzer command could not start: ${(e as Error).message}` });
          return;
        }
        let out = "", err = "";
        child.stdout?.on("data", (c) => { out += String(c); });
        child.stderr?.on("data", (c) => { err += String(c); });
        child.on("error", (e) => resolvePromise({ status: "declined", reason: `analyzer command failed to run: ${e.message}` }));
        child.on("close", (code) => {
          const parsed = lastJsonLine(out);
          const dir = parsed && typeof parsed.finding_dir === "string" && parsed.finding_dir.trim()
            ? (isAbsolute(parsed.finding_dir) ? parsed.finding_dir : join(ctx.instanceRoot, parsed.finding_dir))
            : ctx.findingDir;
          if (parsed && parsed.status === "declined") {
            resolvePromise({ status: "declined", reason: String(parsed.reason ?? "the analyzer declined without a reason") });
            return;
          }
          if (existsSync(join(dir, "manifest.yaml"))) {
            resolvePromise({ status: "produced", finding_dir: resolve(dir), source: argv.join(" "), model: opts.model ?? null });
            return;
          }
          resolvePromise({ status: "declined", reason: `analyzer command exited ${code} and left no Finding at ${dir}${err.trim() ? `: ${err.trim().split("\n").slice(-1)[0]}` : ""}` });
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

  const snapshotTables = new Set<string>();
  for (const input of manifest?.snapshot?.inputs ?? []) {
    for (const t of input?.source?.tables ?? []) snapshotTables.add(String(t));
    if (!(input?.source?.tables ?? []).length && input?.id) snapshotTables.add(String(input.id));
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

  const memoNorm = normalisePhrase(memo);
  for (const phrase of expected.must_not ?? []) {
    const id = `must_not:${normalisePhrase(phrase).slice(0, 40).replace(/ /g, "_")}`;
    const present = memoNorm.includes(normalisePhrase(phrase));
    out.push(present
      ? fail(id, "analytical", `the memo does not say "${phrase}"`, "the phrase appears in the memo")
      : pass(id, "analytical", `the memo does not say "${phrase}"`, "the phrase does not appear in the memo"));
  }

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
};

export type EvalReport = Report & { cases: CaseRecord[]; summary: EvalSummary | null };

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

/** Recompute one golden's reference values through the DuckDB adapter, the way `src/golden.test.ts` does. */
async function recomputeReference(adapter: DuckDbAdapter, golden: GoldenQuestion): Promise<string[]> {
  const results: Record<string, Record<string, any>> = {};
  for (const q of golden.reference.queries) {
    const r = await adapter.execute(q.sql, (golden.reference.parameters ?? {}) as any);
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
    analyzer = createCommandAnalyzer({ command: opts.analyzerCommand, model: opts.model ?? null });
  } else {
    analyzer = createFixtureAnalyzer({ root: opts.fixtureRoot });
  }
  if (!analyzer.exercised) report.info.push(`analyzer '${analyzer.name}' is not exercised by any test in this repository: what it does with a real model is unverified here`);

  const warehouse = resolveWarehouse(instanceDir);
  let adapter: DuckDbAdapter | null = null;
  let referenceUnavailable: string | null = null;
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
        model: opts.model ?? null,
        skill_versions: skillVersions,
        plugin_version: plugin,
        git_sha: sha,
        aftergrid_version: aftergridVersion,
        started,
        finished: started,
        cost: { input_tokens: null, output_tokens: null, usd: null },
      };

      let temp: string | null = null;
      try {
        temp = copyInstance(instanceDir);
        const slug = golden.id.replace(/_/g, "-");
        const created = newFinding({ slug, ask: golden.raw_ask, reader: golden.reader, instanceDir: temp, date });
        if (created.errors.length) {
          record.outcome = "error";
          record.failure_category = "infrastructure";
          record.reason = `aftergrid new finding refused: ${created.errors.map((e) => `${e.category} ${e.message}`).join("; ")}`;
        } else {
          const findingDir = join(temp, "findings", `${date}-${slug}`);
          record.finding.dir = findingDir;
          let produced: AnalyzerOutcome;
          try {
            produced = await analyzer.analyze({ golden, rawAsk: golden.raw_ask, findingDir, instanceRoot: temp });
          } catch (e) {
            produced = { status: "declined", reason: `__threw__: ${(e as Error).message}` };
          }
          if (produced.status === "declined" && produced.reason.startsWith("__threw__: ")) {
            record.outcome = "error";
            record.failure_category = "infrastructure";
            record.reason = `the analyzer threw: ${produced.reason.slice("__threw__: ".length)}`;
          } else if (produced.status === "declined") {
            record.outcome = "not_run";
            record.failure_category = null;
            record.reason = produced.reason;
          } else {
            record.analyzer.source = produced.source ?? null;
            record.model = produced.model ?? record.model;
            record.finding.dir = produced.finding_dir;
            const assessed = await assess(produced.finding_dir, golden, adapter, referenceUnavailable);
            record.assertions = assessed.assertions;
            record.finding.id = assessed.findingId;
            record.finding.state = assessed.state;
            record.finding.outcome = assessed.outcome;
            const failed = assessed.assertions.filter((a) => a.status === "fail");
            if (assessed.fatal) {
              record.outcome = "error";
              record.failure_category = "infrastructure";
              record.reason = assessed.fatal;
            } else if (failed.length) {
              record.outcome = "fail";
              record.failure_category = failed.some((a) => a.category === "infrastructure") ? "infrastructure" : "analytical";
              record.reason = failed.map((a) => `${a.id}: expected ${a.expected}, got ${a.observed}`).join("; ");
            } else {
              record.outcome = "pass";
              record.failure_category = null;
              record.reason = `every assertion held (${assessed.assertions.filter((a) => a.status === "pass").length} checked, ${assessed.assertions.filter((a) => a.status === "not_evaluated").length} not evaluated)`;
            }
          }
        }
      } catch (e) {
        record.outcome = "error";
        record.failure_category = "infrastructure";
        record.reason = `the eval runner failed before it could judge this case: ${(e as Error).message}`;
      } finally {
        if (temp) rmSync(dirname(temp), { recursive: true, force: true });
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
  report.content = "complete";
  report.evidence = "not_evaluated";
  report.info.push("an eval asserts a Golden Question's expectations; it does not validate a Finding's evidence — that is `aftergrid check`");
  report.sql_execution = referenceUnavailable ? "not_performed" : "performed";
  if (referenceUnavailable) report.warnings.push({ category: "runtime_unavailable", location: "reference.queries", message: referenceUnavailable });
  return report;
}

async function assess(dir: string, golden: GoldenQuestion, adapter: DuckDbAdapter | null, referenceUnavailable: string | null) {
  const manifestPath = join(dir, "manifest.yaml");
  if (!existsSync(manifestPath)) {
    return { assertions: [] as Assertion[], fatal: `the analyzer reported a Finding at ${dir} but there is no manifest.yaml there`, findingId: null, state: null, outcome: null };
  }
  let manifest: any;
  try { manifest = parseYaml(readFileSync(manifestPath, "utf8")); }
  catch (e) { return { assertions: [] as Assertion[], fatal: `manifest.yaml could not be parsed: ${(e as Error).message}`, findingId: null, state: null, outcome: null }; }
  const memoPath = join(dir, "memo.md");
  const memo = existsSync(memoPath) ? readFileSync(memoPath, "utf8") : "";

  let reference: AssertOptions["reference"];
  if (!adapter) reference = { status: "unavailable", reason: referenceUnavailable ?? "no warehouse adapter" };
  else {
    try { reference = { status: "checked", mismatches: await recomputeReference(adapter, golden) }; }
    catch (e) { reference = { status: "unavailable", reason: `the reference query failed: ${e instanceof AdapterError ? `${e.category}: ` : ""}${(e as Error).message}` }; }
  }

  return {
    assertions: assertCase({ golden, dir, manifest, memo, reference }),
    fatal: null as string | null,
    findingId: manifest?.finding?.id ?? null,
    state: manifest?.finding?.state ?? null,
    outcome: manifest?.finding?.outcome ?? null,
  };
}

export type { CaseOutcome };
