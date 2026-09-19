// `aftergrid review record <dir>` and `aftergrid review status <dir>`.
//
// An agent review completes a draft. It is not approval, and nothing here writes one: `attestations[]` is
// never touched, and readiness is reported `unknown` because this command reads no publication source.
//
// `status` additionally runs the offline artifact check, because the halt decision it prints puts a broken
// execution ahead of every review finding, and a command that printed that decision without looking at the
// evidence would be announcing a conclusion it had not reached.
//
// `status` is the last command of an `/analyze` run, and it answers with an exit code as well as with prose: a
// required kind whose newest review is stale or missing is an **error**, so the command exits 1 and a headless
// harness cannot report a Finding as reviewed over reviews nobody redid. Its counts line
// (`reviews: <n> current, <m> superseded, <k> stale`) separates the two facts an Operator once conflated: a
// review superseded by a later one of the same kind is history, and only a kind whose newest review is bound
// to other content has to be reviewed again.
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
// @ts-ignore: the one per-kind review computation, shared with `aftergrid check` so the two cannot disagree.
import { REVIEW_KINDS as REVIEW_KIND_NAMES, classifyReviews, newestByKind as newestByKindOf, supersededMessage } from "../../scripts/lib/review-currency.mjs";
import { contentDigest } from "../digest.ts";
import { checkArtifact } from "./check.ts";
import { findInstance } from "../instance.ts";
import { emptyReport, type Problem, type Report } from "../report.ts";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

export type ReviewKind = "method" | "question" | "reader" | "visual";
/** The runtime list lives in `scripts/lib/review-currency.mjs`, which `aftergrid check` reads too. */
export const REVIEW_KINDS: ReviewKind[] = REVIEW_KIND_NAMES as ReviewKind[];
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

/**
 * One recorded review's standing against the digest the content hashes to now, as
 * `scripts/lib/review-currency.mjs` computes it. `index` is the entry's position in `manifest.reviews`, so a
 * report can name `manifest.yaml#/reviews/<n>` rather than describe a review it cannot point at.
 */
export type ReviewStanding = {
  index: number;
  kind: ReviewKind;
  review: ReviewEntry;
  state: "current" | "superseded" | "stale";
  /** The newest review of this entry's kind; the entry itself when it is the newest. */
  newest?: ReviewEntry;
  /** Set on a `superseded` entry only: the review that replaced it. */
  supersededBy?: ReviewEntry;
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
 * the manifest survive, because the file is edited as a YAML document rather than reserialized from a plain
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
    summarize(report, [...existing], current.value);
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
    summarize(report, next.reviews, current.value);
    return report;
  }

  // Append, never rewrite: the reviews already recorded keep their own bytes and quoting.
  const node = doc.getIn(["reviews"], true) as { items?: unknown[] } | undefined;
  if (node && Array.isArray(node.items)) doc.addIn(["reviews"], doc.createNode(entry));
  else doc.setIn(["reviews"], doc.createNode(next.reviews));
  writeFileSync(manifestPath, doc.toString({ lineWidth: 0 }));
  report.info.push(`recorded a ${entry.kind} review by ${entry.reviewer}, bound to ${current.value.slice(0, 12)}…`);
  report.info.push("attestations were not touched: an agent review is not approval");
  summarize(report, next.reviews, current.value);
  return report;
}

function summarize(report: Report, reviews: ReviewEntry[], currentDigest: string) {
  // No `checkErrors`: recording a review runs no check, and decideHalt says so rather than implying one passed.
  const decision = decideHalt({ reviews, currentDigest });
  for (const b of decision.blocking) {
    report.warnings.push({ category: "needs_attention", location: `reviews/${b.kind}`, message: `${b.reviewer} recorded ${b.items.length} blocking finding(s): ${b.items.join(" | ")}` });
  }
  report.info.push(countsLine(reviews, currentDigest, decision));
  report.info.push(verdictLine(decision));
}

