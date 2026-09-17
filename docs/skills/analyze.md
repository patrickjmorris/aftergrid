# analyze

## What it does

`/analyze` runs one Question from a raw ask to a reviewed Finding draft, and stops with a reason when any gate
fails. It is the **only** orchestrator in the Engine: it owns the order of the stages and the decision to halt,
and nothing else runs them.

The order is fixed: clarify → `/checked-analysis` → `/write-finding` → `/iterate-visual` → `/shape-narrative` →
`/analysis-review` → `aftergrid check` → `aftergrid review status`. Each stage's craft belongs to the skill
that owns it; `/analyze` does not redo that work, which is what keeps a three-pass visual loop from quietly
becoming a six-pass one.

**The last two commands of every run are `aftergrid check` and then `aftergrid review status`**, and nothing
runs after them. A review binds to a content digest, so an edit made after a review leaves the reviews
describing content nobody read; an edit after `review status` sends the run back to `/analysis-review` and
both commands run again before the run may report the Finding as reviewed.

Normal completion is **an evidence-valid draft reviewed by agents, awaiting human publication readiness**. Not
approved, not published. A human APPROVED review at the analyzed commit is a separate gate
([`docs/contracts/publication.md`](../contracts/publication.md)).

It is **user-invoked** (`disable-model-invocation: true`, `policy.allow_implicit_invocation: false`). It writes
a Finding directory, reads a warehouse and spends real model time, so a human asks for it — and being the only
orchestrator, a model reaching for it mid-task would nest one run inside another.

## When to reach for it

- You have a raw ask in plain words and want a Finding out of it. `/analyze` creates the Finding and clarifies
  the ask first; you are not required to already know the metric, population, window or falsifier.
- You have a Finding directory whose `question.state` is already `resolved` and want the analysis run against
  it.
- A previous run halted and you have supplied what it asked for. `/analyze` reads `analysis-progress.yaml` and
  resumes from the stage that stopped.

Not for: presentation feedback on a finished Finding (`/revise-finding`), sharpening a Question on its own
(`/grill-question`), or recording a decision (`aftergrid decide`).

## Common questions

**Why does it not call `/grill-question` to clarify?** Because `/grill-question` is user-invoked, and no
user-invoked skill invokes another. Both read the same clarification procedure,
`skills/checked-analysis/references/clarification.md`, so the interview is the same one either way.

**What is the difference between the three halts?** `needs_input` means a person owes the run something — a
clarification, an approved Metric definition for a published decision metric, a provisional-read sign-off.
`needs_attention` means the run produced something a person must look at — a blocking review finding, an error
from `aftergrid check`, or a chart `/iterate-visual` handed back after its third pass. `permission_denied`
means the harness refused a write inside the Finding directory: not the data, not the method, not the Operator,
but the tooling. All three leave every artifact in place and all three are resumable. Those three lists are the
whole set; anything not on them, a missing adapter included, is reported rather than halted on.

**What happens when the harness refuses a write?** The run stops at the refusal and does not route around it —
no shell redirect, no copy through `/tmp`, no second tool that happens not to be refused. It writes
`analysis-progress.yaml` with `status: permission_denied` **only if that file is writable**, which it often is
not, because it lives in the directory that just refused a write. So the halt is also printed as the last line
of the final message, as one JSON object: `{"aftergrid": "halt", "status": "permission_denied", "stage": …,
"paths": [… every refused path …], "reason": "… the harness's denial text …"}`. A headless harness reads that
line from stdout when no file could be written; the nightly eval records it as **infrastructure** with the
cause `harness_permission_denied` — zero assertions, never an analytical failure
([`docs/contracts/eval.md`](../contracts/eval.md)).

