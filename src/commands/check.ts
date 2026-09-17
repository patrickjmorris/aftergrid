// `aftergrid check <finding-dir>`: four separate facts (syntax, content completeness, evidence validity,
// publication readiness) plus whether SQL was executed. Evidence validation is the shared library
// scripts/lib/validate-finding.mjs (hardened in the 2026-09-15 code review); this command adds the draft-aware
// completeness axis and the stable report shape. Artifact mode never executes SQL. Rerun mode is owned by
// ag-duckdb-execute-check-ypl and is reported as not performed until it lands.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
// @ts-ignore: shared ESM validation library.
import { validateFinding } from "../../scripts/lib/validate-finding.mjs";
// @ts-ignore: shared path containment.
import { safePath, ContractError } from "../../scripts/fixture-safety.mjs";
import { emptyReport, type Problem, type Report } from "../report.ts";
import { findInstance } from "../instance.ts";
import { validateDecisionsFor } from "../decisions.ts";
import { openRetained as openRetainedDuckdb } from "../adapters/duckdb.ts";
import { openRetained as openRetainedPostgres } from "../adapters/postgres.ts";
import { AdapterError, type RetainedSession } from "../adapters/contract.ts";
import { serializeResult } from "../adapters/serialize.ts";
import { sha256 } from "../digest.ts";
// @ts-ignore: shared Check-shape rule.
import { checkOutcome } from "../../scripts/lib/sql-runner.mjs";
import { assessReadiness } from "../publication/readiness.ts";
import { createGitHubClient, tokenFromEnv, type GitHubClient } from "../publication/github.ts";
import { validateAnalysisFile, analysisWarnings, analysisSummary } from "../analysis/validate.ts";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
export type CheckOptions = { dir: string; mode?: "artifact" | "rerun"; github?: GitHubClient | null };

export async function check(opts: CheckOptions): Promise<Report> {
  const report = checkArtifact(opts);
  await verifyPublication(opts, report);
  if (opts.mode !== "rerun") return report;
  if (report.syntax === "invalid" || report.errors.some((e) => ["unsafe_path", "path_collision", "duplicate_id", "hash_mismatch", "missing_file"].includes(e.category))) {
    report.info.push("rerun skipped: the artifact must verify before its SQL is re-executed");
    return report;
  }
  const unavailable = rerunUnavailable(resolve(opts.dir), findInstance(resolve(opts.dir)));
  if (unavailable) {
    report.errors.push(unavailable);
    report.sql_execution = "not_performed";
    report.readiness = "not_ready";
    report.info.push("nothing was rerun and nothing was read: the saved evidence was verified exactly as `--mode artifact` verifies it, and that answer above still stands");
    return report;
  }
  await rerun(resolve(opts.dir), report);
  return report;
}

/**
 * Why this Finding cannot be rerun, or null. A rerun re-executes the recorded SQL against the RETAINED inputs; a
 * Finding on the recorded data path (ADR 0010) has none, because the Operator's harness reached the source and
 * aftergrid only wrote down what came back. Refusing it by name is the honest answer: the alternative is a crash,
 * or — worse — a rerun against some other input set reported as if it had reproduced the evidence.
 */
