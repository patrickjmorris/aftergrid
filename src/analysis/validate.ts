// The Analysis file (`analysis.yaml`) beside `manifest.yaml` in a Finding directory.
// Contract: docs/contracts/analysis-directory.md. Schema: src/analysis/analysis.schema.json.
//
// Two rules the JSON Schema cannot state, and they are the point of the file:
//   1. Checks are written and run BEFORE the final analysis queries. `execution_order` is grouped
//      probe -> check -> query, and a Check recorded after a query is an error, not a note.
//   2. Everything the Analysis names must exist in the manifest: an execution_order id resolves to a
//      manifest Check or query, a probe id resolves to a declared probe, and a candidate Claim's evidence
//      resolves to a saved result set, a declared derived value or a typed external source.
//
// The file is optional. A Finding with no `analysis.yaml` — a hand-authored exemplar, a draft that has not
// reached the analysis yet — returns no problems, because absence is not a defect.
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

export type ExecutionStep = { kind: "probe" | "check" | "query"; id: string; exploratory?: boolean; note?: string };
export type Analysis = {
  schema_version: string;
  reader_profile: string;
  assumptions: { id: string; statement: string; basis: string; settled_by?: string; affects?: string[] }[];
  pre_registered_comparison?: { statement: string; registered_before_cuts: boolean; registered_at?: string; source?: string };
  probes: { id: string; kind: "exploratory"; question: string; observed: string; sql_path?: string; changed_plan?: string }[];
  execution_order: ExecutionStep[];
  candidate_claims: Record<string, any>[];
  outcome_recommendation: { outcome: "answered" | "inconclusive" | "insufficient_data" | "needs_reframing"; reason: string; what_would_be_needed?: string[] };
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

const VALUE_REF = /^(?:ref:([a-z][a-z0-9_]{0,63})\.([A-Za-z0-9_-]{1,64})\.([a-z][a-z0-9_]{0,63})|derived:([a-z][a-z0-9_]{0,63})|ext:([a-z][a-z0-9_]{0,63}))$/;

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
      err(`${ANALYSIS_FILE}#${e.instancePath || "/"}`, `${e.message}${detail}`,
        "fix analysis.yaml against src/analysis/analysis.schema.json (docs/contracts/analysis-directory.md)");
    }
    return problems;   // Shape first: the rules below read fields the schema just rejected.
  }

  // --- ids are unique within their list ---
  for (const [list, items] of [["assumptions", analysis.assumptions], ["probes", analysis.probes], ["candidate_claims", analysis.candidate_claims]] as const) {
    const seen = new Set<string>();
    (items as { id: string }[]).forEach((item, i) => {
      if (seen.has(item.id)) err(`${ANALYSIS_FILE}#/${list}/${i}/id`, `'${item.id}' is used twice in ${list}`, "ids are unique within their list");
      seen.add(item.id);
    });
  }

  // --- rule 1: Checks come before the analysis queries ---
  const RANK: Record<ExecutionStep["kind"], number> = { probe: 0, check: 1, query: 2 };
  let highest = 0;
  analysis.execution_order.forEach((step, i) => {
    if (RANK[step.kind] < highest) {
      err(`${ANALYSIS_FILE}#/execution_order/${i}`,
        `${step.kind} '${step.id}' is recorded after a ${highest === 2 ? "query" : "check"}; execution_order is grouped probe -> check -> query`,
        step.kind === "check"
          ? "write and run the applicable Checks before the final analysis SQL, then record them in that order; do not reorder the list to match SQL you already ran"
          : "record probes before the Checks they informed");
    }
    highest = Math.max(highest, RANK[step.kind]);
  });
  const seenSteps = new Set<string>();
  analysis.execution_order.forEach((step, i) => {
    const key = `${step.kind}:${step.id}`;
    if (seenSteps.has(key)) err(`${ANALYSIS_FILE}#/execution_order/${i}`, `${step.kind} '${step.id}' is recorded twice`, "each probe, Check and query appears once");
    seenSteps.add(key);
  });

  // --- rule 2: everything named exists ---
  const probeIds = new Set(analysis.probes.map((p) => p.id));
  for (const [i, step] of analysis.execution_order.entries()) {
    if (step.kind === "probe" && !probeIds.has(step.id)) {
      problems.push({ category: "unresolved_reference", location: `${ANALYSIS_FILE}#/execution_order/${i}/id`, message: `probe '${step.id}' is not declared under probes`, remedy: "declare it under probes with what it asked and what it showed, or drop the step" });
    }
  }
  if (!manifest) {
    return problems;
  }
  const manifestChecks = new Set((manifest.checks ?? []).map((c: any) => c.id));
  const manifestQueries = new Set((manifest.queries ?? []).map((q: any) => q.id));
  for (const [i, step] of analysis.execution_order.entries()) {
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
  const refProblem = (location: string, ref: string): void => {
    const m = VALUE_REF.exec(ref);
    if (!m) { problems.push({ category: "unresolved_reference", location, message: `malformed reference '${ref}'`, remedy: "use ref:<result>.<row_key>.<column>, derived:<id> or ext:<id> (docs/contracts/reference-grammar.md)" }); return; }
    if (m[1]) {
      const res: any = results.get(m[1]);
      if (!res) { problems.push({ category: "unresolved_reference", location, message: `result '${m[1]}' is not in manifest.yaml#/results`, remedy: "run `aftergrid execute` so the result exists, or fix the id" }); return; }
      if (!(res.columns ?? []).some((c: any) => c.name === m[3])) problems.push({ category: "missing_column", location, message: `column '${m[3]}' is not declared on result '${m[1]}'`, remedy: "declare the column on the result set or fix the reference" });
      return;
    }
    if (m[4] && !derived.has(m[4])) problems.push({ category: "unresolved_reference", location, message: `derived value '${m[4]}' is not in manifest.yaml#/derived`, remedy: "declare it under derived with its operation, operands and unit" });
    if (m[5] && !externals.has(m[5])) problems.push({ category: "unresolved_reference", location, message: `external source '${m[5]}' is not in manifest.yaml#/external_sources`, remedy: "declare it under external_sources with a typed source" });
  };
  analysis.candidate_claims.forEach((claim, i) => {
    (claim.evidence ?? []).forEach((ref: string, j: number) => refProblem(`${ANALYSIS_FILE}#/candidate_claims/${i}/evidence/${j}`, ref));
    if (claim.recheck_draft?.mode === "automatic") {
      (claim.recheck_draft.evidence ?? []).forEach((ref: string, j: number) => refProblem(`${ANALYSIS_FILE}#/candidate_claims/${i}/recheck_draft/evidence/${j}`, ref));
    }
  });

  return problems;
}

