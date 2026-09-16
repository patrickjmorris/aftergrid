# checked-analysis

## What it does

`/checked-analysis` runs one Analysis and leaves behind evidence someone else can trust without rerunning it:
retained inputs with content hashes, Checks written before the numbers were seen, results pinned to the SQL that
produced them, and an `analysis.yaml` recording what was assumed, what was explored and what is still missing.

The order is the point. It probes the catalog before committing to a plan, captures the tables it will read,
writes the applicable Checks — invariant, reconciliation, minimum-data, falsifier — **before** the final analysis
queries, runs everything against the retained inputs with `aftergrid execute`, and records the execution order as
it happened. A Check written after the number is known is a Check written to agree with it.

It is **model-invoked** (`user-invocable: false`, `policy.allow_implicit_invocation: true`): `/analyze` reaches
for it mid-run. It is also where the shared clarification procedure lives — the same file `/grill-question`
points at — so the two reuse one interview without a user-invoked skill calling another.

Contract for everything it writes: [`docs/contracts/analysis-directory.md`](../contracts/analysis-directory.md).

## When to reach for it

- A Question is sharpened and the evidence behind it does not exist yet.
- An Analysis must be rerun on the same retained inputs after a query or a Check changed.
- `/revise-finding` classified a request as numeric or query, which reopens the analysis here.
- A run has to stop: a definition is only proposed, a clarification is unanswered, or a provisional-access
  sign-off was never recorded.

Reach for `/grill-question` instead when the ask is not yet a Question and you want to run the interview
yourself. Reach for `/write-finding` when the evidence is pinned and the memo is what is missing.

## Common questions

**Can it read my warehouse during the analysis?** Only in two places, and both are reads: the catalog probe, and
the capture that copies the declared tables into the Finding. After that, `aftergrid execute` opens the retained
extracts, verifies every hash, and reports `missing_file` or `hash_mismatch` rather than fall back to the source.
There is no flag that changes this.

**What happens when a Check fails?** It depends on which Check, and the distinction is deliberate. A failing
`minimum_data` Check is a business result: the Finding's outcome becomes `insufficient_data` and the memo says
what is missing. A failing `required` invariant or reconciliation Check means the Analysis does not establish
what it asserts, and it is reported as an error. A Check that *errors* is never a business result.

**What if no approved definition fits?** It proposes one — `lifecycle: proposed`, no approval block — and that
definition may back a supporting or diagnostic Claim with its status shown. It can never be the published
decision metric. If the Question's decision metric is the one that is only proposed, the run stops with a
`needs_input` item of kind `definition_approval` naming you.

**How are exploratory cuts kept from becoming the headline?** The primary comparison is registered in
`analysis.yaml` before any cut is explored, with `registered_before_cuts` telling the truth about when. A cut
decided afterwards is marked `exploratory: true` in `execution_order`, and its Claim carries
`comparison.pre_registered: false` all the way into the Finding.

**Will it rewrite an approved Finding?** No. `aftergrid execute` refuses a revision carrying attestations when
the run would change the content digest they bind to: nothing is written, and the report says to bump the
revision. Attestations and reviews are never written, refreshed or dropped.

**What does the writer get?** `analysis.yaml`, `manifest.yaml` and `results/`. The writer sharpens sentences and
writes the memo; it does not change a query, a result, a definition, or a Claim's type, comparison, population or
window.

## It's working if

- `analysis.yaml#/execution_order` lists every Check before the first analysis query, and the Check files' git
  history agrees with that order.
- Every exploratory cut is labelled in `execution_order` and in the Claim resting on it.
- Each probe records what it asked *and* what it observed, and at least one of them changed the plan.
- `aftergrid execute` reports `sql performed` with no errors, and `aftergrid check --mode rerun` reports evidence
  `valid` with no `rerun_mismatch`.
- `snapshot.guarantees` was set by a run that actually happened, not by capturing the inputs.
- Every assumption the Question did not settle has an entry with an honest `basis` — including `unverified`.
- A halted run names each `needs_input` item with an owner, and neither the state nor the outcome is rounded up.
- A non-answer carries `what_would_be_needed`, so `insufficient_data` is usable rather than a shrug.
