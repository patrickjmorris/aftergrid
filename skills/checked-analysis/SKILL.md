---
name: checked-analysis
description: Run one Analysis and leave an Analysis directory the writer can consume — probe the catalog, write the Checks before the analysis SQL, run each query and Check through the harness's own data tool and record what ran, fill analysis.yaml. Where the Instance configures an adapter, capture the inputs and execute against them instead. Use after a Question is sharpened, when an analysis must rerun on the same evidence, or when a run must stop on a missing definition approval, clarification or provisional sign-off.
user-invocable: false
---

# Run a checked Analysis

Produce evidence someone else can trust without rerunning it: Checks written before the numbers were seen,
results pinned to the SQL that made them and to the tool that ran it, and an `analysis.yaml` recording what was
assumed, what was explored and what is still missing.

**Who runs the SQL.** By default, the Operator's harness does — an MCP server, a CLI, `psql` — and
`aftergrid record` writes down what it ran (ADR 0010). An adapter is the **upgrade** the same Finding gains when
an Instance configures one, never a prerequisite for producing one: it adds retained inputs, mechanically
observed Check outcomes, `check --mode rerun` and Revisit. Steps 3 and 6 are written in that order.

Contract for everything written here: **[docs/contracts/analysis-directory.md](../../docs/contracts/analysis-directory.md)**.
The recorded path: **[docs/contracts/record.md](../../docs/contracts/record.md)**.

**Stop rather than guess.** At any step, a missing definition approval, an unanswered clarification or an
unrecorded provisional-access sign-off is a `needs_input` entry in `analysis.yaml` and a matching
`finding.needs_input` in `manifest.yaml`, with `finding.state: needs_input`. Each names its owner and is
specific enough to act on without a round trip. Stopping there is a result; a filled-in guess is not.

## 1. Clarify, or confirm the Question is already clear

Follow **[references/clarification.md](references/clarification.md)** — the same file `/grill-question` follows.

When the Finding already carries `question.state: resolved`, read it, restate it, and skip the rounds. When
parts are listed in `question.unresolved`, ask only about those.

Done when: every one of the seven parts is settled, or `question.unresolved` names exactly what is not and the
unsettled fields are absent from the manifest.

## 2. Probe the catalog before committing to a plan

Read the tables and columns through the harness's own data tool — the same tool that will run the analysis SQL
at step 6. Where the Instance configures an adapter, `aftergrid capture <finding-dir> --catalog` does it through
the Engine instead; it reads the catalog and writes nothing. Either way the probe writes no evidence.

Look for the three things that most often make a plan impossible: a column the plan assumes and the source does
not have; a distinction the plan needs (which variant a user *saw*, not which they were *assigned*) that nothing
records; and a timestamp whose lateness would make the last cohort of the window look thin.

Record each probe in `analysis.yaml#/probes`, **as it happens**, with:

- `at` — the time from the harness's clock at that moment, RFC 3339 with an offset. Never a time worked out
  afterwards: if a look was not written down when it was taken, say so in `observed` rather than invent one.
- `kind` — `exploratory` for a look that informed the plan, `dead_end` for a path tried or considered and
  abandoned, `reframe` for a look that changed the Question itself.
- `question`, `observed`, and `changed_plan`: what it asked, what it showed, and what the plan did about it.

This list is the account of the middle of the analysis, not a catalog-probe log, and it keeps growing after
step 2 — every later look, including one taken after a result was seen, is recorded here where it happened
(with `post_hoc: true` on its `execution_order` step), in `at` order.

**A dead end is recorded, not deleted.** A query that was wrong, a cut that showed nothing, a comparison
decided against — each is a `dead_end` entry saying what it asked, what it showed and what was done instead.
Deleting it makes the run look like it went straight to the answer, which is the one thing the list exists to
prevent.

**A `reframe` points at the change.** Its `changed_plan` names what the Question now is and what it was — and
the `/grill-question` revisit, if the reframe was big enough to send the Question back for sharpening. A
`reframe` with nothing in `changed_plan` is refused by `aftergrid check`.

Probes are never evidence for a Claim.

Done when: every table and column the plan names exists, and each probe has an `at`, a `kind` and an `observed`
line.

## 3. Retain the inputs — only where an adapter runs the SQL

