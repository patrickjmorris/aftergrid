// Where a recorded review stands against the digest the Finding's content hashes to now — the one computation
// `aftergrid check` (scripts/lib/validate-finding.mjs) and `aftergrid review status` (src/commands/review.ts)
// both read, so the two commands can never disagree about which reviews are a reason to review again.
//
// Three states, and only one of them is a problem:
//
//   current     — bound to the current digest. Somebody read this content.
//   superseded  — a later review of the same kind exists. History. Re-reviewing on account of one is a wasted
//                 run: `aftergrid review record` dedupes on (kind, reviewer, digest) and writes nothing.
//   stale       — the newest review of its kind, and not at the current digest. That kind is reviewed again,
//                 and the review is never re-pinned to content it did not read.
//
// The distinction is not cosmetic. Citi Bike run 2 (`examples/nyc-open-data/docs/run-log.md`) left three
// round-1 reviews in the manifest behind three current ones; every non-current entry was warned about as
// `stale_review`, the Operator read the pile as "all reviews stale", and run 3 was spent discovering that
// nothing could be recorded. Bead `ag-review-superseded-rsk`.

/** Every kind a review may have. `visual` belongs to `/iterate-visual`; `/analysis-review` dispatches the rest. */
export const REVIEW_KINDS = ["method", "question", "reader", "visual"];

const digestValue = (review) => String(review?.content_digest?.value ?? "");

/**
 * The newest review of each kind: latest `date`, and for equal dates the one recorded later in the manifest.
 *
 * Only this entry decides whether a kind is reviewed at the current content digest. Everything behind it is
 * superseded history.
 */
export function newestByKind(reviews) {
  const newest = new Map();
  for (const r of reviews ?? []) {
    if (!r || !REVIEW_KINDS.includes(r.kind)) continue;
    const held = newest.get(r.kind);
    if (!held || String(r.date ?? "") >= String(held.date ?? "")) newest.set(r.kind, r);
  }
  return newest;
}

/**
 * One entry per recorded review of a known kind, in manifest order:
 * `{ index, kind, review, state, newest, supersededBy }`.
 *
 * `index` is the review's position in `manifest.reviews`, so a caller can report `manifest.yaml#/reviews/<n>`
 * and name the entry it means. `supersededBy` is set only on a `superseded` entry, and is the review that
 * replaced it — the current review of that kind when there is one, otherwise the kind's newest.
 *
 * Reviews of an unknown kind are left out rather than guessed at: a kind this library does not know cannot be
 * judged current, superseded or stale, and a schema error is the report for it.
 */
export function classifyReviews(reviews, currentDigest) {
  const digest = String(currentDigest ?? "");
  const known = (Array.isArray(reviews) ? reviews : [])
    .map((review, index) => ({ index, review }))
    .filter(({ review }) => review && REVIEW_KINDS.includes(review.kind));
  const newest = newestByKind(known.map(({ review }) => review));
  const currentOfKind = new Map();
  for (const { review } of known) {
    if (digestValue(review) === digest && !currentOfKind.has(review.kind)) currentOfKind.set(review.kind, review);
  }

  return known.map(({ index, review }) => {
    const kind = review.kind;
    const entry = { index, kind, review, newest: newest.get(kind), supersededBy: undefined };
    if (digestValue(review) === digest) return { ...entry, state: "current" };
    // A kind is stale only through its newest review, and only when no review of that kind reached the current
    // digest at all. Anything else behind a later entry is history.
    if (newest.get(kind) === review && !currentOfKind.has(kind)) return { ...entry, state: "stale" };
    const current = currentOfKind.get(kind);
    const by = current && current !== review ? current : newest.get(kind);
    return { ...entry, state: "superseded", supersededBy: by === review ? undefined : by };
  });
}

/**
 * The sentence a report gives for one superseded review. It names the review that replaced it and whether that
 * review is itself at the current digest, because "superseded" by a review nobody has redone either is a
 * different fact from "superseded by the review that counts now".
 */
export function supersededMessage(entry, currentDigest) {
  const by = entry.supersededBy;
  if (!by) return `the ${entry.kind} review of ${entry.review?.date ?? "an unrecorded date"} is superseded by a later ${entry.kind} review`;
  const atCurrent = digestValue(by) === String(currentDigest ?? "");
  return `the ${entry.kind} review of ${entry.review?.date ?? "an unrecorded date"} is superseded by the ${entry.kind} review of ${by.date}`
    + (atCurrent
      ? " at the current digest; it is history, not a reason to review again"
      : ", which is itself not at the current digest; that kind's staleness is reported once, against its newest review");
}
