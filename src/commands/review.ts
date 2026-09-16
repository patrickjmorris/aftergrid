// `aftergrid review record <dir>` and `aftergrid review status <dir>`.
//
// An agent review completes a draft. It is not approval, and nothing here writes one: `attestations[]` is
// never touched, and readiness is reported `unknown` because this command reads no publication source.
//
// `status` additionally runs the offline artifact check, because the halt decision it prints puts a broken
// execution ahead of every review finding, and a command that printed that decision without looking at the
// evidence would be announcing a conclusion it had not reached.
//
// A review binds to a content digest. Recording one against a Finding whose files no longer hash to the digest
// its manifest pins would produce a review of something nobody reviewed, so that is refused rather than
// recorded — the review would look current and be false.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";
// @ts-ignore: shared ESM validation library (schema shape only; the full walk is `aftergrid check`).
import { schemaErrors } from "../../scripts/lib/validate-finding.mjs";
// @ts-ignore: shared path containment.
import { safePath, ContractError } from "../../scripts/fixture-safety.mjs";
import { contentDigest } from "../digest.ts";
import { checkArtifact } from "./check.ts";
import { findInstance } from "../instance.ts";
import { emptyReport, type Problem, type Report } from "../report.ts";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

export type ReviewKind = "method" | "question" | "reader" | "visual";
export const REVIEW_KINDS: ReviewKind[] = ["method", "question", "reader", "visual"];
/** The kinds `/analysis-review` dispatches; `visual` belongs to `/iterate-visual` and is not required here. */
export const REQUIRED_REVIEW_KINDS: ReviewKind[] = ["method", "question", "reader"];

export type ReviewEntry = {
  kind: ReviewKind;
  reviewer: string;
  date: string;
  content_digest: { algorithm: "sha256"; value: string };
  profile?: string;
  blocking: string[];
  non_blocking: string[];
};

export type RecordReviewOptions = {
  dir: string;
  kind: ReviewKind;
  reviewer: string;
  blocking?: string[];
  nonBlocking?: string[];
  /** Reader reviews name the profile they adopted. */
  profile?: string;
  /** yyyy-mm-dd; defaults to today in UTC. */
  date?: string;
  dryRun?: boolean;
  now?: () => Date;
};

/**
 * Append one review to `manifest.yaml`, bound to the digest the files currently hash to.
 *
 * Idempotent: recording the same kind, reviewer and digest twice leaves one entry. Comments and formatting in
 * the manifest survive, because the file is edited as a YAML document rather than reserialised from a plain
 * object.
 */
