---
name: checked-analysis
description: Run one Analysis against retained inputs and leave an Analysis directory the writer can consume — probe the catalog, capture the inputs, write the Checks before the analysis SQL, execute, fill analysis.yaml. Use after a Question is sharpened, when an analysis must rerun on the same evidence, or when a run must stop on a missing definition approval, clarification or provisional sign-off.
user-invocable: false
---

# Run a checked Analysis

Produce evidence someone else can trust without rerunning it: retained inputs with hashes, Checks written before
the numbers were seen, results pinned to the SQL that made them, and an `analysis.yaml` recording what was
assumed, what was explored and what is still missing.

Contract for everything written here: **[docs/contracts/analysis-directory.md](../../docs/contracts/analysis-directory.md)**.

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

```bash
aftergrid capture <finding-dir> --catalog
```

Reads the tables and columns and writes nothing. Look for the three things that most often make a plan
impossible: a column the plan assumes and the source does not have; a distinction the plan needs (which variant
a user *saw*, not which they were *assigned*) that nothing records; and a timestamp whose lateness would make
the last cohort of the window look thin.

Record each probe in `analysis.yaml#/probes` with what it asked, what it showed and what the plan did about it.
Probes are `kind: exploratory` and are never evidence for a Claim.

Done when: every table and column the plan names exists, and each probe has an `observed` line.

## 3. Capture the retained inputs

```bash
aftergrid capture <finding-dir> --tables <a,b,c>
```

Whole-table extracts land in `<finding-dir>/inputs/` and `manifest.yaml#/snapshot/inputs` records each with a
content hash, the adapter, the method and the consistency the adapter actually gives. **`capture` applies no
window, filter or row bound** — there is no flag for one — and `source.method` records the read it performed.
Bounding to the window is the analysis SQL's job (step 5), which converts to the analytical timezone explicitly,
so an edge row is kept or dropped by the SQL rather than by how wide the extract happened to be.

`--description` replaces the adapter's default ("Whole-table extract of …") and lands inside the content digest,
where every later reader takes it for provenance. Say what was captured and when. A description calling the
extract bounded, filtered or limited is refused, because nothing applied one.

Every later step reads these files. Nothing after this point reads the source.

Done when: `snapshot.inputs` names every table the plan reads, each with a `content_hash` and the file present.

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

Every Check binds to an execution: `execution_id` names the execution whose retained inputs and parameters it
runs against, and a Check that names none uses the first. That binding is what `check --mode rerun` resolves
too, so a Check that resolves to no execution is refused rather than run against a table set nobody recorded.

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
types and units, and an execution binding the query to its inputs, its parameters and its result.

## 6. Execute

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

Done when: `execute` reports `sql performed` with no errors, and `check --mode rerun` reports evidence `valid`
with no `rerun_mismatch`.

## 7. Fill analysis.yaml

Set `stage: analysed` and fill in everything the writer reads and cannot re-derive:

- `reader_profile`, and `assumptions` — one entry per choice the Question did not settle, each with its `basis`.
  `unverified` is an honest basis; writing it down never upgrades it.
- `pre_registered_comparison`, with `registered_before_cuts` telling the truth.
- `probes` from step 2, and `execution_order` from steps 4 and 5, in the order written and run. A probe taken
  after a result was seen is recorded where it happened, with `post_hoc: true` — the label is the record, and
  moving the step up the list to look orderly is the thing it exists to prevent.
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

Done when `aftergrid execute <finding-dir>` reports no `analysis_contract` error and no `stage: clarified`
warning: the shape is right, every Check precedes every query in `execution_order`, and every reference
resolves — to a saved cell, a requested value, or a pinned definition.

## 8. Hand over

The writer (`/write-finding`) consumes `analysis.yaml`, `manifest.yaml` and `results/`. It does not change a
query, a result, a definition, or a Claim's type, comparison, population or window. Anything it would have to
change belongs here, and a request to change a number reopens this skill at step 5.

Say which of the four outcomes was recommended and why, name every `needs_input` item with its owner, and state
which Claims rest on an exploratory cut or a proposed definition.
