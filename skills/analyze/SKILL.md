---
name: analyze
description: Take a raw ask, or an already sharpened Question, all the way to a reviewed Finding draft — clarify, analyse under Checks, write, illustrate, shape, review, check. Use to run an analysis end to end, or to resume one that stopped for missing input or a blocking review.
disable-model-invocation: true
---

# Analyze

The one orchestrator. It owns the order of the stages and the decision to stop; every stage's craft belongs to
the skill that owns it, and this skill never redoes that work itself.

**Normal completion is an evidence-valid draft reviewed by agents, awaiting human publication readiness.**
Not "approved", not "published", not "verified". A human APPROVED review at the analyzed commit is a separate
gate that nothing here touches (`docs/contracts/publication.md`).

## The stages

Run them in this order. Each writes its stage into `analysis-progress.yaml` in the Finding directory before
starting and again when it ends, so a stopped run can be picked up where it stopped
([`references/halting.md`](references/halting.md) has the file's shape and the two halt artifacts).

| Stage | Owner | Ends when |
| --- | --- | --- |
| `clarify` | the shared clarification procedure | `question.state` is `resolved`, or the run has halted with what is missing |
| `checked_analysis` | `/checked-analysis` | `analysis.yaml` carries candidate claims, an execution order and an outcome recommendation, and the results are pinned — by `aftergrid record` on the recorded path, by `aftergrid execute` where the Instance configures an adapter |
| `write_finding` | `/write-finding` | `memo.md` has all six sections and the manifest carries claims, charts, tables, coverage and an outcome |
| `iterate_visual` | `/iterate-visual` | every chart has passed the rubric or been handed back after the third pass |
| `shape_narrative` | `/shape-narrative` | the memo is answer-first and each Evidence subsection is one Claim |
| `analysis_review` | `/analysis-review` | a current `method`, `question` and `reader` review is recorded |
| `check` | `aftergrid check` | the report has no errors |

Every stage runs, in this order, exactly once. A Finding with no chart still passes through `iterate_visual`,
which has nothing to do and says so.

**The data path does not change the stages.** By default the harness runs the SQL and `aftergrid record` writes
down what it ran (ADR 0010, `docs/contracts/record.md`); an adapter is the upgrade an Instance may configure. A
missing or unconfigured adapter is **not** a halt and never was a stage: the run continues on the recorded path,
the draft carries `snapshot.guarantees: [artifact_replay]` only, and `check --mode rerun` and Revisit are
unavailable until retained inputs exist. Carry that to the Operator as a fact; do not offer it as a fix.

## 1. Work out what you were given

Two starting points, and they take different first steps:

- **A raw ask in words.** Create the Finding first: `aftergrid new finding <slug> --ask "<the raw ask>"
  --reader <profile id>`. Then start at `clarify`.
- **An existing Finding directory.** Read `manifest.yaml`. When `question.state` is `resolved`, `clarify` is
  already done: start at the stage named in `analysis-progress.yaml`, or at `checked_analysis` when there is
  no progress file. When `question.state` is `unresolved`, start at `clarify` whatever the progress file says.

Done when you can name the Finding directory and the stage you are starting from.

## 2. Clarify

Follow `skills/checked-analysis/references/clarification.md` — the shared procedure, owned by
`ag-grill-checked-analysis-7qg`. Ask the whole frontier in one round rather than one question at a time, and
carry the answers into `question` in the manifest.

`/analyze` is user-invoked, so it reaches for that file rather than calling `/grill-question`: a user-invoked
skill never invokes another user-invoked skill.

Where the Operator cannot answer, halt with `needs_input` and name what is missing. Do not invent a metric, a
population, a window or a falsifier to make the field non-empty; an unresolved Question stays unresolved, with
the missing parts listed.

Done when `question.state` is `resolved` with a falsifier, or the run has halted with the missing parts named.

## 3. Run the stages

Invoke each owner in turn and let it finish. Between stages, do three things and nothing else:

1. Update `analysis-progress.yaml`.
2. Read the halt conditions below.
3. Move on.

Before `analysis_review`, run `aftergrid check <finding-dir>` and pass the reviewers what it reported about the
Check outcomes. On the recorded path the report carries `checks_reported_by_agent: true` — the outcomes are the
harness's word, and `check` established only that each named evidence file is present and still hashes to what
was pinned. A reviewer who is not told that is judging Checks they believe the Engine executed. Pass the tool
that ran them and the `artifact_replay`-only guarantee with it.

Treat every stage's output as its answer. `/iterate-visual` handing back a chart after three passes is an
answer: record it and carry on to `shape_narrative`. `/analysis-review` returning blocking findings is an
answer: halt. The craft loops live inside the craft skills, where each pass is recorded; a loop rerun from here
produces a different result with no record of why.

Done when `aftergrid check <finding-dir>` reports no errors, or the run has halted.

## 4. Halt conditions

Two halts, and the difference matters to whoever picks the Finding up.

**`needs_input` — a person owes the run something.**

- a clarification the Operator has not answered
- a Metric definition that is `proposed` where the Finding needs an approved one for a published decision
  metric (`docs/contracts/instance-layout.md`)
- a provisional read with no recorded human sign-off

**`needs_attention` — the run produced something a person must look at.**

- any blocking finding from `/analysis-review`
- any error from `aftergrid check`, including a Check that errored, a hash mismatch or a rerun mismatch
- a chart handed back by `/iterate-visual` after its third pass

**These two lists are the whole set.** Nothing else halts a run. In particular, a missing or unconfigured
adapter is not on either list: the analysis runs on the recorded path, the Finding is complete, checkable and
renderable, and the only things that stop having an answer are `check --mode rerun` (refused with
`rerun_unavailable`, exit 2) and Revisit. `checks_reported_by_agent: true` is not a halt either; it lowers
publication readiness to `unknown` at most, and `unknown` is reported, never rounded up.

Neither halt is a failure of the Analysis, and neither is an outcome. `insufficient_data`, `inconclusive` and
`needs_reframing` are outcomes a completed Analysis reaches, and they run all the way through review and
`check` like any other. A Check that **errored** is a run that did not happen; a `minimum_data` Check that
**failed** is the answer.

**A pre-registered falsifier that failed is not `needs_attention` either.** It is the answer too: the Analysis
said in advance what would show the Answer wrong and that happened, so the outcome is `inconclusive` (or
`needs_reframing`) and the run carries on to `/write-finding` and review. `check` reports it as a
`falsifier_failed` warning, not an error, and `render` writes the page with the falsifier on it. Halting there
leaves the honest Finding unwritten, which is the one outcome this skill must never produce.

Both halts leave the Finding directory resumable: every artifact produced so far stays, `analysis-progress.yaml`
names the stage and the reason, and the manifest records the state. The shapes are in
[`references/halting.md`](references/halting.md).

Done when the halt artifact is written and the reason names the stage, what is missing or blocking, and who
owns it.

## 5. Report

Give the Operator, in this order:

1. The outcome, in the Finding's own words.
2. Where the run stopped: `complete`, `needs_input` or `needs_attention`, and why.
3. What `aftergrid check` reported on each of its axes — syntax, content, evidence, sql, publication — using
   the words the command used. On the recorded path, also: which tool ran the queries and Checks, that the
   Check outcomes were reported rather than executed (`checks_reported_by_agent`), and that the Snapshot
   guarantees `artifact_replay` only, so the Analysis cannot be rerun or revisited.
4. The next command: `aftergrid render <dir>` for a draft the Operator can read, or the command that clears
   the halt.

Publication readiness is whatever `check` said, including `unknown`. Never round `unknown` up, and never
describe an agent review as approval.
