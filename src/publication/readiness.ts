// Publication readiness: the one place that decides whether a Finding has a verified human approval.
// It answers with ready, not_ready or unknown, and it never answers ready from anything the Finding itself
// carries. The manifest supplies a pointer (repository, pull request, review id, commit sha); the allowlist comes
// from trusted Instance policy; the decision comes from the GitHub API. Contract: docs/contracts/publication.md.
import { resolve } from "node:path";
import type { Problem } from "../report.ts";
// @ts-ignore: shared ESM validation library; the digest has exactly one implementation.
import { digestOf } from "../../scripts/lib/validate-finding.mjs";
import { readPublicationPolicy, type PublicationPolicy } from "./policy.ts";
import { errorClassOf, type GitHubClient, type Review } from "./github.ts";

export type VerifiedApproval = {
  /** Index of the attestation in `manifest.attestations`. */
  attestation: number;
  review_id: number;
  /** The login the API returned, not the manifest's display `attester`. */
  login: string;
  commit_sha: string;
};

export type ReadinessAssessment = {
  readiness: "ready" | "not_ready" | "unknown";
  /** One human sentence per attestation, plus the state of the policy. Safe to print verbatim. */
  reasons: string[];
  verified: VerifiedApproval[];
  /** Defects in the Finding's own attestations: stale, untrusted, or an impossible author/approver split. */
  errors: Problem[];
  /** `policy_untrusted`: the Instance cannot verify publication. A draft is still perfectly valid. */
  warnings: Problem[];
};

export type ReadinessOptions = {
  dir: string;
  manifest: any;
  instanceRoot?: string;
  /** Omitted or null when no token is configured: readiness is then unknown, never ready. */
  github?: GitHubClient | null;
  now?: Date;
};

