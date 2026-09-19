---
title: Retention was 50% higher. Did onboarding cause it?
description: A mandate and a forecast sitting on a self-selected 60% vs 40%.
kicker: Worked example · Synthetic data · Review
---

A draft says onboarding lifts retention by 50%, so every new user should have to finish it, and next month's retained users will rise by half. The counts are correct. The claim, the mandate, and the forecast are not.

Synthetic teaching case, two rows. The caution for [analysis-review](../skills/analysis-review.md): a review has to be able to change the verdict to "inconclusive."

## The draft and the data

One signup cohort. Users chose whether to complete onboarding in week one. Retained means at least one qualifying activity in week four, and both groups have finished that window. No random assignment, prior engagement, channel, device, or experiment.

| Completed onboarding | Eligible users | Retained in week 4 | Retention |
| --- | ---: | ---: | ---: |
| Yes | 100 | 60 | 60% |
| No | 100 | 40 | 40% |

Completers retain at 60%, non-completers at 40%: 20 percentage points, or 50% relative to the lower rate. Pooled retention is 100 / 200 = 50%.

## What the numbers do not license

Self-selection produces the same table if people already likely to return are also more likely to finish onboarding. Completing by choice is not the same exposure as being made to complete, and a mandate adds friction the extract never measures.

The "retained users up by half" forecast compounds those errors. Even if all 200 users retained at the completer rate, that is 120 versus 100: a 20% increase, not 50%. And that scenario is not an estimate. The data do not identify an intervention effect at all.

A useful review keeps the 60% versus 40% description, puts the self-selection limit beside it, and recommends testing an assigned policy before requiring the checklist. It does not "fix" the headline by inventing an experiment.

## What a recorded review did

An isolated Codex agent ran `analysis-review` on this draft without the answer key. Its [review](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/outputs/review/review.md) separates the correct arithmetic from the causal claim, the mandate, and the forecast. A rerun reproduced the [saved calculation](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/outputs/review/calculate.py). One synthetic case is not a benchmark.

That is the pstack bar applied to analytics: check the claim against the artifact, calculate independently, and allow "inconclusive" as the answer. Correct arithmetic is not a business decision.

## Run it yourself

No clone needed. `analysis-review` is model-invoked, so ask in plain language:

```text
Use analysis-review on this draft: "Onboarding lifts retention by 50%.
Require it for every new user; next month's retained users will rise
by half."

Data: https://raw.githubusercontent.com/patrickjmorris/aftergrid/main/examples/skills-lab/data/onboarding.csv

Check the rates, then try to disprove the causal claim, the mandate,
and the forecast. Name the minimum revision for each blocking issue.
```

From a checkout, `node examples/skills-lab/verify.mjs` checks the arithmetic. Inspect the [input CSV](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/data/onboarding.csv) and [case brief](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/cases/review.md). [Ask before you query](../fieldnotes/ask-before-query.md) is the teaching companion.
