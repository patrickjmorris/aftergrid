// The Analysis file (`analysis.yaml`) beside `manifest.yaml` in a Finding directory.
// Contract: docs/contracts/analysis-directory.md. Schema: src/analysis/analysis.schema.json.
//
// Three rules the JSON Schema cannot state, and they are the point of the file:
//   1. Checks are written and run BEFORE the final analysis queries. `execution_order` is grouped
//      probe -> check -> query, and a Check recorded after a query is an error, not a note. A probe taken
//      after a query is recorded where it happened and marked `post_hoc: true`, because hiding it would be
//      the dishonest option.
//   2. Everything the Analysis names must exist: an execution_order id resolves to a manifest Check or query,
//      a probe id resolves to a declared probe, a candidate Claim's evidence resolves to a saved result CELL
//      (result, row key and column, read from results/*.json), to a declared or requested derived value, or to
//      a typed external source; and a Claim's definition_refs resolve in manifest.definitions at that version.
//   3. A causal Claim carries the design that earns it. `type: causal` with anything but
//      `causal_basis: randomised_assignment` is an associational Claim wearing a causal word.
//
// `probes` is the account of the middle of the analysis, and it is read as a timeline: each entry carries `at`
// (the harness's clock when the look was taken) and a `kind` of `exploratory`, `dead_end` or `reframe`; a
// `reframe` says what changed; a dead end is recorded, never deleted. Probes out of `at` order are a WARNING
// from `analysisWarnings`, not an error — a list written up late is still worth having, and saying so is
// better than refusing it or quietly re-sorting it.
//
// The file is optional. A Finding with no `analysis.yaml` — a hand-authored exemplar, a draft that has not
// reached the analysis yet — returns no problems, because absence is not a defect. A file at
// `stage: clarified` is the /grill-question seed: complete for that stage, and not yet required to carry
// probes, execution order, candidate Claims or an outcome.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { Problem } from "../report.ts";
// @ts-ignore: shared path containment (JS module, no types).
import { safePath, ContractError } from "../../scripts/fixture-safety.mjs";

export const ANALYSIS_FILE = "analysis.yaml";
const SCHEMA_PATH = fileURLToPath(new URL("./analysis.schema.json", import.meta.url));

export type AnalysisStage = "clarified" | "analysed";
/** What a probe was: a look that informed the plan, a path abandoned, or a look that changed the Question. */
export type ProbeKind = "exploratory" | "dead_end" | "reframe";
export type Probe = { id: string; at: string; kind: ProbeKind; question: string; observed: string; sql_path?: string; changed_plan?: string };
export type ExecutionStep = { kind: "probe" | "check" | "query"; id: string; exploratory?: boolean; post_hoc?: boolean; note?: string };
export type RequestedDerived = { id: string; operation: string; operands: string[]; unit: string; display?: Record<string, unknown>; description?: string };
export type RequestedExternalSource = { id: string; kind: string; value: number | string; unit: string; source: Record<string, unknown> };
export type Analysis = {
  schema_version: string;
  stage?: AnalysisStage;
  reader_profile: string;
  assumptions: { id: string; statement: string; basis: string; settled_by?: string; affects?: string[] }[];
  pre_registered_comparison?: { statement: string; registered_before_cuts: boolean; registered_at?: string; source?: string };
  probes?: Probe[];
  execution_order?: ExecutionStep[];
  candidate_claims?: Record<string, any>[];
  requested_derived?: RequestedDerived[];
  requested_external_sources?: RequestedExternalSource[];
  outcome_recommendation?: { outcome: "answered" | "inconclusive" | "insufficient_data" | "needs_reframing"; reason: string; what_would_be_needed?: string[] };
  needs_input?: { kind: string; description: string; owner: string; requested_at?: string; blocks?: string[] }[];
  notes?: string[];
};

let compiled: ((data: unknown) => boolean) & { errors?: any[] } | null = null;
function validator() {
  if (!compiled) {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    compiled = ajv.compile(JSON.parse(readFileSync(SCHEMA_PATH, "utf8")));
  }
  return compiled;
}

/** Read `analysis.yaml` from a Finding directory, or null when there is none. Throws on unreadable YAML. */
export function readAnalysis(dir: string): Analysis | null {
  let path: string;
  try { path = safePath(dir, ANALYSIS_FILE); } catch { return null; }
  if (!existsSync(path)) return null;
  return parseYaml(readFileSync(path, "utf8")) as Analysis;
}