**Default: nothing is retained, and that is the route.** The harness owns the data path, so there is nothing to
capture here. Declare each execution with `input_ids: []` and `mode: recorded`, leave `snapshot.inputs` empty,
and go to step 4. `aftergrid record` at step 6 pins what the harness ran.

`capture` is **optional** on this route and skipping it is not a gap: a manifest whose executions are all
harness-recorded and whose `snapshot.inputs` is empty is valid, complete and renderable, and `record` sets
`snapshot.guarantees` to exactly `[artifact_replay]` — the saved bytes replay, and nothing can be re-executed,
because nothing was retained. An Instance (`aftergrid.yaml`) is still required; an adapter is not.

Two things are **unavailable** until retained inputs exist, and neither is a failure of the run: `aftergrid
check --mode rerun`, which refuses a recorded Finding with `rerun_unavailable`, and Revisit, which needs a
rerun. Say that; never describe a recorded Finding as rerun, verified or ready.

**When the Instance configures an adapter** (`connection.adapter` in `aftergrid.yaml`), capture instead — the
exception, and the upgrade:

```bash
aftergrid capture <finding-dir> --tables <a,b,c>
```

Whole-table extracts land in `<finding-dir>/inputs/` and `manifest.yaml#/snapshot/inputs` records each with a
content hash, the adapter, the method and the consistency the adapter actually gives. **`capture` applies no
window, filter or row bound** — there is no flag for one — and `source.method` records the read it performed.
Bounding to the window is the analysis SQL's job (step 5), which converts to the analytical timezone explicitly,
so an edge row is kept or dropped by the SQL rather than by how wide the extract happened to be.

Because the read is the whole table, a table the planner puts over the Instance's admission limit is refused with
`admission` before anything is read or written; do not look for a narrower flag, because there is none — build a
bounded table for this Question (a daily/zone aggregate or a windowed extract) with the Operator's own script
into the Instance's DuckDB file, with a provenance table beside it, and capture that instead, the analytical
window still living in the SQL (`docs/contracts/adapters.md`, "Large sources: the windowed Instance pattern";
`aftergrid capture <finding-dir> --catalog` reports each table's scan rows, bytes and admissibility first).

`--description` replaces the adapter's default ("Whole-table extract of …") and lands inside the content digest,
where every later reader takes it for provenance. Say what was captured and when. A description calling the
extract bounded, filtered or limited is refused, because nothing applied one.

Every later step reads these files. Nothing after this point reads the source. What the upgrade buys, and only
here: retained inputs, Check outcomes observed by the Engine instead of reported to it, `check --mode rerun` and
Revisit.

Done when: on the recorded path, `snapshot.inputs` is empty and every execution declares `input_ids: []` and
`mode: recorded`. On the adapter path, `snapshot.inputs` names every table the plan reads, each with a
`content_hash` and the file present.

## 4. Write the Checks — before the analysis SQL

This is the step the whole skill exists for. A Check written after the number is known is a Check written to
agree with it.

| Kind | Asserts | Normally |
| --- | --- | --- |
| `invariant` | Something the data must be true of: no double counting, arms balanced, no negative counts | `required: true` |
| `reconciliation` | The calculation matches the approved definition's canonical SQL, computed a second way | `required: true` |
| `minimum_data` | There is enough data for the comparison to mean anything | `required: false` |
| `falsifier` | The Question's falsifier, with `expected_outcome` | `required: true` |

Each file is one `SELECT` returning exactly one row: a boolean-or-null `pass` and an optional text `detail`.
`pass = NULL` means *not evaluable on this data* and records `not_run` — that is how a falsifier declines to
answer below its minimum-data bar instead of flipping.

A `minimum_data` Check that records `fail` is a **business result**: the Finding's outcome becomes
`insufficient_data` and the memo says what is missing. A Check that errors is never a business result.

Write only the Checks that apply. A reconciliation Check needs an approved definition to reconcile against; when
there is none, that is a `needs_input` of kind `definition_approval`, not a Check invented to fill the table.

Every Check binds to an execution: `execution_id` names the execution whose parameters — and, on the adapter
path, whose retained inputs — it runs against, and a Check that names none uses the first. On the adapter path
that binding is what `check --mode rerun` resolves too, so a Check that resolves to no execution is refused
rather than run against a table set nobody recorded. Declare the binding on the recorded path as well: it says
which run an outcome belongs to, and it is what makes the Finding upgradable later.

Done when: every applicable Check has a file under `checks/`, a manifest entry with its `kind`, `required`,
`description` and its `execution_id`, and an entry in `analysis.yaml#/execution_order` — all of them before the
first `query` entry.

## 5. Write the analysis SQL

The pre-registered comparison first, then anything else. Every date grouping converts to the analytical timezone
explicitly. Parameters bind as `$name`; the analytical timezone is one of them.

An exploratory cut — a split decided after seeing a result — is marked `exploratory: true` in
`execution_order`, and its Claim carries `comparison.pre_registered: false`. Labelling it costs one line and is
what keeps a slice from quietly becoming the headline.

Done when: each query has a file under `queries/`, a manifest entry, a declared result set with column names,
types and units, and an execution binding the query to its parameters and its result — plus its retained inputs
on the adapter path, and `input_ids: []` with `mode: recorded` on the recorded one.

## 6. Run it, and record what ran

**Default: you run it, `aftergrid record` writes it down.** Run every Check and then every query yourself,
through the harness's data tool, in the order `execution_order` records — Checks before the first analysis
query, the same order the file claims. Keep each query's result as the file the tool produced (`.json` or
`.csv`) and each Check's output as an evidence file. Then pin them, one subject per invocation:

