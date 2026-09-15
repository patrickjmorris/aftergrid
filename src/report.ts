// The machine-readable report every command prints. Categories are stable strings; humans get message + remedy.
export type Category =
  | "syntax" | "schema" | "template" | "incomplete" | "exists" | "missing_file" | "hash_mismatch"
  | "unresolved_reference" | "duplicate_row_key" | "missing_column" | "null_value" | "unit_mismatch" | "derived_cycle"
  | "untraced_numeral" | "chart_subset" | "export_policy" | "definition_version" | "definition_not_approved"
  | "check_failed" | "falsifier" | "provisional_evidence" | "digest" | "stale_attestation" | "untrusted_attestation"
  | "unsafe_path" | "path_collision" | "duplicate_id" | "execution_binding" | "result_shape" | "value_type" | "derived_arity" | "check_error"
  | "invalid_artifact" | "sql_policy" | "sql_parameter" | "check_shape" | "stale_review" | "minimum_data"
  | "not_implemented";

export type Problem = { category: Category; location: string; message: string; remedy?: string };

export type Report = {
  command: "new" | "check" | "render";
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
export const exitCodeFor = (r: Report): number => (r.errors.some((e) => e.category === "exists") ? 2 : r.errors.length ? 1 : 0);