/**
 * Which stage the file declares. Absent means `analysed`: a file written before the field existed is the
 * complete working record it always was, and never becomes a seed by omission.
 */
export function analysisStage(analysis: Analysis | null): AnalysisStage {
  return analysis?.stage === "clarified" ? "clarified" : "analysed";
}

const VALUE_REF = /^(?:ref:([a-z][a-z0-9_]{0,63})\.([A-Za-z0-9_-]{1,64})\.([a-z][a-z0-9_]{0,63})|derived:([a-z][a-z0-9_]{0,63})|ext:([a-z][a-z0-9_]{0,63}))$/;

/**
 * The remedy for one schema error. The stage rule and the probe rules earn their own words, because "fix it
 * against the schema" is no help to someone who has just been told a probe is missing a field they never knew
 * about; everything else gets the generic pointer.
 */
function remedyFor(e: any): string {
  const missing: string | undefined = e.params?.missingProperty;
  const path: string = e.instancePath ?? "";
  if (missing && ["probes", "execution_order", "candidate_claims", "outcome_recommendation"].includes(missing)) {
    return "an analysis.yaml that has not reached the analysis yet declares `stage: clarified`; the four evidence sections are required only at `stage: analysed` (docs/contracts/analysis-directory.md)";
  }
  if (/^\/probes\/\d+/.test(path)) {
    if (missing === "at") return "every probe carries `at`, the time the harness's clock read when the look was taken (RFC 3339 with an offset). It is never invented after the fact: a probe whose time was not recorded says so in `observed` rather than carrying a plausible one";
    if (missing === "kind") return "every probe carries `kind`: `exploratory` for a look that informed the plan, `dead_end` for a path tried or considered and abandoned, `reframe` for a look that changed the Question";
    if (missing === "changed_plan") return "a `reframe` probe names what changed: record `changed_plan` with the Question change, and the `/grill-question` revisit if one happened — or record the probe as `exploratory` or `dead_end`";
    if (/\/kind$/.test(path)) return "a probe is `exploratory`, `dead_end` or `reframe`; a dead end is recorded, never deleted";
    if (/\/at$/.test(path)) return "`at` is an RFC 3339 timestamp with an offset, for example 2026-09-16T11:20:00Z";
  }
  return "fix analysis.yaml against src/analysis/analysis.schema.json (docs/contracts/analysis-directory.md)";
}

/**
 * Every problem with the Analysis file in `dir`, as report entries. Empty when there is no file.
 * `manifest` is optional: without it the cross-reference rules are skipped and the info line says so.
 */