export function recordReview(opts: RecordReviewOptions): Report {
  const report = emptyReport("review");
  report.readiness = "unknown";
  report.readiness_reasons.push("recording an agent review reads no publication source; `aftergrid check` decides readiness, and a human APPROVED review decides approval");
  const err = (category: Problem["category"], location: string, message: string, remedy?: string) => report.errors.push({ category, location, message, remedy });

  const dir = resolve(opts.dir);
  if (!existsSync(dir)) { err("missing_file", dir, "no such directory", "pass a Finding directory"); report.syntax = "invalid"; return report; }
  if (!REVIEW_KINDS.includes(opts.kind)) { err("syntax", "--kind", `'${opts.kind}' is not a review kind`, `use one of: ${REVIEW_KINDS.join(", ")}`); report.syntax = "invalid"; return report; }
  if (!opts.reviewer?.trim()) { err("incomplete", "--reviewer", "a review records who did it", "pass --reviewer 'agent:<model id>'; a review with no reviewer is not a review"); return report; }

  let manifestPath: string;
  try { manifestPath = safePath(dir, "manifest.yaml"); }
  catch (e) { err((e as ContractError & { category: Problem["category"] }).category ?? "unsafe_path", "manifest.yaml", (e as Error).message); report.syntax = "invalid"; return report; }
  if (!existsSync(manifestPath)) { err("missing_file", manifestPath, "manifest.yaml not found", "pass a Finding directory"); report.syntax = "invalid"; return report; }

  let doc;
  try { doc = parseDocument(readFileSync(manifestPath, "utf8")); if (doc.errors.length) throw new Error(doc.errors[0]!.message); }
  catch (e) { err("syntax", "manifest.yaml", (e as Error).message, "fix the YAML; nothing was changed"); report.syntax = "invalid"; return report; }
  const manifest = doc.toJS() as any;

  report.finding = `${manifest?.finding?.id ?? "?"} r${manifest?.finding?.revision ?? "?"}`;
  report.state = manifest?.finding?.state;
  report.outcome = manifest?.finding?.outcome;
  report.content = manifest?.finding?.state === "complete" ? "complete" : "incomplete";

  let current: { algorithm: "sha256"; value: string };
  try { current = contentDigest(manifest, dir); }
  catch (e) {
    err((e as ContractError & { category: Problem["category"] }).category ?? "invalid_artifact", "manifest.yaml", `the digest could not be computed: ${(e as Error).message}`, "every file the manifest names must exist and be readable before a review can bind to it");
    return report;
  }
  const pinned = manifest?.content_digest?.value;
  if (pinned !== current.value) {
    err("digest", "manifest.yaml#/content_digest",
      `the pinned digest (${String(pinned).slice(0, 12)}…) is not what the files hash to (${current.value.slice(0, 12)}…), so a review recorded now would claim to have reviewed content nobody reviewed`,
      "re-pin the Finding's digest against the files as they are, then record the review again");
    return report;
  }

  const date = opts.date ?? (opts.now ?? (() => new Date()))().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { err("syntax", "--date", `'${date}' is not a yyyy-mm-dd date`); return report; }

  const entry: ReviewEntry = {
    kind: opts.kind,
    reviewer: opts.reviewer.trim(),
    date,
    content_digest: current,
    ...(opts.profile ? { profile: opts.profile } : {}),
    blocking: (opts.blocking ?? []).map((s) => s.trim()).filter(Boolean),
    non_blocking: (opts.nonBlocking ?? []).map((s) => s.trim()).filter(Boolean),
  };

  const existing: ReviewEntry[] = Array.isArray(manifest.reviews) ? manifest.reviews : [];
  const already = existing.some((r) => r.kind === entry.kind && r.reviewer === entry.reviewer && r.content_digest?.value === entry.content_digest.value);
  if (already) {
    report.info.push(`a ${entry.kind} review by ${entry.reviewer} is already recorded against this digest; nothing was written`);
    summarise(report, [...existing], current.value);
    return report;
  }

  const next = { ...manifest, reviews: [...existing, entry] };
  const problems = schemaErrors(next, REPO_ROOT) as Problem[];
  if (problems.length) {
    for (const p of problems) report.errors.push(p);
    err("schema", "manifest.yaml#/reviews", "the review as given does not fit the manifest schema, so nothing was written", "fix the reported field and record the review again");
    return report;
  }

  if (opts.dryRun) {
    report.info.push(`dry run: would append a ${entry.kind} review by ${entry.reviewer} bound to ${current.value.slice(0, 12)}…; nothing was written`);
    summarise(report, next.reviews, current.value);
    return report;
  }

  // Append, never rewrite: the reviews already recorded keep their own bytes and quoting.
  const node = doc.getIn(["reviews"], true) as { items?: unknown[] } | undefined;
  if (node && Array.isArray(node.items)) doc.addIn(["reviews"], doc.createNode(entry));
  else doc.setIn(["reviews"], doc.createNode(next.reviews));
  writeFileSync(manifestPath, doc.toString({ lineWidth: 0 }));
  report.info.push(`recorded a ${entry.kind} review by ${entry.reviewer}, bound to ${current.value.slice(0, 12)}…`);
  report.info.push("attestations were not touched: an agent review is not approval");
  summarise(report, next.reviews, current.value);
  return report;
}

