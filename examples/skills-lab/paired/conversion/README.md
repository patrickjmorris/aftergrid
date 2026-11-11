# Paired run: conversion case, with and without diagnose-change

One synthetic case, answered twice by the same model: once without the skill, once with it. This is one run per
side. It is not a benchmark, and it does not show that the skill makes answers better in general.

## Setup

| | Baseline | With skill |
| --- | --- | --- |
| Date | 2026-11-11 | 2026-11-11 |
| Harness | T3 Code `delegate_task`, Codex provider | same |
| Model | `gpt-6.1-sol`, `reasoningEffort=high` | same |
| Started (UTC) | 18:44:30 | 18:44:33 |
| Prompt | [baseline/prompt.md](baseline/prompt.md) | [with-skill/prompt.md](with-skill/prompt.md), identical apart from the directory name |
| Directory contents | `case.md`, `data/conversion.csv` | the same two files plus `skills/diagnose-change/` |

Inputs are byte copies of [`cases/conversion.md`](../../cases/conversion.md) and
[`data/conversion.csv`](../../data/conversion.csv). The skill copy is `skills/diagnose-change` at commit
`1e1a59a8136b1e7776935454d1a2d0b09e425d02`. Each side's `SHA256SUMS` lists every file in its run directory at
the end of the run, inputs included. Neither agent received the answer key, `verify.mjs`, the 2026-09-17 trial
outputs, or a mention of the other run.

## Outputs

Everything under `baseline/analysis/` and `with-skill/analysis/` is what each agent wrote, unedited.

- Baseline: [report](baseline/analysis/report.md), [calculation](baseline/analysis/calculate.awk),
  [output](baseline/analysis/calculations.txt), [command log](baseline/analysis/command-log.md).
- With skill: [report](with-skill/analysis/report.md), [calculation](with-skill/analysis/calculate.py),
  [output](with-skill/analysis/calculations.json), [journal](with-skill/analysis/journal.md),
  [command log](with-skill/analysis/command-log.md).

## Arithmetic check

`node examples/skills-lab/verify.mjs` gives 8.8% → 6.2%, −3.6 pp from mix, +1.0 pp within channels. Both reports
reach those totals, and both report that each channel's rate rose by 1 pp. The baseline uses the same ordering as
`verify.mjs`. The with-skill run uses the other exact ordering. The interaction is zero here, so both orderings
give the same totals.

Both calculations were rerun from their run directories after the agents finished. The baseline AWK output
matched `calculations.txt` byte for byte. The with-skill script rewrites `calculations.json` when it runs. The
rewritten file matches the JSON the agent printed during its own run, which is in the run's activity log.
`SHA256SUMS` was taken after that rerun.

## What differed

Both runs reached the same numbers and the same recommendation: don't roll back on this evidence, and look into
the channel shift. The visible differences are in how the with-skill report handles evidence. It has a three-row
hypothesis ledger that includes a measurement or coverage artifact. It labels its composition test as
exploratory. It lists checks it could not run. It names what would change the recommendation. The baseline covers
the causal limits in prose and has no ledger or reversal trigger. The skill page's
[What the skill changed](../../../../docs/skills/diagnose-change.md#what-the-skill-changed) section quotes both.

## Limitations

- One run per side, on one four-row synthetic case. Another run of either arm could come out differently.
- Both children started in the aftergrid checkout. Their instructions confined them to their run directories,
  and their activity logs show every command used relative paths inside them. The Codex host may still have
  loaded the checkout's `AGENTS.md` into both contexts, and both arms had that same exposure.
- `case.md` itself names `diagnose-change`. The baseline agent noted that no skill was supplied and worked from
  the case directly.
- The case is a known teaching pattern, Simpson's paradox. A strong baseline on it says little about harder
  diagnoses.
- No human graded either answer. The comparison above lists observed differences in the text; it does not score
  them.
