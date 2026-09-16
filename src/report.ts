// The machine-readable report every command prints. Categories are stable strings; humans get message + remedy.
export type Category =
  | "syntax" | "schema" | "template" | "incomplete" | "exists" | "missing_file" | "hash_mismatch"
  | "unresolved_reference" | "duplicate_row_key" | "missing_column" | "null_value" | "unit_mismatch" | "derived_cycle"
  | "untraced_numeral" | "chart_subset" | "export_policy" | "definition_version" | "definition_not_approved"
  | "check_failed" | "falsifier" | "provisional_evidence" | "digest" | "stale_attestation" | "untrusted_attestation"
  | "unsafe_path" | "path_collision" | "duplicate_id" | "execution_binding" | "result_shape" | "value_type" | "derived_arity" | "check_error"
  | "decision_binding" | "decision_conflict" | "render_error" | "rerun_mismatch" | "admission" | "cancelled" | "resource_limit" | "sql_error" | "invalid_artifact" | "sql_policy" | "sql_parameter" | "check_shape" | "stale_review" | "minimum_data"
  | "policy_untrusted" | "solo_setup_invalid" | "tampered_output"
  // revision (docs/contracts/revise.md): a requested change that costs more than a re-render
  | "reopens_analysis"
  | "hook_not_installed" | "hook_self_test_failed"
  | "runtime_unavailable" | "missing_credential"
  | "dependency_missing" | "write_capable_role"
  // the Analysis file (docs/contracts/analysis-directory.md): analysis.yaml disagreeing with its own contract
  | "analysis_contract"
  // distribution (docs/contracts/distribution.md): the shipped package disagreeing with itself
  | "plugin_manifest" | "invocation_policy"
  // background intake (docs/contracts/intake.md): states a request can rest in, and why it stopped there
  | "dispatch_refused" | "source_limits_missing" | "harness_failed" | "needs_input" | "needs_attention"
  | "already_claimed" | "superseded" | "scope_violation" | "api_error"
  | "not_implemented";

export type Problem = { category: Category; location: string; message: string; remedy?: string };

export type Report = {
  command: "new" | "check" | "render" | "decide" | "hook" | "setup" | "intake" | "plugin" | "capture" | "execute" | "revise" | "review" | "eval";
  finding?: string;
  state?: string;
  outcome?: string;
  /** Distinct axes, never one boolean. */
  syntax: "ok" | "invalid";
  content: "complete" | "incomplete";
  evidence: "valid" | "invalid" | "not_evaluated";
  sql_execution: "not_performed" | "performed";
  readiness: "ready" | "not_ready" | "unknown";
  readiness_reasons: string[];
  errors: Problem[];
  warnings: Problem[];
  info: string[];
};

export function emptyReport(command: Report["command"]): Report {
  return { command, syntax: "ok", content: "incomplete", evidence: "not_evaluated", sql_execution: "not_performed", readiness: "not_ready", readiness_reasons: [], errors: [], warnings: [], info: [] };
}

export function formatHuman(r: Report): string {
  const lines: string[] = [];
  lines.push(`${r.command}${r.finding ? " " + r.finding : ""}: syntax ${r.syntax}, content ${r.content}, evidence ${r.evidence}, sql ${r.sql_execution}, publication ${r.readiness}`);
  for (const reason of r.readiness_reasons) lines.push(`  readiness: ${reason}`);
  for (const e of r.errors) lines.push(`  error ${e.category} at ${e.location}: ${e.message}${e.remedy ? " -> " + e.remedy : ""}`);
  for (const w of r.warnings) lines.push(`  warning ${w.category} at ${w.location}: ${w.message}`);
  for (const i of r.info) lines.push(`  note: ${i}`);
  return lines.join("\n");
}

/** Exit codes: 0 clean, 1 errors found, 2 usage or refused action, 3 not implemented. */
const REFUSALS = new Set<Category>(["exists", "reopens_analysis"]);
export const exitCodeFor = (r: Report): number =>
  r.errors.some((e) => e.category === "not_implemented") ? 3 : r.errors.some((e) => REFUSALS.has(e.category)) ? 2 : r.errors.length ? 1 : 0;
