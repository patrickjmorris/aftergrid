# checked-analysis

## What it does

`/checked-analysis` runs one Analysis and leaves behind evidence someone else can trust without rerunning it:
Checks written before the numbers were seen, results pinned to the SQL that produced them and to the tool that
ran it, and an `analysis.yaml` recording what was assumed, what was explored and what is still missing.

The order is the point. It probes the catalog before committing to a plan, writes the applicable Checks —
invariant, reconciliation, minimum-data, falsifier — **before** the final analysis queries, runs each query and
Check through the harness's own data tool, pins what ran with `aftergrid record`, and records the execution order
as it happened. A Check written after the number is known is a Check written to agree with it.

That recorded path is the default (ADR 0010, [`docs/contracts/record.md`](../contracts/record.md)). Where the
Instance configures an adapter, the skill captures the tables it will read and runs everything against those
retained inputs with `aftergrid execute` instead — the same Analysis, with retained inputs, mechanically observed
Check outcomes, `check --mode rerun` and Revisit on top.

It is **model-invoked** (`user-invocable: false`, `policy.allow_implicit_invocation: true`): `/analyze` reaches
for it mid-run. It is also where the shared clarification procedure lives — the same file `/grill-question`
points at — so the two reuse one interview without a user-invoked skill calling another.

Contract for everything it writes: [`docs/contracts/analysis-directory.md`](../contracts/analysis-directory.md);
for the recorded path, [`docs/contracts/record.md`](../contracts/record.md).

## When to reach for it

- A Question is sharpened and the evidence behind it does not exist yet.
- An Analysis must be run again after a query or a Check changed — against the same retained inputs where an
  adapter exists, and otherwise re-run by the harness and recorded again.
- `/revise-finding` classified a request as numeric or query, which reopens the analysis here.
- A run has to stop: a definition is only proposed, a clarification is unanswered, or a provisional-access
  sign-off was never recorded.

Reach for `/grill-question` instead when the ask is not yet a Question and you want to run the interview
yourself. Reach for `/write-finding` when the evidence is pinned and the memo is what is missing.

## Common questions

**Do I need an adapter to run it?** No. Without one it runs on the recorded path: your harness's tool — an MCP
server, a CLI, `psql` — runs every query and every Check, and `aftergrid record --tool "<name>"` pins the SQL,
the parameters, the result, the evidence and who ran it. An Instance (`aftergrid.yaml`) is still required; an
adapter is not, and its absence is not a halt. What you do not get: retained inputs, so `snapshot.guarantees` is
exactly `[artifact_replay]`, `aftergrid check --mode rerun` is refused with `rerun_unavailable`, and the Finding
cannot be revisited until inputs are captured.

**If aftergrid did not run the Checks, what does a passing Check mean?** That the tool said it passed. On the
recorded path a Check outcome is agent-reported: `record` refuses a `pass` with no evidence file, `check`
verifies that the file is present and still hashes to what was pinned, and the report carries
`checks_reported_by_agent: true` as its own fact. An agent-reported outcome can lower publication readiness and
never raises it — `unknown` at most. The guardrail hook inspects shell commands in Claude Code, so a query run
through an MCP server or an in-process client never passed a shell and the guard never saw it; that
non-coverage is stated on the Finding rather than left to be inferred.

**Can it read my warehouse during the analysis?** On the recorded path your tool reads it every time a query
runs, and nothing is copied into the Finding but the SQL, the parameters and the result. On the adapter path it
reads the source in two places, and both are reads: the catalog probe, and the capture that copies the declared
tables into the Finding. After that, `aftergrid execute` opens the retained extracts, verifies every hash, and
reports `missing_file` or `hash_mismatch` rather than fall back to the source. There is no flag that changes
this.

**Does the capture only take the rows my window needs?** On the adapter path, no — it copies whole tables, and
the recorded `source.method` says so. The window is applied in the analysis SQL, which converts to the
analytical timezone explicitly, so nothing depends on how wide the extract is. A `--description` claiming the
extract was bounded or filtered is refused, because provenance inside the content digest may not describe a read
that did not happen.