/**
 * The one line a headless harness reads instead of counting entries itself: `reviews: <n> current,
 * <m> superseded, <k> stale`. Three different facts, and the middle one is not a problem — a review superseded
 * by a later one of the same kind at the current digest is history (Citi Bike run 3,
 * `examples/nyc-open-data/docs/run-log.md`: an Operator read a trio of superseded reviews as "all reviews
 * stale" and spent a run redoing reviews that were already current).
 */
export function countsLine(reviews: ReviewEntry[], currentDigest: string, decision: HaltDecision): string {
  const current = (reviews ?? []).filter((r) => r.content_digest?.value === currentDigest).length;
  return `reviews: ${current} current, ${decision.superseded.length} superseded, ${decision.stale.length} stale`;
}

/** The line `/analyze` quotes verbatim in its final report, instead of retelling what the reviewers said. */
export function verdictLine(decision: HaltDecision): string {
  return `verdict: ${decision.next} (${decision.reason})`;
}

/* ------------------------------------------------------------------ the halt decision */

export type HaltDecision = {
  next: "continue" | "halt";
  /** The state `/analyze` leaves the Finding directory in. */
  state: "complete" | "needs_attention";
  reason: string;
  blocking: { kind: ReviewKind; reviewer: string; items: string[] }[];
  /**
   * Kinds that have been reviewed and have no review bound to the current digest — their **newest** review
   * reviewed other content, and `reviewer` names whoever wrote it. That kind has to be reviewed again; the
   * review is never re-pinned to content it did not read.
   */
  stale: { kind: ReviewKind; reviewer: string }[];
  /**
   * Reviews behind a later review of the same kind. History, not staleness: the kind's newest review is the
   * one that counts, and a superseded entry is no reason to review anything again.
   */
  superseded: { kind: ReviewKind; reviewer: string }[];
  /** Required kinds with no review bound to the current digest. */
  missing_kinds: ReviewKind[];
  /**
   * Every recorded review with its index and its standing, so a report can name the entry it means
   * (`manifest.yaml#/reviews/<n>`) instead of describing a review the reader has to go and find.
   */
  standing: ReviewStanding[];
};

/**
 * The newest review of each kind: latest `date`, and for equal dates the one recorded later in the manifest.
 *
 * Only this entry decides whether a kind is reviewed at the current content digest. Everything behind it is
 * superseded history. The implementation is `scripts/lib/review-currency.mjs`, imported here rather than
 * written twice: `aftergrid check` reads the same module, so a review this command calls superseded is never
 * warned about as stale by the other (bead `ag-review-superseded-rsk`).
 */