export function rerunUnavailable(dir: string, instance?: { config?: any } | null): Problem | null {
  let manifest: any;
  try { manifest = parseYaml(readFileSync(safePath(dir, "manifest.yaml"), "utf8")); } catch { return null; }
  const recorded = (manifest?.executions ?? []).filter((e: any) => e?.executed_by?.kind === "harness");
  const inputs = manifest?.snapshot?.inputs ?? [];
  // Both remedies below send the Operator to `aftergrid capture`, which refuses outright on an Instance with no
  // adapter (the default, ADR 0010). Naming it there without saying so would be a circle, so the Instance is
  // read and the first step is named honestly. No Instance in hand means no claim either way.
  const adapterName = String(instance?.config?.connection?.adapter ?? "");
  const captureRefuses = !!instance && (adapterName === "" || adapterName === "none");
  const firstStep = captureRefuses
    ? ". On this Instance `capture` refuses too: set `connection.adapter` in aftergrid.yaml first, then capture and execute"
    : "";
  if (recorded.length) {
    return {
      category: "rerun_unavailable", location: "manifest.yaml#/executions",
      message: `${recorded.length} execution(s) [${recorded.map((e: any) => e.id).join(", ")}] were run by ${[...new Set(recorded.map((e: any) => e.executed_by.tool))].join(", ")} and recorded, not run by aftergrid, so there is nothing here to rerun`,
      remedy: `this Finding guarantees artifact_replay only. To be able to rerun it, capture the inputs the analysis needs (\`aftergrid capture\`) and run \`aftergrid execute\`, which earns analysis_rerun by observing it${firstStep}`,
    };
  }
  if ((manifest?.executions ?? []).length && !inputs.length) {
    return {
      category: "rerun_unavailable", location: "manifest.yaml#/snapshot/inputs",
      message: "this Finding has no retained inputs, and a rerun re-executes the recorded SQL against retained inputs and never against a live source",
      remedy: `run \`aftergrid capture <finding-dir> --tables …\` and \`aftergrid execute\` first; until then only \`--mode artifact\` says anything true about this Finding${firstStep}`,
    };
  }
  return null;
}

/**
 * Publication readiness is decided by src/publication, never by the Finding under review: trusted Instance policy
 * plus a GitHub review read through the API. Without a token there is no client and readiness stays `unknown`,
 * never `ready`. Offline artifact verification (checkArtifact, and therefore render) keeps its own conservative
 * answer so a rendered draft stays reproducible. Evidence validity and readiness stay separate axes, with traffic
 * in one direction only: an evidence error forces `not_ready` (never `unknown`), while a `not_ready` or `unknown`
 * readiness never makes evidence invalid.
 */
async function verifyPublication(opts: CheckOptions, report: Report) {
  if (report.syntax === "invalid") return;
  const dir = resolve(opts.dir);
  let manifest: any;
  try { manifest = parseYaml(readFileSync(safePath(dir, "manifest.yaml"), "utf8")); } catch { return; }
  const github = opts.github !== undefined ? opts.github : tokenFromEnv() ? createGitHubClient() : null;
  const assessment = await assessReadiness({ dir, manifest, github });
  const seen = new Set(report.errors.map((e) => `${e.category}@${e.location}`));
  for (const p of assessment.errors) if (!seen.has(`${p.category}@${p.location}`)) report.errors.push(p);
  report.warnings.push(...assessment.warnings);
  report.readiness = assessment.readiness;
  report.readiness_reasons = assessment.reasons;
  // An agent-reported Check outcome lowers readiness and never raises it. A verified human approval is still a
  // verified human approval, but what it approved rests on outcomes aftergrid did not execute, so the answer is
  // `unknown` and says why (docs/contracts/record.md). Reported as its own fact, never folded into `evidence`.
  if ((manifest?.checks ?? []).some((c: any) => c?.reported_by)) {
    report.checks_reported_by_agent = true;
    if (report.readiness === "ready") report.readiness = "unknown";
    report.readiness_reasons.push("Check outcomes on this Finding were reported by the harness, not executed by aftergrid; a review can approve what it read, and the Engine cannot report those outcomes as verified");
  }
  // Evidence errors force not_ready with no exception, including for `unknown`: a Finding whose retained inputs or
  // approved definitions no longer hash to its manifest is definitely wrong, not merely unanswerable.
  if (report.errors.length) {
    report.readiness = "not_ready";
    report.readiness_reasons.push(`the evidence is invalid (${report.errors.length} error${report.errors.length === 1 ? "" : "s"}), which forces not_ready whatever the GitHub review says`);
  }
}

export type RetainedOpener = (baseDir: string, inputs: any[], limits?: any) => Promise<RetainedSession>;