function summarise(report: Report, reviews: ReviewEntry[], currentDigest: string) {
  // No `checkErrors`: recording a review runs no check, and decideHalt says so rather than implying one passed.
  const decision = decideHalt({ reviews, currentDigest });
  for (const b of decision.blocking) {
    report.warnings.push({ category: "needs_attention", location: `reviews/${b.kind}`, message: `${b.reviewer} recorded ${b.items.length} blocking finding(s): ${b.items.join(" | ")}` });
  }
  report.info.push(`review status: ${decision.next} (${decision.reason})`);
}

/* ------------------------------------------------------------------ the halt decision */

export type HaltDecision = {
  next: "continue" | "halt";
  /** The state `/analyze` leaves the Finding directory in. */
  state: "complete" | "needs_attention";
  reason: string;
  blocking: { kind: ReviewKind; reviewer: string; items: string[] }[];
  /** Reviews recorded against some other digest: they reviewed different content. */
  stale: { kind: ReviewKind; reviewer: string }[];
  /** Required kinds with no review bound to the current digest. */
  missing_kinds: ReviewKind[];
};

/**
 * Whether `/analyze` continues or halts after `/analysis-review`, decided from recorded facts only.
 *
 * Halts, in the order they are reported: a `check` error (broken execution), any blocking review finding, or a
 * required review kind with nothing bound to the current digest. Nothing here reads a Finding's outcome:
 * `insufficient_data` with clean reviews continues, because too little evidence is an answer and a failed
 * execution is not.
 *
 * `checkErrors` is three-valued on purpose. An empty array means a check ran and found nothing, and only then
 * does the continue reason call the draft evidence-valid. `undefined` means no check ran here, and the reason
 * says so instead of asserting a validity nobody established.
 */
export function decideHalt(input: { reviews: ReviewEntry[]; currentDigest: string; checkErrors?: Problem[] }): HaltDecision {
  const current = (input.reviews ?? []).filter((r) => r.content_digest?.value === input.currentDigest);
  const stale = (input.reviews ?? []).filter((r) => r.content_digest?.value !== input.currentDigest).map((r) => ({ kind: r.kind, reviewer: r.reviewer }));
  const blocking = current
    .filter((r) => (r.blocking ?? []).length)
    .map((r) => ({ kind: r.kind, reviewer: r.reviewer, items: r.blocking }));
  const missing_kinds = REQUIRED_REVIEW_KINDS.filter((k) => !current.some((r) => r.kind === k));
  const base = { blocking, stale, missing_kinds };

  const errors = input.checkErrors;
  if (errors?.length) {
    return { ...base, next: "halt", state: "needs_attention", reason: `check reported ${errors.length} error(s), starting with ${errors[0]!.category} at ${errors[0]!.location}: a broken execution is not an analytical result` };
  }
  if (blocking.length) {
    const total = blocking.reduce((n, b) => n + b.items.length, 0);
    return { ...base, next: "halt", state: "needs_attention", reason: `${total} blocking finding(s) from ${blocking.map((b) => b.kind).join(", ")}` };
  }
  if (missing_kinds.length) {
    return { ...base, next: "halt", state: "needs_attention", reason: `no current review of kind ${missing_kinds.join(", ")}${stale.length ? ` (${stale.length} review(s) bound to older content)` : ""}` };
  }
  return {
    ...base,
    next: "continue",
    state: "complete",
    reason: errors
      ? "evidence-valid draft reviewed by agents, awaiting human publication readiness"
      : "reviewed by agents with no blocking findings; no check ran here, so evidence validity is unjudged and publication readiness is still a human's",
  };
}

export type ReviewStatusReport = Report & { decision: HaltDecision };

/**
 * Read-only: what is recorded, what is stale, and whether `/analyze` continues. Writes nothing.
 *
 * It runs `checkArtifact` itself — the offline half of `aftergrid check`, which executes no SQL and reads no
 * publication source — because the decision it prints is a halt decision, and the first halt is a broken
 * execution. Without that the command could only see reviews, and would answer "continue, evidence-valid
 * draft" on a Finding whose evidence it had never looked at.
 */