export function validateAnalysisFile(dir: string, manifest?: any): Problem[] {
  const problems: Problem[] = [];
  const err = (location: string, message: string, remedy?: string) =>
    problems.push({ category: "analysis_contract", location, message, remedy });

  let analysis: Analysis | null;
  try {
    analysis = readAnalysis(dir);
  } catch (e) {
    problems.push({
      category: e instanceof ContractError ? ((e as any).category as Problem["category"]) : "invalid_artifact",
      location: ANALYSIS_FILE,
      message: (e as Error).message,
      remedy: "analysis.yaml must be readable YAML; nothing else in it was checked",
    });
    return problems;
  }
  if (analysis === null) return problems;

  const check = validator();
  if (!check(analysis)) {
    for (const e of check.errors ?? []) {
      const detail = e.params?.additionalProperty ? ` ('${e.params.additionalProperty}')`
        : e.params?.allowedValues ? " " + JSON.stringify(e.params.allowedValues)
        : e.params?.missingProperty ? ` ('${e.params.missingProperty}')` : "";
      err(`${ANALYSIS_FILE}#${e.instancePath || "/"}`, `${e.message}${detail}`, remedyFor(e));
    }
    return problems;   // Shape first: the rules below read fields the schema just rejected.
  }

  const probes = analysis.probes ?? [];
  const order = analysis.execution_order ?? [];
  const claims = analysis.candidate_claims ?? [];
  const requestedDerived = analysis.requested_derived ?? [];
  const requestedExternal = analysis.requested_external_sources ?? [];

  // --- ids are unique within their list ---
  for (const [list, items] of [
    ["assumptions", analysis.assumptions],
    ["probes", probes],
    ["candidate_claims", claims],
    ["requested_derived", requestedDerived],
    ["requested_external_sources", requestedExternal],
  ] as const) {
    const seen = new Set<string>();
    (items as { id: string }[]).forEach((item, i) => {
      if (seen.has(item.id)) err(`${ANALYSIS_FILE}#/${list}/${i}/id`, `'${item.id}' is used twice in ${list}`, "ids are unique within their list");
      seen.add(item.id);
    });
  }

  // --- rule 1: Checks come before the analysis queries ---
  const RANK: Record<ExecutionStep["kind"], number> = { probe: 0, check: 1, query: 2 };
  let highest = 0;
  order.forEach((step, i) => {
    if (step.post_hoc) return;   // A post-hoc probe is recorded where it happened; see rule 1 above.
    if (RANK[step.kind] < highest) {
      err(`${ANALYSIS_FILE}#/execution_order/${i}`,
        `${step.kind} '${step.id}' is recorded after a ${highest === 2 ? "query" : "check"}; execution_order is grouped probe -> check -> query`,
        step.kind === "check"
          ? "write and run the applicable Checks before the final analysis SQL, then record them in that order; do not reorder the list to match SQL you already ran"
          : "record probes before the Checks they informed, or mark a look taken after a result with post_hoc: true");
    }
    highest = Math.max(highest, RANK[step.kind]);
  });
  const seenSteps = new Set<string>();
  order.forEach((step, i) => {
    const key = `${step.kind}:${step.id}`;
    if (seenSteps.has(key)) err(`${ANALYSIS_FILE}#/execution_order/${i}`, `${step.kind} '${step.id}' is recorded twice`, "each probe, Check and query appears once");
    seenSteps.add(key);
  });

  // --- rule 3: a causal Claim carries the design that earns it ---
  claims.forEach((claim, i) => {
    if (claim.type === "causal" && claim.causal_basis !== "randomised_assignment") {
      err(`${ANALYSIS_FILE}#/candidate_claims/${i}/causal_basis`,
        `candidate Claim '${claim.id}' is type causal with causal_basis '${claim.causal_basis}'`,
        "a causal Claim is earned by a design that supports it, normally random assignment: record causal_basis: randomised_assignment, or make the Claim associational and say in the memo what the comparison does and does not establish");
    }
  });

  // --- rule 2: everything named exists ---
  const probeIds = new Set(probes.map((p) => p.id));
  for (const [i, step] of order.entries()) {
    if (step.kind === "probe" && !probeIds.has(step.id)) {
      problems.push({ category: "unresolved_reference", location: `${ANALYSIS_FILE}#/execution_order/${i}/id`, message: `probe '${step.id}' is not declared under probes`, remedy: "declare it under probes with what it asked and what it showed, or drop the step" });
    }
  }
  if (!manifest) {
    return problems;
  }
  const manifestChecks = new Set((manifest.checks ?? []).map((c: any) => c.id));
  const manifestQueries = new Set((manifest.queries ?? []).map((q: any) => q.id));
  for (const [i, step] of order.entries()) {
    if (step.kind === "check" && !manifestChecks.has(step.id)) {
      problems.push({ category: "unresolved_reference", location: `${ANALYSIS_FILE}#/execution_order/${i}/id`, message: `Check '${step.id}' is not in manifest.yaml#/checks`, remedy: "declare the Check in the manifest with its path and kind, or remove the step" });
    }
    if (step.kind === "query" && !manifestQueries.has(step.id)) {
      problems.push({ category: "unresolved_reference", location: `${ANALYSIS_FILE}#/execution_order/${i}/id`, message: `query '${step.id}' is not in manifest.yaml#/queries`, remedy: "declare the query in the manifest with its path, or remove the step" });
    }
  }
  const results = new Map((manifest.results ?? []).map((r: any) => [r.id, r]));
  const derived = new Set((manifest.derived ?? []).map((d: any) => d.id));
  const externals = new Set((manifest.external_sources ?? []).map((x: any) => x.id));
  const requestedDerivedIds = new Set(requestedDerived.map((d) => d.id));
  const requestedExternalIds = new Set(requestedExternal.map((x) => x.id));

  // Saved rows, read once per result. `null` means the file is not there (or not readable) to resolve against:
  // the manifest validator reports a missing or corrupt result file, and this one does not double-report it.
  const rowCache = new Map<string, any[] | null>();
  const rowsOf = (res: any): any[] | null => {
    if (!rowCache.has(res.id)) {
      let rows: any[] | null = null;
      try {
        const parsed = JSON.parse(readFileSync(safePath(dir, res.path), "utf8"));
        rows = Array.isArray(parsed?.rows) ? parsed.rows : null;
      } catch { rows = null; }
      rowCache.set(res.id, rows);
    }
    return rowCache.get(res.id)!;
  };

  const refProblem = (location: string, ref: string): void => {
    const m = VALUE_REF.exec(ref);
    if (!m) { problems.push({ category: "unresolved_reference", location, message: `malformed reference '${ref}'`, remedy: "use ref:<result>.<row_key>.<column>, derived:<id> or ext:<id> (docs/contracts/reference-grammar.md)" }); return; }
    if (m[1]) {
      const res: any = results.get(m[1]);
      if (!res) { problems.push({ category: "unresolved_reference", location, message: `result '${m[1]}' is not in manifest.yaml#/results`, remedy: "run `aftergrid execute` so the result exists, or fix the id" }); return; }
      if (!(res.columns ?? []).some((c: any) => c.name === m[3])) {
        problems.push({ category: "missing_column", location, message: `column '${m[3]}' is not declared on result '${m[1]}'`, remedy: "declare the column on the result set or fix the reference" });
        return;
      }
      const rows = rowsOf(res);
      if (rows === null) return;   // Nothing saved to resolve against yet; the manifest validator owns that report.
      const matched = rows.filter((row: any) => String(row?.[res.row_key]) === m[2]);
      if (matched.length === 0) {
        problems.push({ category: "unresolved_reference", location, message: `row key '${m[2]}' is not in result '${m[1]}'`, remedy: `row keys are the values of the '${res.row_key}' column in ${res.path}; fix the key or the query that was supposed to produce that row` });
      } else if (matched.length > 1) {
        problems.push({ category: "duplicate_row_key", location, message: `row key '${m[2]}' matches ${matched.length} rows in result '${m[1]}'`, remedy: "row keys must be unique; fix the query or the declared row_key column" });
      }
      return;
    }
    if (m[4] && !derived.has(m[4]) && !requestedDerivedIds.has(m[4])) {
      problems.push({ category: "unresolved_reference", location, message: `derived value '${m[4]}' is in neither manifest.yaml#/derived nor requested_derived`, remedy: "declare it under requested_derived with its operation, operands and unit — the writer turns that into manifest.derived — or fix the id" });
    }
    if (m[5] && !externals.has(m[5]) && !requestedExternalIds.has(m[5])) {
      problems.push({ category: "unresolved_reference", location, message: `external source '${m[5]}' is in neither manifest.yaml#/external_sources nor requested_external_sources`, remedy: "declare it under requested_external_sources with its typed source — the writer turns that into manifest.external_sources — or fix the id" });
    }
  };

  requestedDerived.forEach((d, i) => {
    (d.operands ?? []).forEach((ref, j) => refProblem(`${ANALYSIS_FILE}#/requested_derived/${i}/operands/${j}`, ref));
  });

  const definitions = new Map((manifest.definitions ?? []).map((d: any) => [d.id, d]));
  claims.forEach((claim, i) => {
    (claim.evidence ?? []).forEach((ref: string, j: number) => refProblem(`${ANALYSIS_FILE}#/candidate_claims/${i}/evidence/${j}`, ref));
    if (claim.recheck_draft?.mode === "automatic") {
      (claim.recheck_draft.evidence ?? []).forEach((ref: string, j: number) => refProblem(`${ANALYSIS_FILE}#/candidate_claims/${i}/recheck_draft/evidence/${j}`, ref));
    }
    (claim.definition_refs ?? []).forEach((ref: any, j: number) => {
      const location = `${ANALYSIS_FILE}#/candidate_claims/${i}/definition_refs/${j}`;
      const pinned: any = definitions.get(ref.id);
      if (!pinned) {
        problems.push({ category: "unresolved_reference", location, message: `definition '${ref.id}' is not in manifest.yaml#/definitions`, remedy: "pin every definition the Analysis uses in manifest.definitions with its kind, lifecycle and content hash (docs/contracts/analysis-directory.md step (b))" });
      } else if (pinned.version !== ref.version) {
        problems.push({ category: "definition_version", location, message: `definition '${ref.id}' is pinned at version ${pinned.version} and this Claim names version ${ref.version}`, remedy: "read the version the manifest pins, or pin the version the Analysis read" });
      }
    });
  });

  return problems;
}