/**
 * Which engine reruns these retained inputs, decided by `snapshot.inputs[].source.adapter`. A Postgres capture
 * records Postgres column types and is restored on a disposable Postgres, instead of being reread through
 * DuckDB's inferred types and dialect and still reported as `sql_execution: performed`. Everything else — a
 * `duckdb` or `synthetic` extract, or an input that names no adapter — reruns on DuckDB exactly as before. One
 * session cannot mix engines, so a Postgres extract alongside another kind is refused rather than reread.
 */
export function retainedOpenerFor(inputs: any[]): RetainedOpener {
  const adapters = [...new Set((inputs ?? []).map((i: any) => String(i?.source?.adapter ?? "duckdb")))].sort();
  if (!adapters.includes("postgres")) return openRetainedDuckdb as RetainedOpener;
  if (adapters.length > 1) {
    throw new AdapterError("not_implemented", `retained inputs captured by different adapters (${adapters.join(", ")}) cannot be rerun in one session`, "manifest.yaml#/snapshot/inputs");
  }
  return openRetainedPostgres as RetainedOpener;
}

/**
 * Rerun mode: re-execute every recorded execution and Check against the retained inputs (never a live source)
 * and compare with what the manifest recorded. Differences are errors; nothing in the directory is modified.
 */
async function rerun(dir: string, report: Report) {
  const manifest: any = parseYaml(readFileSync(safePath(dir, "manifest.yaml"), "utf8"));
  const current: Record<string, string> = {};
  const sessions = new Map<string, RetainedSession>();
  const sessionFor = async (inputIds: string[]) => {
    const key = JSON.stringify([...new Set(inputIds)].sort());
    if (!sessions.has(key)) {
      const inputs = manifest.snapshot.inputs.filter((i: any) => inputIds.includes(i.id));
      sessions.set(key, await retainedOpenerFor(inputs)(dir, inputs));
    }
    return sessions.get(key)!;
  };
  // A Check runs with the parameters and inputs of the execution it names (or the first execution). One that resolves
  // to no execution is refused as execution_binding rather than run against no tables and mis-reported as sql_error.
  const execParams = (ck: any) => (ck.execution_id ? manifest.executions.find((e: any) => e.id === ck.execution_id) : manifest.executions[0]) ?? null;
  try {
    for (const ex of manifest.executions) {
      const q = manifest.queries.find((x: any) => x.id === ex.query_id);
      const res = manifest.results.find((r: any) => r.id === ex.result_id);
      try {
        const s = await sessionFor(ex.input_ids);
        const got = await s.execute(readFileSync(safePath(dir, q.path), "utf8"), ex.parameters);
        const ser = serializeResult(got, { result_id: res.id, execution_id: ex.id, row_key: res.row_key, columns: res.columns });
        const h = sha256(ser.bytes);
        if (h !== res.content_hash.value) report.errors.push({ category: "rerun_mismatch", location: `manifest.yaml#/executions/${manifest.executions.indexOf(ex)}`, message: `rerun of ${ex.id} produced a different result set than the saved ${res.id}`, remedy: "the retained inputs, SQL or parameters no longer reproduce the saved evidence; investigate before trusting either" });
        else report.info.push(`rerun ${ex.id}: reproduced ${res.id} exactly`);
      } catch (e) {
        report.errors.push({ category: e instanceof AdapterError ? e.category : "sql_error", location: `manifest.yaml#/executions/${manifest.executions.indexOf(ex)}`, message: (e as Error).message });
      }
    }
    for (const ck of manifest.checks) {
      const ex = execParams(ck);
      let outcome = "error";
      if (!ex) { report.errors.push({ category: "execution_binding", location: `checks/${ck.id}`, message: `Check ${ck.id} names no execution to run under (execution_id ${ck.execution_id ?? "unset"}, and there is no first execution)`, remedy: "give the Check an execution_id that exists, or add the execution" }); current[ck.id] = outcome; continue; }
      try {
        const s = await sessionFor(ex.input_ids);
        const got = await s.execute(readFileSync(safePath(dir, ck.path), "utf8"), ex.parameters);
        outcome = checkOutcome(got.columns.map((c) => c.name), got.rows, ck.path).outcome;
      } catch (e) {
        report.errors.push({ category: e instanceof AdapterError ? e.category : e instanceof ContractError ? (e as any).category : "check_error", location: ck.path, message: (e as Error).message });
      }
      current[ck.id] = outcome;
      if (outcome !== ck.outcome) report.errors.push({ category: "rerun_mismatch", location: `checks/${ck.id}`, message: `Check ${ck.id} is ${outcome} now but the manifest recorded ${ck.outcome}`, remedy: "rebuild the Finding as a new revision if the change is real" });
    }
  } finally { for (const s of sessions.values()) await s.close(); }
  report.sql_execution = "performed";
  report.info.push("rerun: current Check outcomes " + Object.entries(current).map(([k, v]) => `${k}=${v}`).join(", "));
  if (report.errors.length) { report.evidence = "invalid"; report.readiness = "not_ready"; }
}

