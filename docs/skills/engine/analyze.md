# analyze: Engine reference

The optional Engine path for [analyze](../analyze.md). This page is for people running the aftergrid CLI; existing Engine checks and approval requirements still apply. Agents read `skills/analyze/references/engine-workflow.md`.

## What it does

`/analyze` runs one Question from a raw ask to a reviewed Finding draft, and stops with a reason when any gate
fails. It is the **only** orchestrator in the Engine: it owns the order of the stages and the decision to halt,
and nothing else runs them.

The order is fixed: clarify → the checked-analysis stage → `/write-finding` → `/iterate-visual` → the `/write-finding` narrative pass →
`/analysis-review` → `aftergrid check` → `aftergrid review status`. Each stage's craft belongs to the skill
that owns it; `/analyze` does not redo that work, which is what keeps a three-pass visual loop from quietly
becoming a six-pass one.

**The last two commands of every run are `aftergrid check` and then `aftergrid review status`**, and nothing
runs after them. A review binds to a content digest, so an edit made after a review leaves the reviews
describing content nobody read; an edit after `review status` sends the run back to `/analysis-review` and
both commands run again before the run may report the Finding as reviewed.

Normal completion is **an evidence-valid draft reviewed by agents, awaiting human publication readiness**. Not
approved, not published. A human APPROVED review at the analyzed commit is a separate gate
([`docs/contracts/publication.md`](../../contracts/publication.md)).

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
user-invoked skill invokes another. Both ship an identical copy of the clarification procedure,
`references/clarification.md`, so the interview is the same one either way.

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
([`docs/contracts/eval.md`](../../contracts/eval.md)).

**Is a missing adapter a halt?** No, and it never was one. The default data path is the recorded one (ADR 0010,
[`docs/contracts/record.md`](../../contracts/record.md)): your harness runs the SQL and `aftergrid record` writes
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
([`docs/contracts/analysis-directory.md`](../../contracts/analysis-directory.md)).

**Is a stale review the same thing as a superseded one?** No, and conflating them costs a run. A
**`stale`** count means the *newest* review of some kind is bound to other content: re-run that review and
record it at the current digest — never re-pin a review, which would make a reviewer say they read bytes they
never saw. A **`superseded`** count means an earlier review of a kind that *is* reviewed at the current
digest: history, not staleness, and no reason to review anything again (`aftergrid review record` dedupes on (kind, reviewer,
digest), so the re-review would write nothing).

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

## The checked-analysis stage

The `checked_analysis` stage runs one Analysis and leaves behind evidence someone else can trust without rerunning it:
Checks written before the numbers were seen, results pinned to the SQL that produced them and to the tool that
ran it, and an `analysis.yaml` recording what was assumed, what was explored and what is still missing.

The order is the point. The stage probes the catalog before committing to a plan, writes the applicable Checks
(invariant, reconciliation, minimum-data, falsifier) **before** the final analysis queries, runs each query and
Check through the harness's own data tool, pins what ran with `aftergrid record`, and records the execution order
as it happened. A Check written after the number is known is a Check written to agree with it.

That recorded path is the default (ADR 0010, [`docs/contracts/record.md`](../../contracts/record.md)). Where the
Instance configures an adapter, the stage captures the tables it will read and runs everything against those
retained inputs with `aftergrid execute` instead: the same Analysis, with retained inputs, mechanically observed
Check outcomes, `check --mode rerun` and Revisit on top.

It used to be the model-invoked `/checked-analysis` skill. It is now a stage `/analyze` runs itself, from
`skills/analyze/references/checked-analysis.md`. The shared clarification procedure lives beside it, in
`skills/analyze/references/clarification.md`, and `/grill-question` ships an identical copy, so the two reuse one
interview without a user-invoked skill calling another.

Contract for everything the stage writes: [`docs/contracts/analysis-directory.md`](../../contracts/analysis-directory.md);
for the recorded path, [`docs/contracts/record.md`](../../contracts/record.md).