**What if a table is too big to copy whole?** Because the read *is* the whole table, a table the planner puts
over the Instance's admission limit is refused with `admission` before anything is read or written, and there is
no narrower flag to reach for: build the bounded table for this Question yourself — into the Instance's DuckDB
file, or as a table in the schema a Postgres Instance reads — with a provenance table beside it, and capture
that, the analytical window still living in the SQL
([`docs/contracts/adapters.md`](../contracts/adapters.md), "Large sources: the windowed Instance pattern").
`aftergrid capture <finding-dir> --catalog` reports each table's scan rows, its bytes where the source states
them, and its admissibility before anything is copied.

**What happens when a Check fails?** It depends on which Check, and the distinction is deliberate. A failing
`minimum_data` Check is a business result: the Finding's outcome becomes `insufficient_data` and the memo says
what is missing. A failing `required` invariant or reconciliation Check means the Analysis does not establish
what it asserts, and it is reported as an error. A Check that *errors* is never a business result.

**What if no approved definition fits?** It proposes one — `lifecycle: proposed`, no approval block — and that
definition may back a supporting or diagnostic Claim with its status shown. It can never be the published
decision metric. If the Question's decision metric is the one that is only proposed, the run stops with a
`needs_input` item of kind `definition_approval` naming you.

**Where does the middle of the analysis go — the dead ends, the days that went nowhere?** Into
`analysis.yaml#/probes`, in place, as it happens. Each entry carries `at` (the harness's clock at the time,
never a time reconstructed afterwards) and a `kind`: `exploratory` for a look that informed the plan,
`dead_end` for a path tried or considered and abandoned, `reframe` for a look that changed the Question, which
must then say what changed. Dead ends are kept, not deleted, and the list is read in `at` order as the timeline
of the run — `check` warns when it is out of order rather than refusing it, because the honest repair is the
times and not the sort. The writer may cite a dead end in a Finding's Limitations; it may never turn one into a
number.

**How are exploratory cuts kept from becoming the headline?** The primary comparison is registered in
`analysis.yaml` before any cut is explored, with `registered_before_cuts` telling the truth about when. A cut
decided afterwards is marked `exploratory: true` in `execution_order`, and its Claim carries
`comparison.pre_registered: false` all the way into the Finding.

**Will it rewrite an approved Finding?** No. `aftergrid execute` and `aftergrid record` both refuse a revision
carrying attestations when the run would change the content digest they bind to: nothing is written, and the
report says to bump the revision. Attestations and reviews are never written, refreshed or dropped.

**What does the writer get?** `analysis.yaml`, `manifest.yaml` and `results/`. The writer sharpens sentences and
writes the memo; it does not change a query, a result, a definition, or a Claim's type, comparison, population or
window.

## It's working if

- `analysis.yaml#/execution_order` lists every Check before the first analysis query, and the Check files' git
  history agrees with that order.
- Every exploratory cut is labelled in `execution_order` and in the Claim resting on it.
- Each probe records what it asked *and* what it observed, and at least one of them changed the plan.
- Every probe carries `at` and `kind`, the entries are in `at` order, and the dead ends are still there. The
  middle of the analysis is legible from the list alone: where it went, what it abandoned, what it reframed.
- On the recorded path: every declared execution and Check has been recorded with the tool that ran it,
  `aftergrid check` reports evidence `valid` with no `recorded_path` warning left, and the handover says the
  Check outcomes were reported rather than executed.
- On the adapter path: `aftergrid execute` reports `sql performed` with no errors, and `aftergrid check --mode
  rerun` reports evidence `valid` with no `rerun_mismatch`.
- `snapshot.guarantees` was set by a run that actually happened, not by capturing the inputs — and it is empty
  when the run saved no result, because there is then nothing to replay. A recorded Finding carries
  `artifact_replay` and never claims `analysis_rerun`.
- Every Check names the execution it runs against, so on the adapter path `check --mode rerun` resolves it to the
  same retained inputs `execute` used; a Check that resolves to no execution is refused instead of quietly
  passing.
- Every evidence reference names a cell that exists, and a causal Claim records `causal_basis`.
- Every assumption the Question did not settle has an entry with an honest `basis` — including `unverified`.
- A halted run names each `needs_input` item with an owner, and neither the state nor the outcome is rounded up.
- A non-answer carries `what_would_be_needed`, so `insufficient_data` is usable rather than a shrug.