/** What `aftergrid new finding` writes into `coverage:` so the draft is schema-valid without inventing a window. */
const COVERAGE_SENTINEL_DATE = "1970-01-01";
const COVERAGE_SENTINEL_DESCRIPTION = /^not determined yet/i;
const COVERAGE_REMEDY =
  "fill coverage from what this analysis actually read — step 7 of /write-finding: the recorded execution parameters, or the retained inputs' own window. Never a date nobody read, and never one inferred from the Question";

/**
 * Coverage fields still holding the `new finding` scaffold's placeholders. These are not a schema problem — the
 * sentinel is a valid date and a valid string — so nothing else catches them, and a Finding could be reported
 * `content: complete` while telling a Reader it covers a single day in 1970.
 */
export function scaffoldCoverage(manifest: any): string[] {
  const coverage = manifest?.coverage ?? {};
  const gaps: string[] = [];
  for (const field of ["data_from", "data_to"] as const) {
    if (String(coverage[field] ?? "").slice(0, 10) === COVERAGE_SENTINEL_DATE) {
      gaps.push(`coverage.${field} is still the \`new finding\` scaffold sentinel ${COVERAGE_SENTINEL_DATE}; no data was read for that date`);
    }
  }
  if (typeof coverage.description === "string" && COVERAGE_SENTINEL_DESCRIPTION.test(coverage.description.trim())) {
    gaps.push('coverage.description is still the `new finding` scaffold text ("Not determined yet…"), so this Finding does not say what it covers');
  }
  return gaps;
}