```bash
aftergrid record <finding-dir> --tool "<name>" --execution <id> --result <file.json|file.csv> \
  [--sql <file|inline>] [--params k=v ...]

aftergrid record <finding-dir> --tool "<name>" --check <id> --outcome pass|fail|not_run|error [--evidence <file>]
```

`--tool` is required and never defaulted: name the tool that actually ran the SQL, as the Operator says it
(`psql`, `supabase mcp`, `duckdb cli`). aftergrid cannot know it and will not guess. `record` executes nothing —
every report it writes says `sql_execution: not_performed`, which is the route, not a gap — and it pins the SQL
text, the parameters (`analytical_timezone` among them, or it refuses), the result rewritten into the canonical
result format and validated against the declared columns, who ran it (`executions[].executed_by`, `kind:
harness`), `mode: recorded`, `snapshot.guarantees: [artifact_replay]` and the content digest. It pins only what
the manifest already declares; it never invents an execution or a Check.

Check outcomes on this path are **agent-reported**: the tool ran the Check, and you report what it said.
`--outcome pass` with no `--evidence` is refused (`unevidenced_outcome`) — `pass` is the one outcome that
asserts something held, so it may only be recorded with the artifact the tool produced; `fail`, `not_run` and
`error` may carry evidence and do not have to. `check` then verifies the one thing a saved artifact can
establish — the named evidence file is present and still hashes to what was pinned — and reports
`checks_reported_by_agent: true` as its own fact. That can lower publication readiness and never raises it:
readiness is `unknown` at most. Say this in the handover, and give the writer the sentence for **How we
checked**: the Checks were reported by `<tool>`, not executed by aftergrid.

The guardrail hook (ADR 0006, `docs/contracts/hook.md`) inspects shell commands in Claude Code, so a query the
harness ran through an MCP server or an in-process client never passed a shell and the guard never saw it — that
non-coverage travels with the verdict and is stated on the Finding, not left to be inferred.

Then:

```bash
aftergrid check <finding-dir>
```

`--mode rerun` is **refused** here with `rerun_unavailable` (exit code 2), naming the executions and the tool
that ran them. Nothing is wrong with the Finding; the question has no answer on this route, and `--mode
artifact` still verifies everything it always verified.

Done when: every declared execution and Check has been recorded, `check` reports evidence `valid` with no
`recorded_path` warning left, and the report's `checks_reported_by_agent` line is carried into the handover.

**When the Instance configures an adapter**, the Engine runs it instead:

```bash
aftergrid execute <finding-dir>
```

Runs every execution and Check against the retained inputs, writes `results/*.json`, and pins the SQL hashes,
result hashes, Check outcomes and the content digest. It never reads the source, and it writes nothing at all
when a query errors, a Check has the wrong shape or a result does not match its declared columns.

