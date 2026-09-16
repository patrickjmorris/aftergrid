# analysis-review

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
silently wrong.

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

**Where do the Reader criteria come from?** `skills/shape-narrative/references/narrative-criteria.md` when that
skill is installed, so the writer and the reviewer judge against the same list. When it is not, the skill's own
`references/reader-criteria.md` is used instead.

## It's working if

- `aftergrid review status <dir>` lists a current `method`, `question` and `reader` review after it runs.
- Every recorded review's `content_digest` equals the Finding's `content_digest`, and `attestations` is
  untouched.
- Editing the memo afterwards makes all three reviews report as stale, not as current.
- A Finding whose `aftergrid check` reports a `check_error` gets no reviews at all, and a `needs_attention`
  reason naming the category and location. `aftergrid review status` on that Finding also reports `halt` with
  that error: it runs the artifact check itself, so its decision is never a claim about evidence it did not
  read. Its `continue` reason calls the draft evidence-valid only when that check ran and found nothing.
- A Finding with `outcome: insufficient_data` and clean reviews is reported as ready to continue, not as a
  failed run.
- The summary uses the reviewers' own words and never the word approved.
