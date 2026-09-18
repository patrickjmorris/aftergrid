# Observed skill trial, 2026-09-17

An independent Codex agent received a temporary directory containing the case prompts, CSVs and skill files.
It received no answer key, repository history, intended conclusion or other agents' work. It was instructed to
use only those inputs and write its own calculations and analysis. The four tasks ran serially in that one
agent; they are not independent model replications or a controlled comparison against an unskilled baseline.

The original artifacts are retained unchanged in [outputs/](../outputs/README.md), including the agent's
[command log](../outputs/command-log.md). Source hashes are in [input-hashes.json](input-hashes.json).
The coordinator reran all four Python calculation scripts after copying the artifacts into the repository;
each result matched the saved JSON exactly. [verification.json](verification.json) records that check.
The five skill entrypoints actually used matched the source at the time of verification.

| Task | Observed behavior | Evidence |
| --- | --- | --- |
| Conversion diagnosis | Reproduced 8.8% → 6.2%, reconciled mix and within-channel effects, declined to infer a product cause | [Answer](../outputs/conversion/answer.md), [code](../outputs/conversion/calculate.py), [stdout](../outputs/conversion/stdout.json) |
| MRR diagnosis | Reconciled $430 → $440; separated $90 entry from the $80 net loss among starting accounts | [Answer](../outputs/revenue/answer.md), [code](../outputs/revenue/calculate.py), [stdout](../outputs/revenue/stdout.json) |
| Claim review | Confirmed 60%/40% arithmetic, challenged the causal claim and mandate, and caught the forecast's switched denominator | [Review](../outputs/review/review.md), [code](../outputs/review/calculate.py) |
| Lesson reuse | Saved a proposed lesson, retrieved it in a new plan, checked unchanged scope and found a partial mix reversal plus paid-rate improvement | [Lesson](../outputs/learning/lessons/conversion-mix.md), [plan](../outputs/learning/plan.md), [answer](../outputs/learning/answer.md), [execution log](../outputs/learning/execution-log.md) |

The follow-up agent used baseline weights for within-channel change and current rates for mix: +0.8 and
+1.0 percentage points. The teaching verifier uses the opposite ordering: +0.6 and +1.2 points. Both sum to
+1.8 points. The interaction allocation differs; neither is a causal attribution. The agent stated its
convention instead of forcing agreement with an unseen answer key.

The skills were usable without an Engine or external connector. The agent disclosed that its initial plans
followed source inspection and were not pre-registration. It saved the follow-up plan before reading that
extract. Review used one agent's serial method/question/reader passes, not fabricated independent reviewers.
The [usability note](../outputs/skill-usability.md) records the remaining planning-order ambiguity.

These trials establish that one agent used five skills successfully on four bounded synthetic tasks, with
inspectable outputs. They do not establish general accuracy, model superiority, cross-host runtime parity,
causal identification, human comprehension or publication approval.

To rerun the computations from `examples/skills-lab/`, with Python 3 installed:

```bash
python3 outputs/conversion/calculate.py
python3 outputs/revenue/calculate.py
python3 outputs/review/calculate.py
python3 outputs/learning/calculate.py
python3 outputs/verify_artifacts.py
```