**Is a missing adapter a halt?** No, and it never was one. The default data path is the recorded one (ADR 0010,
[`docs/contracts/record.md`](../contracts/record.md)): your harness runs the SQL and `aftergrid record` writes
down what it ran. The orchestration continues unchanged, the draft carries `snapshot.guarantees:
[artifact_replay]` only, its Check outcomes are agent-reported, and `check --mode rerun` and Revisit are
unavailable until inputs are captured. The run reports all of that; it does not stop for it.

**Is "insufficient data" a halt?** No. `insufficient_data`, `inconclusive` and `needs_reframing` are outcomes a
completed Analysis reaches, and they run all the way through review and `check` like any other. The line that
matters: a `minimum_data` Check that **failed** is the answer; a Check that **errored** is a run that did not
happen, and that is a halt.

**Is a failed falsifier a halt?** No. A pre-registered falsifier that records the outcome it did not expect is
the Analysis working: it said in advance what would show the Answer wrong, and that happened. The outcome
becomes `inconclusive` (or `needs_reframing`) and the run writes the Finding, reviews it and renders it like
any other. `check` reports a `falsifier_failed` warning, not an error. Halting there would leave the honest
Finding unwritten, which is the failure the rule exists to prevent.

**What does the run report about the reviews?** The two lines `aftergrid review status` printed, quoted
verbatim — its counts line (`reviews: 3 current, 3 superseded, 0 stale`) and its verdict line
(`verdict: continue (…)`) — plus the exit code, never a summary in the run's own words and never the
reviewers' text in place of the verdict. `review status` exits **1** when a required kind's newest review is
stale or missing, so a headless run cannot report a Finding as reviewed over reviews nobody redid
([`docs/contracts/analysis-directory.md`](../contracts/analysis-directory.md)).

**Is a stale review the same thing as a superseded one?** No, and conflating them costs a run. A
**`stale`** count means the *newest* review of some kind is bound to other content: re-run that review and
record it at the current digest — never re-pin a review, which would make a reviewer say they read bytes they
never saw. A **`superseded`** count means an earlier review of a kind that *is* reviewed at the current
digest: history, not staleness, and no reason to review anything again (`aftergrid review record` dedupes on (kind, reviewer,
digest), so the re-review would write nothing). Citi Bike runs 2 and 3 in
`examples/nyc-open-data/docs/run-log.md` are the case that put this rule here.

**What stops it from inventing a falsifier to finish clarifying?** The halt. Where the Operator cannot answer,
the Question stays `unresolved` with the missing parts listed, and the run stops. The same rule covers metrics,
populations, windows, approvals and Claims: nothing is filled in to make a field non-empty.

**Can I watch it?** `analysis-progress.yaml` in the Finding directory carries the stage, the status, the reason
and when it was last written. It is orchestration bookkeeping — outside the content digest, never referenced by
a Claim, never shown to a Reader.

## It's working if

- Given only a raw ask, it creates the Finding and asks its clarifying questions in one round rather than one
  at a time.
- Every stage appears in `analysis-progress.yaml` before it starts and again when it ends.
- A run stopped for missing input, restarted after the answer arrives, picks up at the stage that stopped
  instead of starting over.
- A blocking review finding stops the run at `analysis_review`, and the reason names the reviewer and the
  finding.
- A write the harness refuses stops the run where it happened, with the refused paths and the denial text in
  the last line of its output — and nothing was written around the refusal.
- A Finding it completes carries three current reviews and no attestation, and the summary reports publication
  readiness in the word `aftergrid check` used — including `unknown`.
- Its last two commands are `aftergrid check` and then `aftergrid review status`, and nothing it did after
  them changed a file: a memo edited after the reviews sends it back to `/analysis-review` instead.
- The summary quotes `review status`'s counts line and verdict line verbatim, and a superseded review is
  reported as superseded rather than as a review to redo.
- On the recorded path the reviewers were told the Check outcomes were agent-reported
  (`checks_reported_by_agent`), and the summary names the tool that ran them and the `artifact_replay`-only
  guarantee.
- It never runs a fourth visual pass, a second narrative shaping, or `/analysis-review` twice on the same
  content.