export function checkArtifact(opts: CheckOptions): Report {
  const report = emptyReport("check");
  const dir = resolve(opts.dir);
  if (!existsSync(join(dir, "manifest.yaml"))) {
    report.errors.push({ category: "missing_file", location: join(dir, "manifest.yaml"), message: "manifest.yaml not found", remedy: "pass a Finding directory" });
    report.syntax = "invalid"; return report;
  }
  const out = validateFinding(dir, { repoRoot: REPO_ROOT });
  report.errors.push(...(out.errors as Problem[]));
  report.warnings.push(...(out.warnings as Problem[]));
  report.info.push(...(out.info as string[]));
  const STOP = new Set(["schema", "invalid_artifact", "unsafe_path", "path_collision", "duplicate_id", "syntax", "unit_mismatch", "execution_binding", "derived_arity"]);
  report.syntax = report.errors.some((e) => e.category === "schema" || e.category === "syntax" || (e.category === "invalid_artifact" && /YAML|parse/i.test(e.message))) ? "invalid" : "ok";
  if (out.finding) { report.finding = out.finding; report.state = out.state; report.outcome = out.outcome; }
  // After a structural rejection nothing further is read from the directory.
  if (report.errors.some((e) => STOP.has(e.category))) { report.readiness = "not_ready"; report.readiness_reasons.push("structural errors"); return report; }

  // Content completeness: what a draft still lacks, named, never invented. Reads go through safePath only.
  let manifest: any = null;
  try { manifest = parseYaml(readFileSync(safePath(dir, "manifest.yaml"), "utf8")); }
  catch (e) { report.errors.push({ category: e instanceof ContractError ? (e as any).category : "invalid_artifact", location: "manifest.yaml", message: (e as Error).message }); return report; }
  if (manifest && manifest.finding.state !== "complete") {
    const missing: string[] = [];
    if (manifest.question?.state !== "resolved") missing.push(`question unresolved: ${(manifest.question?.unresolved ?? []).join(", ") || "unspecified"}`);
    if (!manifest.claims?.length) missing.push("no Claims");
    if (!manifest.snapshot?.inputs?.length) missing.push("no retained inputs");
    if (!manifest.executions?.length) missing.push("no executions");
    for (const n of manifest.finding.needs_input ?? []) missing.push(`needs input (${n.kind}, owner ${n.owner}): ${n.description}`);
    try { const mp = safePath(dir, "memo.md"); if (existsSync(mp) && /_Not written yet\._/.test(readFileSync(mp, "utf8"))) missing.push("memo sections not written"); } catch { /* an unsafe memo path was already rejected above */ }
    report.content = "incomplete";
    for (const m of missing) report.warnings.push({ category: "incomplete", location: "manifest.yaml", message: m });
  } else if (manifest) {
    report.content = "complete";
  }
  // `new finding` scaffolds coverage as sentinels, and nothing else detects them: a Finding could be marked
  // `complete` while still saying it covers 1970. Coverage is what the analysis actually read, so a sentinel
  // that survived into a finished Finding is an unwritten section, whatever `finding.state` says.
  if (manifest) {
    const gaps = scaffoldCoverage(manifest);
    for (const g of gaps) report.warnings.push({ category: "incomplete", location: "manifest.yaml#/coverage", message: g, remedy: COVERAGE_REMEDY });
    if (gaps.length) report.content = "incomplete";
  }

  // Decision records that cite this Finding must bind to it exactly (ADR 0009 schema, v0).
  if (manifest) {
    const inst = findInstance(dir);
    if (inst) {
      const dc = validateDecisionsFor(inst.root, manifest);
      report.errors.push(...dc.errors); report.warnings.push(...dc.warnings);
      if (dc.records) report.info.push(`${dc.records} Decision record(s) cite this Finding; ${dc.records - Math.min(dc.records, dc.unverified)} verified against this revision, ${dc.unverified} unverified (other revision); revisit conditions not evaluated`);
    }
  }
  // The Analysis file, when the directory has one (docs/contracts/analysis-directory.md). The summary is part
  // of the answer, not decoration: whether any Check carries a pre-registration hash at all is the first thing
  // a reviewer of a falsifier needs, and saying nothing about it reads as saying there is nothing to say.
  if (manifest) {
    report.errors.push(...validateAnalysisFile(dir, manifest));
    report.warnings.push(...analysisWarnings(dir));   // Probes out of timeline order: said, never refused.
    report.info.push(...analysisSummary(dir));        // Empty when the directory has no analysis.yaml.
  }
  report.evidence = report.errors.length ? "invalid" : "valid";
  report.sql_execution = "not_performed";
  if (out.recordedCheckOutcomes) report.info.push("recorded Check outcomes (history, not re-executed): " + Object.entries(out.recordedCheckOutcomes).map(([k, v]) => `${k}=${v}`).join(", "));
  if (out.checksReportedByAgent) report.checks_reported_by_agent = true;
  report.readiness = (out.readiness as Report["readiness"]) ?? "not_ready";
  report.readiness_reasons.push(...((out.reasons as string[]) ?? []));
  if (manifest && manifest.finding.state !== "complete" && !report.readiness_reasons.includes("not complete")) report.readiness_reasons.unshift("not complete");
  if (report.errors.length) report.readiness = "not_ready";
  return report;
}
