# analysis-review

Challenge an analysis, notebook, chart, or memo for calculation errors, unsupported conclusions, question drift, and reader misinterpretation. Review evidence adversarially without inventing objections.

## Portable use

Review the artifact supplied: SQL and results, notebook, chart, memo, or an Engine Finding. Do not require a manifest or CLI for ordinary work. For a Finding, preserve [the Engine review procedure](../../skills/analysis-review/references/engine-workflow.md), including current content digests and separate human publication approval.


Use the skill with the artifact or question you already have. It does not install the CLI, configure GitHub, or create an Instance unless you request Engine artifacts. The existing invocation policy is preserved.

## Engine Finding reference

The following documentation describes the optional Engine route, which retains its existing checks and approval requirements.


## What it does

Reviews a complete Finding with three reviewers that judge different things and cannot see each other's work:
**Method** (statistical hygiene, whether the design earns the Claim type, denominators and baselines, whether
the Checks match the Claims), **Question** (whether this answers the Question that was asked, whether the
pre-registered comparison was honoured, whether the outcome is honest) and **Reader** (adopting the Finding's
named Reader profile, judging understand / inspect / continue and every misreading the profile says that person
makes).

Each returns two lists: `blocking` and `non_blocking`. The skill records one review per reviewer into
`manifest.yaml` through `aftergrid review record`, bound to the content digest the Finding's files currently
hash to. Editing the Finding afterwards changes that digest, and the reviews become visibly stale rather than
silently wrong. Reviewing it again does not: the earlier review of that kind becomes **superseded** history,
which is not staleness and is nobody's work.

It is **model-invoked** (`user-invocable: false`, `policy.allow_implicit_invocation: true`). `/analyze` reaches
for it between shaping the narrative and running `aftergrid check`.

## When to reach for it

- A Finding draft is written and shaped, and you want it judged before `aftergrid check`.
- A revision changed the Finding and `aftergrid review status` says the recorded reviews are bound to older
  content.
- You want to know whether anything blocks, separately from whether the evidence validates.

Not for: fixing what it finds (that is `/revise-finding` or a new Analysis), approving a Finding (that is a
human APPROVED review on the pull request), or reviewing a Finding whose `aftergrid check` reports errors — a
broken execution is sent back before three reviewers spend time on it.

## Common questions

**Does a blocking finding mean the Analysis was wrong?** No. It means a Reader acting on the Finding as it
stands would be misled. The fix is often a sentence, a denominator or a caveat moved next to the Answer.

**What about an insufficient-data Finding?** It is reviewed exactly like any other. "We cannot tell yet" is a
finished Analysis, and the reviewers judge whether it says so honestly, names what is missing and resists
recommending an action anyway. What is *not* reviewed is a Finding whose Checks errored: that is a run that did
not happen, and the skill stops at step 2 and reports `needs_attention`.

**Why three separate subagents instead of one reviewer with three lists?** Because a single reviewer trades the
three off against each other, and the one that loses is usually the Reader. They are dispatched in one message
so they run in parallel and none of them sees the others' findings.

**Can it approve a Finding?** No, and it says so. `aftergrid review record` never writes an attestation, and
the report says "reviewed by three agent reviewers" rather than approved, verified or cleared. Publication
readiness stays whatever `aftergrid check` reports, including `unknown`.

**`review status` says 3 superseded — do I redo those reviews?** No. Superseded and stale are different facts.
A **superseded** review is one a later review of the same kind replaced: history, reported as
`review_superseded` info, and redoing it writes nothing because `aftergrid review record` dedupes on (kind,
reviewer, digest). A **stale** review is a kind whose *newest* review is bound to older content: that kind has
not been reviewed as the Finding now stands, and it is the only one to redo. The counts line separates them,
`check` raises `stale_review` at most once per kind, and a Finding with `0 stale` needs no review redone
however many superseded entries sit behind its current ones. (Citi Bike run 2 conflated the two and spent a
run on reviews that could not be recorded — `examples/nyc-open-data/docs/run-log.md`.)

**Where do the Reader criteria come from?** `skills/shape-narrative/references/narrative-criteria.md` when that
skill is installed, so the writer and the reviewer judge against the same list. When it is not, the skill's own
`references/reader-criteria.md` is used instead.

## It's working if

- `aftergrid review status <dir>` lists a current `method`, `question` and `reader` review after it runs.
- Every recorded review's `content_digest` equals the Finding's `content_digest`, and `attestations` is
  untouched.
- Editing the memo afterwards makes all three reviews report as stale, not as current. Recording three new
  reviews over them makes the old three report as `superseded`, not as stale: `review status` exits 0 and the
  rendered page lists them once as earlier reviews rather than as three warnings.
- A Finding whose `aftergrid check` reports a `check_error` gets no reviews at all, and a `needs_attention`
  reason naming the category and location. `aftergrid review status` on that Finding also reports `halt` with
  that error: it runs the artifact check itself, so its decision is never a claim about evidence it did not
  read. Its `continue` reason calls the draft evidence-valid only when that check ran and found nothing.
- A Finding with `outcome: insufficient_data` and clean reviews is reported as ready to continue, not as a
  failed run.
- The summary uses the reviewers' own words and never the word approved.
