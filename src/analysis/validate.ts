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
import { sha256 } from "../digest.ts";
// @ts-ignore: shared path containment (JS module, no types).
import { safePath, ContractError, DIRECTIONAL_OPERATIONS } from "../../scripts/fixture-safety.mjs";

export const ANALYSIS_FILE = "analysis.yaml";
const SCHEMA_PATH = fileURLToPath(new URL("./analysis.schema.json", import.meta.url));

export type AnalysisStage = "clarified" | "analysed";
/** What a probe was: a look that informed the plan, a path abandoned, or a look that changed the Question. */
export type ProbeKind = "exploratory" | "dead_end" | "reframe";
export type Probe = { id: string; at: string; kind: ProbeKind; question: string; observed: string; sql_path?: string; changed_plan?: string };
export type ExecutionStep = { kind: "probe" | "check" | "query"; id: string; exploratory?: boolean; post_hoc?: boolean; note?: string };
/** A Check's SQL as it stood when it was written, before any analysis query ran. See the schema's description. */
export type Sha256 = { algorithm: "sha256"; value: string };
export type PreregisteredCheck = {
  check_id: string; content_hash: Sha256; at: string;
  /** The Check's `required` flag as pre-registered: un-requiring it afterwards is otherwise traceless. */
  required: boolean;
  /** The verdict a falsifier was written to produce. In manifest.checks, never in the SQL, so it is pinned here. */
  expected_outcome?: "pass" | "fail";
  /** sha256 of manifest.question.falsifier.statement, on the entry for the Check the Question names. */
  statement_hash?: Sha256;
  note?: string;
};
/**
 * `operands` has the two forms `manifest.derived` has: a positional list, or the named `{ after, baseline }`
 * pair that `difference`, `ratio` and `percent_change` accept. The Analysis is where a derived value is first
 * requested, so it is where the direction is first stated.
 */