/**
 * What is worth saying about the Analysis file and is not a defect. Empty when there is no file. Never throws.
 *
 * Today that is one rule: `probes` is the account of the middle of the analysis, so it is kept in the order the
 * looks were taken. A probe timestamped before the one above it means the list is not the timeline it reads as
 * — worth reporting, and not worth refusing a Finding over, because the honest repair is to fix the times, not
 * to re-sort the list until it looks orderly.
 */
export function analysisWarnings(dir: string): Problem[] {
  let analysis: Analysis | null;
  try { analysis = readAnalysis(dir); } catch { return []; }
  const probes = Array.isArray(analysis?.probes) ? analysis!.probes! : [];
  const warnings: Problem[] = [];
  // An unparseable or absent `at` is the schema's error to report, so it is skipped rather than double-reported.
  const timed = probes
    .map((probe, i) => ({ probe, i, ms: Date.parse(String(probe?.at)) }))
    .filter((p) => Number.isFinite(p.ms));
  for (let n = 1; n < timed.length; n++) {
    const here = timed[n]!, before = timed[n - 1]!;
    if (here.ms >= before.ms) continue;
    warnings.push({
      category: "analysis_contract",
      location: `${ANALYSIS_FILE}#/probes/${here.i}/at`,
      message: `probe '${here.probe.id}' is timestamped ${here.probe.at}, earlier than probe '${before.probe.id}' at ${before.probe.at}; probes are read as the timeline of the middle of the analysis`,
      remedy: "record each probe when it happens, in order. A look taken after a result is recorded where it happened (post_hoc: true on its execution_order step), not moved up the list, and a wrong time is corrected rather than re-sorted around",
    });
  }
  return warnings;
}