export function newestByKind(reviews: ReviewEntry[]): Map<ReviewKind, ReviewEntry> {
  return newestByKindOf(reviews) as Map<ReviewKind, ReviewEntry>;
}

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
  const all = input.reviews ?? [];
  const current = all.filter((r) => r.content_digest?.value === input.currentDigest);
  // Staleness is judged per kind: a kind is stale when it has been reviewed and none of its reviews is bound
  // to the current digest, and the review to redo is that kind's newest. Everything else a kind carries is
  // superseded history, and re-reviewing on account of one is a wasted run. The split is computed by
  // `scripts/lib/review-currency.mjs`, the same module `aftergrid check` reads.
  const classified = classifyReviews(all, input.currentDigest) as ReviewStanding[];
  const stale = classified.filter((e) => e.state === "stale").map((e) => ({ kind: e.kind, reviewer: e.review.reviewer }));
  const superseded = classified.filter((e) => e.state === "superseded").map((e) => ({ kind: e.kind, reviewer: e.review.reviewer }));
  const blocking = current
    .filter((r) => (r.blocking ?? []).length)
    .map((r) => ({ kind: r.kind, reviewer: r.reviewer, items: r.blocking }));
  const missing_kinds = REQUIRED_REVIEW_KINDS.filter((k) => !current.some((r) => r.kind === k));
  const base = { blocking, stale, superseded, missing_kinds, standing: classified };

  const errors = input.checkErrors;
  if (errors?.length) {
    return { ...base, next: "halt", state: "needs_attention", reason: `check reported ${errors.length} error(s), starting with ${errors[0]!.category} at ${errors[0]!.location}: a broken execution is not an analytical result` };
  }
  if (blocking.length) {
    const total = blocking.reduce((n, b) => n + b.items.length, 0);
    return { ...base, next: "halt", state: "needs_attention", reason: `${total} blocking finding(s) from ${blocking.map((b) => b.kind).join(", ")}` };
  }
  if (missing_kinds.length) {
    return { ...base, next: "halt", state: "needs_attention", reason: `no current review of kind ${missing_kinds.join(", ")}${stale.length ? ` (${stale.length} kind(s) reviewed only at older content, which must be reviewed again rather than re-pinned)` : ""}` };
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
 * Exits non-zero (1, the code for "errors found") when any required kind's newest review is stale or missing,
 * and prints the counts line first so the one fact a headless harness needs is the first note it reads.
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
  report.decision = { next: "halt", state: "needs_attention", reason: "nothing was read", blocking: [], stale: [], superseded: [], missing_kinds: [...REQUIRED_REVIEW_KINDS], standing: [] };
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
    // `stale_review` is dropped, not lost: this command reports staleness itself, per kind and as an error, and
    // repeating the validator's per-entry warning beside it is the double report that made a manifest with
    // three current reviews look like six problems (Citi Bike run 2, `examples/nyc-open-data/docs/run-log.md`).
    for (const w of artifact.warnings) if (w.category !== "incomplete" && w.category !== "stale_review") report.warnings.push(w);
    report.info.push(checkErrors.length
      ? `the artifact check reported ${checkErrors.length} error(s); it executed no SQL, so \`aftergrid check --mode rerun\` is still the last word on whether the Checks run`
      : "the artifact check reported no errors; it executed no SQL, so a rerun mismatch would not be visible here");
  } else {
    report.warnings.push({ category: "missing_file", location: dir, message: "no aftergrid.yaml above this directory, so the artifact could not be validated here", remedy: "run review status on a Finding inside its Instance" });
    report.info.push("the evidence was not validated: this directory is not inside an Instance");
  }

  const reviews: ReviewEntry[] = Array.isArray(manifest?.reviews) ? manifest.reviews : [];
  const decision = decideHalt({ reviews, currentDigest, checkErrors });
  report.decision = decision;
  for (const b of decision.blocking) report.warnings.push({ category: "needs_attention", location: `reviews/${b.kind}`, message: `${b.reviewer}: ${b.items.join(" | ")}` });

  // An edit after a review is an error, not a note. Before this, a headless run could read "halt" in a note,
  // exit 0, and report the Finding as reviewed at the digest a reviewer had never seen (the gap Citi Bike runs
  // 2 and 3 walked into, `examples/nyc-open-data/docs/run-log.md`). The exit code now carries it:
  // `docs/contracts/analysis-directory.md` documents 1 for a stale or missing review of a required kind.
  for (const s of decision.stale) {
    report.errors.push({
      category: "stale_review", location: `reviews/${s.kind}`,
      message: `the newest ${s.kind} review (${s.reviewer}) is bound to other content, so this Finding is not reviewed at the digest it now carries`,
      remedy: `run the ${s.kind} review again against the Finding as it is and record it; never re-pin a review to content it did not read`,
    });
  }
  for (const kind of decision.missing_kinds.filter((k) => !decision.stale.some((s) => s.kind === k))) {
    report.errors.push({
      category: "incomplete", location: `reviews/${kind}`,
      message: `no ${kind} review is recorded at the current content digest`,
      remedy: `run /analysis-review and record the ${kind} review with \`aftergrid review record\``,
    });
  }
  // A superseded review is history. It is reported as neither an error nor a warning: saying so is what stops
  // the next Operator from ordering a re-review that `review record` would dedupe away and write nothing for.
  // The wording is the validator's, from the same module, so `check` and `review status` say the same thing.
  for (const s of decision.standing) {
    if (s.state !== "superseded") continue;
    report.info.push(`review_superseded: manifest.yaml#/reviews/${s.index} — ${supersededMessage(s, currentDigest)} (recorded by ${s.review.reviewer})`);
  }
  report.info.unshift(countsLine(reviews, currentDigest, decision), verdictLine(decision));
  return report;
}