export type NamedOperands = { after: string; baseline: string };
export type RequestedDerived = { id: string; operation: string; operands: string[] | NamedOperands; unit: string; display?: Record<string, unknown>; description?: string };
export type RequestedExternalSource = { id: string; kind: string; value: number | string; unit: string; source: Record<string, unknown> };
export type Analysis = {
  schema_version: string;
  stage?: AnalysisStage;
  /** When the Question was settled. Capture is meant to follow it; `analysisWarnings` says when it did not. */
  clarified_at?: string;
  reader_profile: string;
  assumptions: { id: string; statement: string; basis: string; settled_by?: string; affects?: string[] }[];
  pre_registered_comparison?: { statement: string; registered_before_cuts: boolean; registered_at?: string; source?: string };
  probes?: Probe[];
  checks_preregistered?: PreregisteredCheck[];
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
  if (/^\/checks_preregistered\/\d+/.test(path)) {
    return "a pre-registration pins what decides the Check: the sha256 of its SQL file (`content_hash`), its `required` flag, a falsifier's `expected_outcome`, and — for the Check the Question names as its falsifier — the sha256 of `question.falsifier.statement` as `statement_hash`. An entry pinning the SQL alone leaves the verdict, the flag and the statement free to move after the result (docs/contracts/analysis-directory.md)";
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
    // An `if`/`then` miss reports twice: the precise error inside the `then` and a second "must match then
    // schema" at the same path. The second one only repeats the first with a generic remedy, so it is dropped
    // when a sibling at that path already says what is wrong.
    const errors = (check.errors ?? []).filter((e, _, all) =>
      !((e.keyword === "if" || e.keyword === "then") && all.some((o) => o !== e && o.instancePath.startsWith(e.instancePath) && o.keyword !== "if" && o.keyword !== "then")));
    for (const e of errors) {
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
  // --- a pre-registered Check is the Check that ran ---
  // The one mechanical answer to "was this falsifier written before the number was known, and left alone
  // afterwards?". Four things decide that, and only one of them is in the SQL file: the statement in the
  // Question, the `expected_outcome` and `required` flags in manifest.checks, and the file's own bytes. A
  // pre-registration that pinned the SQL alone would let the cheapest edits of all — flipping the expected
  // verdict, or the required flag, after the result came back — leave no trace at all. Every difference is the
  // same report and the same repair: say what changed and why, never re-pin the recorded value to match.
  const REPIN = "the Check changed after it was pre-registered. Say so — a falsifier edited after its result was seen is not a falsifier — and record the change as a probe of kind reframe with what it changed and why. Never re-pin the pre-registration to match the manifest";
  const checkById = new Map((manifest.checks ?? []).map((c: any) => [c.id, c]));
  const questionFalsifier = manifest.question?.falsifier?.kind === "check" ? manifest.question.falsifier : null;
  (analysis.checks_preregistered ?? []).forEach((entry, i) => {
    const at = `${ANALYSIS_FILE}#/checks_preregistered/${i}`;
    const ck: any = checkById.get(entry.check_id);
    if (!ck) {
      problems.push({ category: "unresolved_reference", location: `${at}/check_id`, message: `Check '${entry.check_id}' is not in manifest.yaml#/checks`, remedy: "name a Check the manifest declares, or drop the entry" });
      return;
    }
    if (ck.content_hash?.value !== entry.content_hash.value) {
      err(`${at}/content_hash`,
        `Check '${entry.check_id}' was pre-registered at ${entry.at} with a different SQL file than the one the manifest pins`, REPIN);
    }
    if (entry.required !== (ck.required === true)) {
      err(`${at}/required`,
        `Check '${entry.check_id}' was pre-registered at ${entry.at} with required: ${entry.required}, and the manifest declares required: ${ck.required === true}`, REPIN);
    }
    // `expected_outcome` is what a falsifier means. It is not in the SQL, so the pre-registration has to carry
    // it or the pre-registration says nothing about the verdict the Check was written to produce.
    if (ck.kind === "falsifier" && entry.expected_outcome === undefined) {
      err(`${at}/expected_outcome`,
        `falsifier '${entry.check_id}' is pre-registered without its expected_outcome, so nothing here records the verdict it was written to produce`,
        "record expected_outcome beside the content hash when the Check is written: the SQL hash alone cannot show that the expected verdict was not flipped after the result came back");
    } else if (entry.expected_outcome !== undefined && entry.expected_outcome !== ck.expected_outcome) {
      err(`${at}/expected_outcome`,
        `Check '${entry.check_id}' was pre-registered at ${entry.at} expecting ${entry.expected_outcome}, and the manifest declares expected_outcome ${ck.expected_outcome ?? "(none)"}`, REPIN);
    }
    // The Question's falsifier statement is the plain-language bar the Answer was agreed against. It is pinned
    // on the entry for the Check the Question names, and nowhere else: no other Check has a statement.
    const isQuestionFalsifier = questionFalsifier?.check_id === entry.check_id;
    if (entry.statement_hash && !isQuestionFalsifier) {
      err(`${at}/statement_hash`,
        `Check '${entry.check_id}' pins a falsifier statement, and manifest.yaml#/question/falsifier ${questionFalsifier ? `names '${questionFalsifier.check_id}'` : "names no Check"}`,
        "statement_hash belongs on the entry for the Check the Question names as its falsifier; drop it here, or make this Check the Question's falsifier");
    } else if (isQuestionFalsifier && !entry.statement_hash) {
      err(`${at}/statement_hash`,
        `the Question's falsifier '${entry.check_id}' is pre-registered without a statement_hash, so the plain-language bar it was agreed against is not pinned`,
        "record statement_hash as the sha256 of manifest.yaml#/question/falsifier/statement when the Check is written; without it the statement can be restated around whatever the data showed");
    } else if (isQuestionFalsifier && entry.statement_hash && entry.statement_hash.value !== sha256(String(questionFalsifier.statement))) {
      err(`${at}/statement_hash`,
        `the Question's falsifier statement changed after '${entry.check_id}' was pre-registered at ${entry.at}`, REPIN);
    }
  });
  const prereg = analysis.checks_preregistered ?? [];
  prereg.forEach((entry, i) => {
    if (prereg.findIndex((o) => o.check_id === entry.check_id) !== i) {
      err(`${ANALYSIS_FILE}#/checks_preregistered/${i}/check_id`, `'${entry.check_id}' is pre-registered twice`, "one entry per Check: the file as it stood when it was written");
    }
  });

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
    const at = `${ANALYSIS_FILE}#/requested_derived/${i}/operands`;
    if (Array.isArray(d.operands) || !d.operands) {
      (d.operands ?? []).forEach((ref, j) => refProblem(`${at}/${j}`, ref));
      return;
    }
    // The named pair declares a direction, and only the three operations whose sign depends on operand order
    // have one to declare. The same refusal, with the same category, as `manifest.derived` (fixture-safety.mjs).
    if (!DIRECTIONAL_OPERATIONS.includes(d.operation)) {
      problems.push({ category: "derived_arity", location: at, message: `named operands declare a direction and '${d.operation}' has none`, remedy: `only ${DIRECTIONAL_OPERATIONS.join(", ")} take { after, baseline }; give ${d.operation} a positional list of operands` });
      return;
    }
    refProblem(`${at}/after`, d.operands.after);
    refProblem(`${at}/baseline`, d.operands.baseline);
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
 * `probes` is the account of the middle of the analysis, so it is kept in the order the looks were taken. A
 * probe timestamped before the one above it means the list is not the timeline it reads as — worth reporting,
 * and not worth refusing a Finding over, because the honest repair is to fix the times, not to re-sort the list
 * until it looks orderly.
 *
 * A requested `difference`, `ratio` or `percent_change` over a positional operand pair is the other:
 * `direction_unstated`. The Analysis is where the derived value is first written down, so it is the first place
 * the direction can be declared — and a positional pair written baseline-then-after here is what reached a real
 * memo as "rose by −20.6%" (examples/nyc-open-data/docs/run-log.md, Citi Bike run 1).
 */
export function analysisWarnings(dir: string): Problem[] {
  let analysis: Analysis | null;
  try { analysis = readAnalysis(dir); } catch { return []; }
  const probes = Array.isArray(analysis?.probes) ? analysis!.probes! : [];
  const warnings: Problem[] = [...captureBeforeClarify(dir, analysis)];
  (Array.isArray(analysis?.requested_derived) ? analysis!.requested_derived! : []).forEach((d, i) => {
    if (!DIRECTIONAL_OPERATIONS.includes(d?.operation) || !Array.isArray(d?.operands)) return;
    warnings.push({
      category: "direction_unstated",
      location: `${ANALYSIS_FILE}#/requested_derived/${i}/operands`,
      message: `'${d.id}' requests ${d.operation} over a positional operand pair, so which operand is the measured value and which is the reference is not declared`,
      remedy: "name the pair: `operands: { after: <ref>, baseline: <ref> }`. difference is after − baseline, ratio is after / baseline, percent_change is 100 × (after − baseline) / baseline — the writer carries the names into manifest.derived, and the sign becomes a fact `check` stands behind",
    });
  });
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

/**
 * Clarify, then capture. A Snapshot input retained before the Question was settled was chosen before anyone
 * knew what was being asked — the skill says so in words (`skills/checked-analysis/SKILL.md`, step 3), and a
 * real run captured four tables before clarifying, one of them 93,739 rows that no Claim ever read
 * (`examples/nyc-open-data/docs/run-log.md`). This is what makes that checkable.
 *
 * A **warning**, never an error: the extract is what it is, its hash still pins it, and the repair is the next
 * revision's order of work rather than anything about this evidence. Nothing is claimed when the clarification
 * moment was not recorded — `clarified_at`, else `pre_registered_comparison.registered_at`, else silence,
 * because inferring one from the earliest probe would time-stamp clarification by a look that came after it.
 */
function captureBeforeClarify(dir: string, analysis: Analysis | null): Problem[] {
  const recorded = analysis?.clarified_at ?? analysis?.pre_registered_comparison?.registered_at;
  const clarifiedMs = Date.parse(String(recorded));
  if (!Number.isFinite(clarifiedMs)) return [];
  const field = analysis?.clarified_at ? "clarified_at" : "pre_registered_comparison.registered_at";
  let manifest: any;
  try { manifest = parseYaml(readFileSync(safePath(dir, "manifest.yaml"), "utf8")); } catch { return []; }
  const inputs = Array.isArray(manifest?.snapshot?.inputs) ? manifest.snapshot.inputs : [];
  const out: Problem[] = [];
  inputs.forEach((input: any, i: number) => {
    const capturedMs = Date.parse(String(input?.captured_at));
    if (!Number.isFinite(capturedMs) || capturedMs >= clarifiedMs) return;
    out.push({
      category: "capture_before_clarify",
      location: `manifest.yaml#/snapshot/inputs/${i}/captured_at`,
      message: `input '${input?.id ?? i}' was captured at ${input.captured_at}, before the Question was clarified at ${recorded} (${ANALYSIS_FILE}#/${field}); an extract chosen before the Question was settled was chosen without knowing what it had to answer`,
      remedy: "clarify first, then capture what the settled Question needs. The extract is kept and stays pinned; recapture under the clarified Question in the next revision, and say in analysis.yaml why this one was read early if it was",
    });
  });
  return out;
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
  // What a reviewer needs to judge a falsifier: whether its content was pinned when it was written, or only its
  // place in the timeline. Said either way, because "no hash recorded" is itself the reviewer's answer.
  const prereg = analysis.checks_preregistered ?? [];
  lines.push(prereg.length
    ? `analysis.yaml: ${prereg.length} Check(s) pre-registered (${prereg.map((c) => `${c?.check_id} at ${c?.at}`).join(", ")}); check compares each entry's SQL hash, required flag, expected_outcome and falsifier statement hash with the manifest, and nothing else about the Check`
    : "analysis.yaml: no Check pre-registration hashes recorded; whether a Check was edited, re-aimed or un-required after its result can only be read from the probe and execution_order timeline");
  if (!analysis.pre_registered_comparison) lines.push("analysis.yaml: no pre-registered comparison recorded; every Claim here is exploratory");
  else if (!analysis.pre_registered_comparison.registered_before_cuts) lines.push("analysis.yaml: the primary comparison was registered AFTER cuts were explored, and says so");
  for (const n of analysis.needs_input ?? []) lines.push(`analysis.yaml needs input (${n?.kind}, owner ${n?.owner}): ${n?.description}`);
  return lines;
}
