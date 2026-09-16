// Provisional sign-off records: the only bridge ADR 0006 (amended) allows, and a narrow one. A provisional read
// of a non-sensitive unverified source needs a recorded human sign-off scoped to source, reason, date and expiry,
// backed by a reference a Finding PR cannot edit into existence. An approver *name* is editable text, so a record
// carrying only a name is reported unverified and blocked.
//
// Hard database permissions, privacy boundaries and execution limits have no bridge: this file never grants those.
// A result read this way carries results[].provisional, which the shared validator already refuses to export.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { parse as parseYaml } from "yaml";
// @ts-ignore: shared path containment and error type.
import { safePath, ContractError } from "../../scripts/fixture-safety.mjs";

export type ProvisionalEvidence = { type?: string; url?: string; note_path?: string; signature?: string };
export type ProvisionalRecord = {
  id?: string;
  source?: string;
  reason?: string;
  reason_code?: string;
  approver?: { name?: string; evidence?: ProvisionalEvidence };
  date?: string;
  expiry?: string;
};

export type ProvisionalDecision = {
  decision: "allowed" | "blocked";
  source: string;
  record_id: string | null;
  record_path: string | null;
  reason_code: string | null;
  /** Why it was blocked. Empty when allowed. */
  reasons: { code: string; message: string }[];
  /** True facts about an allowed sign-off that are still not verified by this tool. Never silently dropped. */
  caveats: string[];
  evaluated_at: string;
};

/** References a Finding PR cannot mint for itself. A bare approver name is deliberately absent. */
const REFERENCE_TYPES = new Set(["github_pr_review", "github_issue_comment", "signed_note"]);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const dayStart = (d: string) => Date.parse(`${d}T00:00:00Z`);
const dayEnd = (d: string) => Date.parse(`${d}T23:59:59.999Z`);

/** `<instance>/provisional/<id>.yaml`, contained by the Instance root. */
export function recordPath(instanceRoot: string, id: string): string {
  return safePath(instanceRoot, `provisional/${id}.yaml`);
}

/**
 * Validate the sign-off `id` for `source` at `at`. Missing, unparsable, wrong-source, not-yet-valid, expired and
 * unverified-evidence records are all blocked, each with its own reason code. Every evaluation is logged.
 */
export function evaluateProvisional(
  instanceRoot: string,
  id: string,
  source: string,
  at: Date = new Date(),
  opts: { log?: boolean } = {},
): ProvisionalDecision {
  const evaluated_at = at.toISOString();
  const reasons: { code: string; message: string }[] = [];
  const caveats: string[] = [];
  let path: string | null = null;
  let record: ProvisionalRecord | null = null;

  try {
    path = recordPath(instanceRoot, id);
    if (!existsSync(path)) reasons.push({ code: "missing", message: `no provisional sign-off at provisional/${id}.yaml; a read of an unverified source needs one recorded first` });
    else {
      const parsed = parseYaml(readFileSync(path, "utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) reasons.push({ code: "invalid_artifact", message: "the sign-off file is not a YAML mapping" });
      else record = parsed as ProvisionalRecord;
    }
  } catch (e) {
    reasons.push({ code: e instanceof ContractError ? String((e as any).category) : "invalid_artifact", message: (e as Error).message });
  }

  if (record) {
    // The filename is the identity a caller asked for and the only thing the log can be joined by. A record that
    // declares a different id would be logged under a path that holds no such record.
    if (record.id !== undefined && record.id !== id) {
      reasons.push({ code: "id_mismatch", message: `the record at provisional/${id}.yaml declares id '${String(record.id)}'; a sign-off is identified by its file, and one that misnames itself cannot be audited` });
    }
    for (const field of ["source", "reason", "date", "expiry"] as const) {
      if (typeof record[field] !== "string" || !String(record[field]).trim()) reasons.push({ code: "incomplete", message: `${field} is missing; a sign-off is scoped to source, reason, date and expiry` });
    }
    if (typeof record.source === "string" && record.source !== source) {
      reasons.push({ code: "wrong_source", message: `the sign-off covers '${record.source}', not '${source}'; a sign-off is never transferable between sources` });
    }
    for (const field of ["date", "expiry"] as const) {
      const v = record[field];
      if (typeof v === "string" && v.trim() && !DAY.test(v)) reasons.push({ code: "invalid_date", message: `${field} '${v}' is not a yyyy-mm-dd date` });
    }
    if (typeof record.date === "string" && DAY.test(record.date) && at.getTime() < dayStart(record.date)) {
      reasons.push({ code: "not_yet_valid", message: `the sign-off starts on ${record.date}, after ${evaluated_at}` });
    }
    if (typeof record.expiry === "string" && DAY.test(record.expiry) && at.getTime() > dayEnd(record.expiry)) {
      reasons.push({ code: "expired", message: `the sign-off expired on ${record.expiry}; provisional access is time-boxed and does not renew itself` });
    }
    const evidence = record.approver?.evidence;
    const reference = evidence && typeof evidence === "object" && REFERENCE_TYPES.has(String(evidence.type)) && [evidence.url, evidence.note_path, evidence.signature].some((v) => typeof v === "string" && v.trim());
    if (!reference) {
      reasons.push({
        code: "unverified_evidence",
        message: record.approver?.name
          ? `approver '${record.approver.name}' is editable text and is not authorization; record a reference (${[...REFERENCE_TYPES].join(", ")}) that names what was approved`
          : `no approver evidence; record a reference (${[...REFERENCE_TYPES].join(", ")}), never a name alone`,
      });
    } else {
      caveats.push(`the approver reference (${evidence!.type}) is recorded but not verified through the provider's API by this tool; it is reported as recorded, never as verified`);
    }
  }

  caveats.push("results read under this sign-off carry results[].provisional and can never be rendered for a Reader");
  const decision: ProvisionalDecision = {
    decision: reasons.length ? "blocked" : "allowed",
    source,
    record_id: record ? id : null, // the id that was evaluated, never the one the file claims for itself

    record_path: path,
    reason_code: (record?.reason_code ?? null) as string | null,
    reasons,
    caveats: reasons.length ? [] : caveats,
    evaluated_at,
  };
  if (opts.log !== false) logProvisional(instanceRoot, decision);
  return decision;
}

/** Append one line to `<instance>/provisional/log.jsonl`. Every evaluation is logged, allowed or blocked. */
export function logProvisional(instanceRoot: string, decision: ProvisionalDecision): string | null {
  try {
    const path = safePath(instanceRoot, "provisional/log.jsonl");
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, JSON.stringify({
      at: decision.evaluated_at,
      source: decision.source,
      record_id: decision.record_id,
      record_path: decision.record_path, // the file that was read, so a log line joins back to it

      decision: decision.decision,
      reason_code: decision.reason_code,
      reasons: decision.reasons.map((r) => r.code),
    }) + "\n");
    return path;
  } catch { return null; } // A log that cannot be written never turns a blocked read into an allowed one.
}