const short = (v: unknown) => (typeof v === "string" ? v.slice(0, 12) + "…" : String(v));
const eq = (a: string | undefined, b: string | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const at = (r: Review) => { const t = Date.parse(r.submitted_at); return Number.isNaN(t) ? null : t; };
const SKEW_MS = 60_000;

/**
 * Assess one Finding's publication readiness.
 *
 * ready requires all of: the Instance policy is trustworthy; a `publication_approval` attestation whose
 * `content_digest` equals the digest recomputed from the directory right now; source type `github_pr_review`
 * naming the Instance's repository; a review with that id that is APPROVED, not dismissed and not superseded by a
 * later CHANGES_REQUESTED or dismissal from a trusted approver; `review.commit_id` equal to `source.commit_sha`
 * and to the pull request's head sha; an approver on `trusted_approvers`; and a pull request opened by the
 * Instance's `automation_login`, who is neither the approver nor a trusted approver.
 *
 * Any read that could not be completed (no client, no token, network, HTTP, malformed body) yields unknown.
 * Anything definitely wrong yields not_ready with a problem. Nothing here ever yields ready by default.
 */
export async function assessReadiness(opts: ReadinessOptions): Promise<ReadinessAssessment> {
  const dir = resolve(opts.dir);
  const manifest = opts.manifest;
  const now = (opts.now ?? new Date()).getTime();
  const reasons: string[] = [];
  const errors: Problem[] = [];
  const warnings: Problem[] = [];
  const verified: VerifiedApproval[] = [];
  let unreadable = false; // Something could not be read; the honest answer is unknown.

  // A Finding that is not complete is never ready, whatever its attestations say.
  const incomplete = manifest?.finding?.state !== "complete";
  if (incomplete) reasons.push("not complete");

  const attestations: any[] = Array.isArray(manifest?.attestations) ? manifest.attestations : [];
  const approvals = attestations.map((a, index) => ({ a, index })).filter(({ a }) => a?.kind === "publication_approval");
  if (approvals.length === 0) reasons.push("no publication_approval attestation");

  const { policy, problems: policyProblems } = readPublicationPolicy(dir, opts.instanceRoot);
  // An Instance that cannot verify publication is not a defect in this Finding: it is a warning plus not_ready.
  warnings.push(...policyProblems);
  for (const p of policyProblems) reasons.push(`Instance policy: ${p.message}`);
  if (!policy) return { readiness: "not_ready", reasons, verified, errors, warnings };

  let digest: string;
  try { digest = digestOf(manifest, dir).value; }
  catch (e) {
    errors.push({ category: "invalid_artifact", location: "manifest.yaml", message: `the content digest could not be recomputed: ${(e as Error).message}`, remedy: "fix the Finding directory; readiness is never assessed against an unreadable one" });
    reasons.push("the current content digest could not be recomputed, so no approval can be bound to it");
    return { readiness: "not_ready", reasons, verified, errors, warnings };
  }

  for (const { a, index } of approvals) {
    const label = `attestation ${index}`;
    const location = `manifest.yaml#/attestations/${index}`;
    const reject = (category: Problem["category"], message: string, remedy: string) => {
      errors.push({ category, location, message, remedy });
      reasons.push(`${label}: ${message}`);
    };

    if (a?.content_digest?.value !== digest) {
      reject("stale_attestation", `the approval binds content digest ${short(a?.content_digest?.value)} but the Finding's current content digest is ${short(digest)}`, "the Finding changed after it was approved; publish a new revision and have that revision approved");
      continue;
    }
    const source = a.source ?? {};
    if (source.type !== "github_pr_review") {
      // An unverified_note is kept on purpose so an informal "looks good" is visible and visibly not an approval.
      reasons.push(`${label}: source ${JSON.stringify(source.type ?? null)} carries no verifiable identity, so it is a note and never an approval`);
      continue;
    }
    if (!eq(source.repository, policy.repository)) {
      reject("untrusted_attestation", `the approval names repository ${source.repository}, but the Instance policy trusts approvals only in ${policy.repository}`, `open the Finding pull request in ${policy.repository}, or change the Instance policy through its own review`);
      continue;
    }
    const where = `${source.repository}#${source.pull_request}`;
    if (!opts.github) {
      unreadable = true;
      reasons.push(`${label}: the GitHub review on ${where} was not read (no API client or token configured), so readiness is unknown, not approved`);
      continue;
    }

    let pull, reviews: Review[];
    try {
      pull = await opts.github.getPullRequest(source.repository, source.pull_request);
      reviews = await opts.github.listReviews(source.repository, source.pull_request);
    } catch (e) {
      unreadable = true;
      reasons.push(`${label}: GitHub could not be read for ${where} (${errorClassOf(e)}: ${(e as Error).message}); readiness is unknown, never approved`);
      continue;
    }

    const review = reviews.find((r) => r.id === source.review_id);
    if (!review) {
      reject("untrusted_attestation", `${where} has no review ${source.review_id}`, "record the review id the API reports, or remove the attestation");
      continue;
    }
    if (review.state !== "APPROVED") {
      reject("untrusted_attestation", `review ${review.id} on ${where} is ${review.state}, not APPROVED`, review.state === "DISMISSED" ? "the approval was dismissed; ask for a new review on the current commit" : "ask for an approving review on the analyzed commit");
      continue;
    }
    if (review.commit_id !== source.commit_sha) {
      reject("untrusted_attestation", `review ${review.id} was submitted on commit ${short(review.commit_id)} but the attestation claims ${short(source.commit_sha)}`, "an approval counts only for the commit it was given on");
      continue;
    }
    if (pull.head_sha !== source.commit_sha) {
      reject("stale_attestation", `${where} now has head ${short(pull.head_sha)}; the approval is at ${short(source.commit_sha)}, which is no longer the analyzed commit`, "push nothing further, or ask for a new review at the new head");
      continue;
    }
    const submitted = at(review);
    if (submitted === null) {
      reject("untrusted_attestation", `review ${review.id} has no readable submitted_at timestamp`, "an approval with no time cannot be ordered against dismissals");
      continue;
    }
    if (submitted > now + SKEW_MS) {
      reject("untrusted_attestation", `review ${review.id} claims to have been submitted in the future (${review.submitted_at})`, "the clock or the source is wrong; this is never treated as a current approval");
      continue;
    }
    // Dismissed or replaced: by the same reviewer, and — more conservatively than GitHub's own merge rules — by
    // any trusted approver whose later objection they have not themselves withdrawn with a newer APPROVED.
    const objections = reviews.filter((r) => {
      if (r.id === review.id) return false;
      if (r.state !== "CHANGES_REQUESTED" && r.state !== "DISMISSED") return false;
      const t = at(r);
      if (t === null || t <= submitted) return false;
      if (eq(r.user_login, review.user_login)) return true;
      if (!policy.trustedApprovers.includes(r.user_login.toLowerCase())) return false;
      // A trusted approver who later approved again has withdrawn their own objection.
      return !reviews.some((later) => eq(later.user_login, r.user_login) && later.state === "APPROVED" && (at(later) ?? -1) > t);
    });
    if (objections.length) {
      const o = objections[0]!;
      reject("untrusted_attestation", `review ${review.id} was superseded: ${o.user_login} left ${o.state} at ${o.submitted_at}`, "resolve the objection and have the Finding approved again");
      continue;
    }
    if (!policy.trustedApprovers.includes(review.user_login.toLowerCase())) {
      reject("untrusted_attestation", `${review.user_login} approved ${where} but is not on the Instance trusted_approvers allowlist`, `add the login to trusted_approvers in ${policy.path} through that file's own review, or have a trusted approver review the Finding`);
      continue;
    }
    if (eq(pull.user_login, review.user_login)) {
      reject("solo_setup_invalid", `${pull.user_login} both opened ${where} and approved it; GitHub does not let the author of a pull request approve it, so a single account cannot be both identities`, "open the Finding pull request from a separate automation account and have the human approve it; there is no bypass");
      continue;
    }
    if (policy.trustedApprovers.includes(pull.user_login.toLowerCase())) {
      reject("solo_setup_invalid", `${where} was opened by ${pull.user_login}, who is a trusted approver; the author of a pull request cannot approve it, so this identity split cannot work`, "open the Finding pull request from the automation account named in the Instance policy; there is no bypass");
      continue;
    }
    if (!eq(pull.user_login, policy.automationLogin)) {
      reject("untrusted_attestation", `${where} was opened by ${pull.user_login}, but the Instance policy expects the automation identity ${policy.automationLogin}`, "open Finding pull requests from the configured automation account, or change the Instance policy through its own review");
      continue;
    }

    verified.push({ attestation: index, review_id: review.id, login: review.user_login, commit_sha: source.commit_sha });
    reasons.push(`${label}: verified APPROVED review ${review.id} by ${review.user_login} on ${where} at commit ${short(source.commit_sha)} (pull request opened by ${pull.user_login}, state ${pull.state}, merged ${pull.merged})`);
    if (a.attester && !eq(a.attester, review.user_login)) {
      reasons.push(`${label}: the manifest's display attester '${a.attester}' is not the verified login '${review.user_login}'; the verified login is what counts`);
    }
  }

  const readiness: ReadinessAssessment["readiness"] =
    incomplete || errors.length ? "not_ready" : verified.length ? "ready" : unreadable ? "unknown" : "not_ready";
  return { readiness, reasons, verified, errors, warnings };
}