Read the report as facts, not a verdict. `check_failed` on a `required` Check means the Analysis does not
establish what it asserts. A revision carrying attestations is refused: bump `finding.revision` first.
`snapshot.guarantees` is set by what this run observed: with no execution and no saved result it stays empty,
because there is nothing to replay.

At this point `analysis.yaml` is still the clarification seed (`stage: clarified`). `execute` says so as a
warning and does not treat it as an error — step 7 is where it becomes the working record.

Then:

```bash
aftergrid check <finding-dir> --mode rerun
```

Done when, on that path: `execute` reports `sql performed` with no errors, and `check --mode rerun` reports
evidence `valid` with no `rerun_mismatch`.

## 7. Fill analysis.yaml

Set `stage: analysed` and fill in everything the writer reads and cannot re-derive:

- `reader_profile`, and `assumptions` — one entry per choice the Question did not settle, each with its `basis`.
  `unverified` is an honest basis; writing it down never upgrades it.
- `pre_registered_comparison`, with `registered_before_cuts` telling the truth.
- `probes` from step 2 **and from every step since**, in `at` order: this is the account of the middle of the
  analysis handed to the writer, dead ends included. Each entry carries its `at`, its `kind` (`exploratory`,
  `dead_end`, `reframe`), what it asked, what it showed and what the plan did; a `reframe` names the Question
  change and the `/grill-question` revisit if there was one. The writer may cite a dead end in the Finding's
  Limitations — "we looked at X and it showed nothing" is a real limitation — and may never turn one into a
  number.
- `execution_order` from steps 4 and 5, in the order written and run. A probe taken after a result was seen is
  recorded where it happened, with `post_hoc: true` — the label is the record, and moving the step up the list
  to look orderly is the thing it exists to prevent. Probes out of `at` order are reported as a warning: fix
  the times, do not re-sort the list.
- `candidate_claims` — for each: the draft sentence, `type` (descriptive, associational, causal), evidence
  references, comparison, population, window, exclusions, limitations, and a `recheck_draft`. A `causal` Claim
  also carries `causal_basis: randomised_assignment`; without that design the Claim is associational. One Claim
  is `answer_bearing: true` and carries the `material_caveat`; `not_automatically_evaluable` with a reason and an
  owner is a complete Recheck answer, not a gap.
- Every evidence reference resolves to a cell that exists: `ref:<result>.<row_key>.<column>` names a row the
  query actually produced. A value the *writer* will create is named first — `requested_derived` for a
  derivation, `requested_external_sources` for a typed target or assumption — and then cited as `derived:<id>`
  or `ext:<id>`. Each definition a Claim's numbers rest on goes in `definition_refs` and must be pinned in
  `manifest.definitions` at that version.
- `outcome_recommendation` — `answered`, `inconclusive`, `insufficient_data` or `needs_reframing`, with the
  reason. Every outcome except `answered` also carries `what_would_be_needed`, and the schema requires it.
- `needs_input` for anything left to a named owner.

Done when `aftergrid check <finding-dir>` reports no `analysis_contract` error — and, on the adapter path,
`aftergrid execute` no longer warns `stage: clarified`: the shape is right, every Check precedes every query in
`execution_order`, and every reference resolves — to a saved cell, a requested value, or a pinned definition.

## 8. Hand over

The writer (`/write-finding`) consumes `analysis.yaml`, `manifest.yaml` and `results/`. It does not change a
query, a result, a definition, or a Claim's type, comparison, population or window. Anything it would have to
change belongs here, and a request to change a number reopens this skill at step 5.

Say which of the four outcomes was recommended and why, name every `needs_input` item with its owner, and state
which Claims rest on an exploratory cut or a proposed definition.

Hand over `probes` as the account of the middle: in `at` order, dead ends and reframes included, so the writer
can see where the analysis went and why it went there. Name any `reframe` explicitly — the Question the Finding
answers is not the Question the run started with — and say which dead ends are worth a line in Limitations.

Say which data path produced the evidence. On the recorded path that is four facts, all of them the writer's to
carry into **How we checked**: which tool ran the queries and Checks, that the Check outcomes are agent-reported
and each `pass` rests on a saved evidence file, that the Snapshot guarantees `artifact_replay` only — so nothing
can be rerun or revisited — and that the guardrail hook never saw a query that did not pass a shell.