### When the stage runs again

- A Question is sharpened and the evidence behind it does not exist yet.
- An Analysis must be run again after a query or a Check changed, against the same retained inputs where an
  adapter exists, and otherwise re-run by the harness and recorded again.
- `/revise-finding` classified a request as numeric or query, which reopens this stage.
- A run has to stop: a definition is only proposed, a clarification is unanswered, or a provisional-access
  sign-off was never recorded.

Reach for `/grill-question` instead when the ask is not yet a Question and you want to run the interview
yourself. Reach for `/write-finding` when the evidence is pinned and the memo is what is missing.

### Checked-analysis stage: common questions

**Does the stage need an adapter?** No. Without one it runs on the recorded path: your harness's tool (an MCP
server, a CLI, `psql`) runs every query and every Check, and `aftergrid record --tool "<name>"` pins the SQL,
the parameters, the result, the evidence and who ran it. An Instance (`aftergrid.yaml`) is still required; an
adapter is not, and its absence is not a halt. What you do not get: retained inputs, so `snapshot.guarantees` is
exactly `[artifact_replay]`, `aftergrid check --mode rerun` is refused with `rerun_unavailable`, and the Finding
cannot be revisited until inputs are captured.

**If aftergrid did not run the Checks, what does a passing Check mean?** That the tool said it passed. On the
recorded path a Check outcome is agent-reported: `record` refuses a `pass` with no evidence file, `check`
verifies that the file is present and still hashes to what was pinned, and the report carries
`checks_reported_by_agent: true` as its own fact. An agent-reported outcome can lower publication readiness and
never raises it: `unknown` at most. The guardrail hook inspects shell commands in Claude Code, so a query run
through an MCP server or an in-process client never passed a shell and the guard never saw it; that
non-coverage is stated on the Finding rather than left to be inferred.

**Can it read my warehouse during the analysis?** On the recorded path your tool reads it every time a query
runs, and nothing is copied into the Finding but the SQL, the parameters and the result. On the adapter path it
reads the source in two places, and both are reads: the catalog probe, and the capture that copies the declared
tables into the Finding. After that, `aftergrid execute` opens the retained extracts, verifies every hash, and
reports `missing_file` or `hash_mismatch` rather than fall back to the source. There is no flag that changes
this.

**Does the capture only take the rows my window needs?** On the adapter path, no. It copies whole tables, and
the recorded `source.method` says so. The window is applied in the analysis SQL, which converts to the
analytical timezone explicitly, so nothing depends on how wide the extract is. A `--description` claiming the
extract was bounded or filtered is refused, because provenance inside the content digest may not describe a read
that did not happen.

**What if a table is too big to copy whole?** Because the read *is* the whole table, a table the planner puts
over the Instance's admission limit is refused with `admission` before anything is read or written, and there is
no narrower flag to reach for: build the bounded table for this Question yourself (into the Instance's DuckDB
file, or as a table in the schema a Postgres Instance reads) with a provenance table beside it, and capture
that, the analytical window still living in the SQL
([`docs/contracts/adapters.md`](../../contracts/adapters.md), "Large sources: the windowed Instance pattern").
`aftergrid capture <finding-dir> --catalog` reports each table's scan rows, its bytes where the source states
them, and its admissibility before anything is copied.

**What happens when a Check fails?** It depends on which Check, and the distinction is deliberate. A failing
`minimum_data` Check is a business result: the Finding's outcome becomes `insufficient_data` and the memo says
what is missing. A failing `required` invariant or reconciliation Check means the Analysis does not establish
what it asserts, and it is reported as an error. A Check that *errors* is never a business result.