/** One line per fact worth reporting from an Analysis file; empty when there is no file. Never throws. */
export function analysisSummary(dir: string): string[] {
  let analysis: Analysis | null;
  try { analysis = readAnalysis(dir); } catch { return []; }
  if (!analysis) return [];
  const lines: string[] = [];
  const stage = analysisStage(analysis);
  if (stage === "clarified") {
    lines.push(`analysis.yaml: Reader ${analysis.reader_profile ?? "unrecorded"}, stage clarified — the Question's seed is recorded and the working record of the run is not filled in yet`);
  } else if (analysis.outcome_recommendation) {
    lines.push(`analysis.yaml: Reader ${analysis.reader_profile ?? "unrecorded"}, recommends ${analysis.outcome_recommendation.outcome} — ${analysis.outcome_recommendation.reason}`);
  } else {
    lines.push(`analysis.yaml: Reader ${analysis.reader_profile ?? "unrecorded"}, no outcome_recommendation recorded yet`);
  }
  if (Array.isArray(analysis.execution_order) && analysis.execution_order.length) {
    const order = analysis.execution_order
      .map((s) => `${s?.kind}:${s?.id}${s?.exploratory ? " (exploratory)" : ""}${s?.post_hoc ? " (post-hoc)" : ""}`)
      .join(" -> ");
    lines.push(`analysis.yaml execution order: ${order}`);
  } else {
    lines.push("analysis.yaml: no execution order recorded yet");
  }
  const probeList = analysis.probes ?? [];
  const byKind = (k: ProbeKind) => probeList.filter((p) => p?.kind === k).length;
  const kinds = `${byKind("exploratory")} exploratory, ${byKind("dead_end")} dead end(s), ${byKind("reframe")} reframe(s)`;
  lines.push(`analysis.yaml: ${(analysis.assumptions ?? []).length} assumption(s), ${probeList.length} probe(s) (${kinds}), ${(analysis.candidate_claims ?? []).length} candidate Claim(s)`);
  if (!analysis.pre_registered_comparison) lines.push("analysis.yaml: no pre-registered comparison recorded; every Claim here is exploratory");
  else if (!analysis.pre_registered_comparison.registered_before_cuts) lines.push("analysis.yaml: the primary comparison was registered AFTER cuts were explored, and says so");
  for (const n of analysis.needs_input ?? []) lines.push(`analysis.yaml needs input (${n?.kind}, owner ${n?.owner}): ${n?.description}`);
  return lines;
}
