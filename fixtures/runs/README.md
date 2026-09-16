# Recorded skill runs

A recorded run is a skill's input and its expected output, frozen as files, so a skill that reasons with a model
in the loop still has a regression test that runs without one. Each run holds `input/`, `output/` and a
`run.yaml` naming the skill version, the model (or the absence of one), both content digests and what the
reviewer said.

**A recorded run is evidence of a contract, not of a model.** It establishes that following the skill's steps
from `input/` lands on `output/`, and that `output/` is a Finding `aftergrid check` calls evidence-valid and
`aftergrid render` will write. It establishes nothing about how a model behaves: `run.yaml` says
`model: recorded by hand (no model run)`, and the skill-level model evaluation is the nightly Golden Questions
(`docs/contracts/golden-questions.md`), not this directory.

| Run | Skill | Reader profile | Outcome | What it covers |
| --- | --- | --- | --- | --- |
| `kpc-numeric` | `/write-finding` | `product_owner` (named) | `answered` | A causal Claim earned by randomised assignment, an exploratory associational Claim, a chart, two tables, five derived values, a typed target. |
| `kpc-insufficient` | `/write-finding` | `generic` (fallback) | `insufficient_data` | A non-answer written honestly: no invented number, no falsifier evaluated, a non-numeric Claim, two typed assumptions, and no causal wording anywhere. |

## This directory is an Instance root

`aftergrid.yaml`, `readers.md` and `definitions/` sit here so each recorded Finding can be checked where it
sits — `check` resolves `definitions[].path` and the Reader profile against the nearest `aftergrid.yaml` above
the Finding directory:

```bash
node src/cli.ts check fixtures/runs/kpc-numeric/output
node src/cli.ts check fixtures/runs/kpc-numeric/output --mode rerun   # re-executes against inputs/
```

The definitions and readers file are byte copies of `fixtures/instance/analytics`, because the recorded
Findings pin their content hashes. Nothing here is real; the company is the same fictional "Loop".

## What is inside a run

```
kpc-numeric/
  run.yaml          # skill version, model, both digests, what check and render reported, reviewer outcome
  input/            # the Analysis directory: manifest + analysis.yaml + inputs/ queries/ checks/ results/
  output/           # the complete Finding: the same evidence, plus memo.md, claims, charts, tables, derived
```

`input/` and `output/` hold byte-identical `inputs/`, `queries/`, `checks/`, `results/` and `analysis.yaml`.
That is the point: `src/writer.test.ts` asserts the difference between the two directories is exactly the set
of fields `/write-finding` owns, so a writer that edited a query or a saved result would fail.

`render/` output is not committed. It is generated, it is excluded from the content digest, and the test
renders into a temporary copy instead.

## Regenerating

By hand, and deliberately. A recorded run exists to notice a change, so re-pinning it to match new behaviour
is a decision, not a chore: change the files, re-pin `content_digest` with `digestOf` from
`scripts/lib/validate-finding.mjs`, update both digests and the `verification` block in `run.yaml`, and say in
the pull request what the skill now does differently.

# Recorded runs

Finished Finding directories, replayed by the golden eval's fixture analyzer so the assertion machinery can be
tested without a model in the loop. Contract: [`docs/contracts/eval.md`](../../docs/contracts/eval.md).

```
fixtures/runs/<golden id>/output/          # a recorded run for that Golden Question
fixtures/runs/4ka-<golden id>/output/      # the same thing, named by the bead that recorded it
```

`createFixtureAnalyzer` looks for the plain id first, then the `4ka-` prefixed directory, and **declines** when
neither exists. A declined case is recorded `not_run` with the reason; it is never a pass.

## What is here

| Directory | Golden Question | Provenance |
| --- | --- | --- |
| `4ka-onboarding_checklist_retention/output` | `onboarding_checklist_retention` | Copy of the reviewed exemplar `fixtures/instance/analytics/findings/2026-07-20-onboarding-checklist-retention`, minus `render/`. |
| `4ka-price_change_cancellations/output` | `price_change_cancellations` | Copy of the reviewed exemplar `fixtures/instance/analytics/findings/2026-09-15-price-change-cancellations`, minus `render/`. |

**No model produced either of these.** They are hand-authored exemplars replayed as if an analyzer had produced
them, which is enough to exercise every assertion and nothing more. `model` is `null` in the resulting record,
and the first end-to-end eval with a live model has not been run.

`render/` is left out because the eval reads the manifest, the memo and the saved results only; a render is
regenerated from validated source.
