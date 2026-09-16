# Golden eval contract

`aftergrid eval` runs Golden Questions end to end and records what happened. It is evaluation material for the
nightly model-in-the-loop run, **never a merge gate** (spec stories 43–44, `docs/contracts/golden-questions.md`).

Implementation: `src/eval/runner.ts` (the run and the assertions), `src/eval/record.ts` (what is written down).
Tests: `src/eval.test.ts`.

```
aftergrid eval --golden <id|all> --analyzer fixture|command
               [--analyzer-command "<template with {finding_dir} {raw_ask}>"]
               [--instance <dir>] [--out <dir>] [--sha <git sha>] [--json]
```

## What one case does

1. Copy the Instance to a throwaway directory, without its `findings/`. The real Instance is never written to,
   so an eval can run against a live one.
2. `aftergrid new finding <golden id>` in the copy, with the Golden Question's `raw_ask` and `reader`. The
   analyzer starts from a draft created the same way an Operator's would be.
3. Hand the Finding directory and the raw ask to the analyzer.
4. Assert the Golden Question's expectations against whatever came back.
5. Write `<out>/<sha>/<case>.json`, and `<out>/<sha>/summary.json` for the run.

With no `--out`, nothing is written and the report says so.

## Analyzers

| `--analyzer` | What it is | Exercised |
| --- | --- | --- |
| `fixture` | Replays a recorded run: a prepared Finding directory at `fixtures/runs/<golden id>/output`, or `fixtures/runs/4ka-<golden id>/output`. Declines when neither exists. | yes — `src/eval.test.ts` |
| `command` | Shells out to a headless `/analyze` and reads its last JSON line. Tokens `{finding_dir}`, `{raw_ask}`, `{instance}`, `{golden}`, `{reader}` are substituted per argument; there is no shell. | **no** |

`exercised: false` travels into the run record and the report. No model runs in this repository's test suite,
so what a real analyzer prints, how long it takes and what it leaves behind on a crash are untested here.

**The first end-to-end golden eval with a live model has not been run.**

## The assertions

Each is recorded with an id, a status (`pass`, `fail`, `not_evaluated`) and a category.

| Assertion | Holds when | Category |
| --- | --- | --- |
| `outcome` | `finding.outcome` equals `expected.outcome` | analytical |
| `definitions_cited` | every id in `expected.definition_ids` appears in `definitions[]` | analytical |
| `tables_read` | every table in `expected.tables_read` appears in some `snapshot.inputs[].source.tables` | analytical |
| `reference_values` | the golden's own `reference.queries` reproduce every `expected.values[]` within tolerance, through the DuckDB adapter on the Instance's warehouse | **infrastructure** |
| `value:<id>` | some cell of the Finding's saved results is within tolerance of the expected value | analytical |
| `must_not:<phrase>` | the phrase does not appear in `memo.md` | analytical |
| `claim_type` | the answer-bearing Claim's type is no stronger than `expected.claim_type` (descriptive < associational < causal) | analytical |

`not_evaluated` is a real status and appears where there is nothing to judge: a golden with no
`definition_ids`, a `null` expected value (not-availability is the render contract's job, not a cell search),
or a warehouse the runner could not open.

`must_not` is a **lexical screen and only that**: it catches a memo that reproduces the forbidden phrase, not a
memo that draws the forbidden conclusion in other words. The real judgement is the Question and Method
reviewers; the assertion is a cheap floor under them. `expected.must_state` is not asserted here for the same
reason — a reviewer judges it, in words.

## Analytical and infrastructure, kept apart

An analysis that reaches the wrong outcome and a runner that could not start are different facts, and an eval
that conflates them reports a broken warehouse as a bad answer.

| Case outcome | Means |
| --- | --- |
| `pass` | every evaluated assertion held |
| `fail` | at least one assertion failed; `failure_category` says `analytical` or `infrastructure`, and infrastructure wins when both are present, because an infrastructure failure makes the analytical verdicts untrustworthy |
| `error` | the machinery failed before a verdict was possible — the analyzer threw, `new finding` refused, the produced directory had no manifest. Nothing is claimed about the Analysis and `assertions` is empty. |
| `not_run` | the analyzer declined, usually because there is no recorded run for this golden. Not a failure and not a pass. |

In the report these arrive as `eval_case_failed` (analytical) and `eval_infrastructure` (everything else).

## The record

```json
{
  "schema_version": "0.1.0",
  "case": "onboarding_checklist_retention",
  "outcome": "pass",
  "failure_category": null,
  "reason": "every assertion held (9 checked, 0 not evaluated)",
  "analyzer": { "name": "fixture", "exercised": true, "source": "fixtures/runs/4ka-…/output" },
  "finding": { "dir": "…", "id": "fnd_7k2m9q4w1xzb", "state": "complete", "outcome": "answered" },
  "assertions": [ { "id": "outcome", "status": "pass", "category": "analytical", "expected": "…", "observed": "…" } ],
  "model": null,
  "skill_versions": { "setup-aftergrid": "unversioned" },
  "plugin_version": "0.0.0",
  "git_sha": "…",
  "aftergrid_version": "0.0.0",
  "started": "…", "finished": "…",
  "cost": { "input_tokens": null, "output_tokens": null, "usd": null }
}
```

`model` is null when no model ran. Every cost field is null until something reports one: an unknown cost is
`null`, never `0`. `skill_versions` reads `version` from each promoted skill's frontmatter and records
`unversioned` where a skill carries none.

## What an eval never does

- Approve anything. Readiness is reported `unknown` with the reason, and publication stays what
  `aftergrid check` says against a human APPROVED review.
- Validate a Finding's evidence. References, hashes and Checks are `aftergrid check`'s job; `evidence` in the
  eval report is `not_evaluated` and says so.
- Edit a Finding, or write into the Instance it was pointed at.
- Turn a declined case into a pass, or a crashed analyzer into a wrong answer.