/** One line per fact worth reporting from a valid Analysis file; empty when there is no file. */
export function analysisSummary(dir: string): string[] {
  let analysis: Analysis | null;
  try { analysis = readAnalysis(dir); } catch { return []; }
  if (!analysis) return [];
  const order = analysis.execution_order.map((s) => `${s.kind}:${s.id}${s.exploratory ? " (exploratory)" : ""}`).join(" -> ");
  const lines = [
    `analysis.yaml: Reader ${analysis.reader_profile}, recommends ${analysis.outcome_recommendation.outcome} — ${analysis.outcome_recommendation.reason}`,
    `analysis.yaml execution order: ${order}`,
    `analysis.yaml: ${analysis.assumptions.length} assumption(s), ${analysis.probes.length} exploratory probe(s), ${analysis.candidate_claims.length} candidate Claim(s)`,
  ];
  if (!analysis.pre_registered_comparison) lines.push("analysis.yaml: no pre-registered comparison recorded; every Claim here is exploratory");
  else if (!analysis.pre_registered_comparison.registered_before_cuts) lines.push("analysis.yaml: the primary comparison was registered AFTER cuts were explored, and says so");
  for (const n of analysis.needs_input ?? []) lines.push(`analysis.yaml needs input (${n.kind}, owner ${n.owner}): ${n.description}`);
  return lines;
}
