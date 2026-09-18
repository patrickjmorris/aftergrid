---
title: Conversion fell. Both channels improved.
description: A four-row example of separating acquisition mix from changes in conversion within each channel.
kicker: Worked example · Synthetic data
---

Overall session-to-signup conversion fell from 8.8% to 6.2%. The rate within each acquisition channel improved. The difference is the traffic mix: far more sessions came from the channel with the lower conversion rate.

This is a synthetic teaching case with four rows. The arithmetic is checked by the repository's verifier. It illustrates how to inspect an agent's reasoning; it is not a customer result or a claim that every model will produce the same analysis.

## The question and the data

The growth lead wants to know whether to roll back the signup experience. The extract covers two comparable periods with the same session eligibility and channel attribution rules. Each eligible session belongs to exactly one channel; a signup is attributed to that session. Sessions are not unique people.

| Period | Channel | Eligible sessions | Signups | Conversion |
| --- | --- | ---: | ---: | ---: |
| Baseline | Direct | 8,000 | 800 | 10.0% |
| Baseline | Paid | 2,000 | 80 | 4.0% |
| Current | Direct | 2,000 | 220 | 11.0% |
| Current | Paid | 8,000 | 400 | 5.0% |

The input contains no randomized assignment, product change log, campaign cost, or user-level events. Those omissions limit the recommendation.

## Rebuild the reported rate

The baseline rate is 880 signups divided by 10,000 eligible sessions: 8.8%. The current rate is 620 divided by 10,000: 6.2%. The movement is −2.6 percentage points.

Taking the unweighted mean of the two channel rates would answer a different question. Direct and paid traffic have different weights, and those weights changed sharply. Direct traffic represented 80% of sessions before and 20% afterward.

First check the source grain and count bounds. There should be one row per period and channel; signup counts should be nonnegative and no greater than eligible sessions. Reconcile each period's counts before interpreting its rate.

## Account for all of the movement

Use baseline channel rates to measure the effect of changing weights, then current weights to measure the within-channel rate changes:

```text
Mix contribution
  = (20% − 80%) × 10% + (80% − 20%) × 4%
  = −3.6 percentage points

Within-channel contribution
  = 20% × (11% − 10%) + 80% × (5% − 4%)
  = +1.0 percentage point

Total = −3.6 + 1.0 = −2.6 percentage points
```

That identity reconciles exactly to the observed decline. It states the allocation convention so another analyst can reproduce it. The composition shift more than offsets the improvements within channels.

## Say what the analysis supports

These counts do not support treating the aggregate decline alone as evidence that the signup experience worsened. They support investigating the acquisition shift and its economics. The data do not establish that a product change had no effect: intent, device mix, or other factors could also have changed inside each channel.

A useful recommendation is to avoid a rollback based solely on the aggregate rate, inspect why paid sessions grew, and examine an experiment or comparable user-level evidence before assigning a product effect. The growth lead still owns the decision.

## Run it yourself

An isolated Codex agent completed this case using `diagnose-change`, without the answer key. Read its [original answer](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/outputs/conversion/answer.md) and [executed calculation](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/outputs/conversion/calculate.py). A coordinator rerun reproduced the saved output. The [trial record](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/runs/README.md) describes the setup and limits; one successful synthetic case is not an accuracy benchmark.

From a checkout of the repository, ask your agent:

```text
/diagnose-change Read examples/skills-lab/cases/conversion.md and
analyze examples/skills-lab/data/conversion.csv. Explain the decline,
reconcile the movement, and recommend the next investigation.
Save the code you ran and the evidence supporting the conclusion.
```

In Codex, use `$diagnose-change`. Run the fixture verifier separately:

```bash
node examples/skills-lab/verify.mjs
```

Inspect the [input CSV](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/data/conversion.csv), [case brief](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/cases/conversion.md), and [verification code](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/verify.mjs). Then try the [learning follow-up](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/cases/learning.md), where conversion recovers and the earlier explanation must be tested again. [Analysis that compounds](../fieldnotes/analysis-that-compounds.md) explains how to carry a useful lesson into that second question.