A failing **falsifier** is a third thing, and the most important one. A falsifier is never `required: true`:
`required` asks whether the numbers stand, a falsifier asks whether the *Answer* does. So a falsifier that
records the outcome it did not expect makes the Finding `inconclusive` (or `needs_reframing`) and the run
carries straight on to `/write-finding`. `check` reports it as a `falsifier_failed` warning, not an error, and
`render` writes the page with the falsifier on it. The one thing the stage will not do is loosen the threshold,
drop `required`, flip `expected_outcome` or rewrite the SQL after seeing the result; `checks_preregistered`
records each Check's hash when it was written so a reviewer can check that mechanically.

**What if no approved definition fits?** It proposes one (`lifecycle: proposed`, no approval block), and that
definition may back a supporting or diagnostic Claim with its status shown. It can never be the published
decision metric. If the Question's decision metric is the one that is only proposed, the run stops with a
`needs_input` item of kind `definition_approval` naming you.

**Where does the middle of the analysis go: the dead ends, the days that went nowhere?** Into
`analysis.yaml#/probes`, in place, as it happens. Each entry carries `at` (the harness's clock at the time,
never a time reconstructed afterward) and a `kind`: `exploratory` for a look that informed the plan,
`dead_end` for a path tried or considered and abandoned, `reframe` for a look that changed the Question, which
must then say what changed. Dead ends are kept, not deleted, and the list is read in `at` order as the timeline
of the run. `check` warns when it is out of order rather than refusing it, because the honest repair is the
times and not the sort. The writer may cite a dead end in a Finding's Limitations; it may never turn one into a
number.

**How are exploratory cuts kept from becoming the headline?** The primary comparison is registered in
`analysis.yaml` before any cut is explored, with `registered_before_cuts` telling the truth about when. A cut
decided afterward is marked `exploratory: true` in `execution_order`, and its Claim carries
`comparison.pre_registered: false` all the way into the Finding.

**Will it rewrite an approved Finding?** No. `aftergrid execute` and `aftergrid record` both refuse a revision
carrying attestations when the run would change the content digest they bind to: nothing is written, and the
report says to bump the revision. Attestations and reviews are never written, refreshed or dropped.

**What does the writer get?** `analysis.yaml`, `manifest.yaml` and `results/`. The writer sharpens sentences and
writes the memo; it does not change a query, a result, a definition, or a Claim's type, comparison, population or
window.

### Checked-analysis stage: it's working if

- `analysis.yaml#/execution_order` lists every Check before the first analysis query, and the Check files' git
  history agrees with that order.
- Every exploratory cut is labeled in `execution_order` and in the Claim resting on it.
- Each probe records what it asked *and* what it observed, and at least one of them changed the plan.
- Every probe carries `at` and `kind`, the entries are in `at` order, and the dead ends are still there. The
  middle of the analysis is legible from the list alone: where it went, what it abandoned, what it reframed.
- On the recorded path: every declared execution and Check has been recorded with the tool that ran it,
  `aftergrid check` reports evidence `valid` with no `recorded_path` warning left, and the handover says the
  Check outcomes were reported rather than executed.
- On the adapter path: `aftergrid execute` reports `sql performed` with no errors, and `aftergrid check --mode
  rerun` reports evidence `valid` with no `rerun_mismatch`.
- `snapshot.guarantees` was set by a run that actually happened, not by capturing the inputs, and it is empty
  when the run saved no result, because there is then nothing to replay. A recorded Finding carries
  `artifact_replay` and never claims `analysis_rerun`.
- Every Check names the execution it runs against, so on the adapter path `check --mode rerun` resolves it to the
  same retained inputs `execute` used; a Check that resolves to no execution is refused instead of quietly
  passing.
- Every evidence reference names a cell that exists, and a causal Claim records `causal_basis`.
- Every assumption the Question did not settle has an entry with an honest `basis`, including `unverified`.
- A halted run names each `needs_input` item with an owner, and neither the state nor the outcome is rounded up.
- A non-answer carries `what_would_be_needed`, so `insufficient_data` is usable rather than a shrug.
