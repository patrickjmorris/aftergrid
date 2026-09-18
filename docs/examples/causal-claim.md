---
title: Retention was 50% higher. Did onboarding cause it?
description: A precise 60% versus 40% comparison that does not identify what a mandatory checklist would do.
kicker: Worked example · Synthetic data · Review
---

A draft says onboarding lifts retention by 50%, so every new user should be required to finish it, and next month’s retained users will rise by half. The counts in the extract are correct. The claim, the mandate, and the forecast are not.

This is a synthetic teaching case with two rows. It is the caution for [analysis-review](../skills/analysis-review.md): a review must be able to change the verdict to “inconclusive.” It is not a customer result.

## The draft and the data

Users in one signup cohort chose whether to complete onboarding in their first week. Retained means at least one qualifying activity in week four. Both groups have finished that window. There is no random assignment, prior engagement, channel, device, or experiment.

| Completed onboarding | Eligible users | Retained in week 4 | Retention |
| --- | ---: | ---: | ---: |
| Yes | 100 | 60 | 60% |
| No | 100 | 40 | 40% |

Completers retain at 60%, non-completers at 40%. The gap is 20 percentage points. Relative to the lower rate, that is a 50% difference. Pooled retention is 100 / 200 = 50%.

## What the numbers do not license

Self-selection can produce the same table if people already likely to return are also more likely to finish onboarding. Completing voluntarily is not the same exposure as being required to complete. A mandate can add friction the extract never measures.

The “next month, retained users up by half” forecast mixes those errors. Even a purely arithmetic world where all 200 users retained at the completer rate would be 120 versus 100 — a 20% increase in retained users, not 50%. That scenario is not an estimate. The data do not identify an intervention effect at all.

A useful review keeps the 60% versus 40% description, places the self-selection limit next to it, and recommends evaluating an assigned policy before requiring the checklist. It does not “fix” the headline by inventing an experiment.

## What a recorded review actually did

An isolated Codex agent used `analysis-review` on this draft without the answer key. Its [review](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/outputs/review/review.md) separates the correct group arithmetic from the causal claim, the mandate, and the forecast. A coordinator rerun reproduced the [saved calculation](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/outputs/review/calculate.py). One successful synthetic case is not an accuracy benchmark.

That is the pstack bar applied to analytics: inspect the claim against the artifact, calculate independently, and allow “inconclusive” as the answer. Passing arithmetic is not proof of a business decision.

## Run it yourself

From a checkout of the repository:

```text
Use analysis-review on the draft in examples/skills-lab/cases/review.md
with examples/skills-lab/data/onboarding.csv. Check the rates, then
try to disprove the causal claim, the mandate, and the forecast.
Save the code you ran and the minimum revision for each blocking issue.
```

In Codex, use `$analysis-review` if the host exposes it, or the same plain-language request. Independently:

```bash
node examples/skills-lab/verify.mjs
```

Inspect the [input CSV](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/data/onboarding.csv), [case brief](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/cases/review.md), and [Ask before you query](../fieldnotes/ask-before-query.md), which is the teaching companion.