export function reviewStatus(opts: { dir: string; checkImpl?: (o: { dir: string }) => Report }): ReviewStatusReport {
  const report = emptyReport("review") as ReviewStatusReport;
  report.readiness = "unknown";
  report.readiness_reasons.push("review status validates the artifact but reads no publication source; `aftergrid check` decides readiness and a human APPROVED review decides approval");
  report.decision = { next: "halt", state: "needs_attention", reason: "nothing was read", blocking: [], stale: [], missing_kinds: [...REQUIRED_REVIEW_KINDS] };
  const dir = resolve(opts.dir);
  const manifestPath = resolve(dir, "manifest.yaml");
  if (!existsSync(manifestPath)) {
    report.errors.push({ category: "missing_file", location: manifestPath, message: "manifest.yaml not found", remedy: "pass a Finding directory" });
    report.syntax = "invalid";
    return report;
  }
  let manifest: any;
  try { manifest = parseDocument(readFileSync(manifestPath, "utf8")).toJS(); }
  catch (e) { report.errors.push({ category: "syntax", location: "manifest.yaml", message: (e as Error).message }); report.syntax = "invalid"; return report; }
  report.finding = `${manifest?.finding?.id ?? "?"} r${manifest?.finding?.revision ?? "?"}`;
  report.state = manifest?.finding?.state;
  report.outcome = manifest?.finding?.outcome;
  report.content = manifest?.finding?.state === "complete" ? "complete" : "incomplete";

  let currentDigest = String(manifest?.content_digest?.value ?? "");
  try {
    const recomputed = contentDigest(manifest, dir);
    if (recomputed.value !== currentDigest) {
      report.warnings.push({ category: "digest", location: "manifest.yaml#/content_digest", message: `the pinned digest is not what the files hash to; every recorded review is stale until it is re-pinned` });
      currentDigest = recomputed.value;
    }
  } catch (e) {
    report.warnings.push({ category: "invalid_artifact", location: "manifest.yaml", message: `the digest could not be recomputed (${(e as Error).message}); review staleness is judged against the pinned value` });
  }

  // A Finding outside an Instance cannot be validated at all (there is no definition library or Decision set to
  // validate it against). That is a missing check, not a broken Finding, so `checkErrors` stays undefined and
  // the halt decision says the evidence is unjudged rather than inventing either verdict.
  let checkErrors: Problem[] | undefined;
  if (opts.checkImpl || findInstance(dir)) {
    const artifact = (opts.checkImpl ?? checkArtifact)({ dir });
    checkErrors = artifact.errors;
    report.evidence = artifact.evidence;
    report.sql_execution = "not_performed";
    for (const e of checkErrors) report.errors.push(e);
    for (const w of artifact.warnings) if (w.category !== "incomplete") report.warnings.push(w);
    report.info.push(checkErrors.length
      ? `the artifact check reported ${checkErrors.length} error(s); it executed no SQL, so \`aftergrid check --mode rerun\` is still the last word on whether the Checks run`
      : "the artifact check reported no errors; it executed no SQL, so a rerun mismatch would not be visible here");
  } else {
    report.warnings.push({ category: "missing_file", location: dir, message: "no aftergrid.yaml above this directory, so the artifact could not be validated here", remedy: "run review status on a Finding inside its Instance" });
    report.info.push("the evidence was not validated: this directory is not inside an Instance");
  }

  const reviews: ReviewEntry[] = Array.isArray(manifest?.reviews) ? manifest.reviews : [];
  report.decision = decideHalt({ reviews, currentDigest, checkErrors });
  for (const b of report.decision.blocking) report.warnings.push({ category: "needs_attention", location: `reviews/${b.kind}`, message: `${b.reviewer}: ${b.items.join(" | ")}` });
  for (const s of report.decision.stale) report.warnings.push({ category: "stale_review", location: `reviews/${s.kind}`, message: `${s.reviewer} reviewed a different digest; redo this review or re-pin` });
  report.info.push(`${reviews.length} review(s) recorded; ${report.decision.next} (${report.decision.reason})`);
  return report;
}
