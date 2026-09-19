---
title: Conversion fell. Both channels improved.
description: The rollback meeting. Total down, both channels up.
kicker: Worked example · Synthetic data
---

Session-to-signup conversion fell from 8.8% to 6.2%. Within each acquisition channel, the rate improved. The difference is mix: far more sessions came from the channel that converts worse.

Synthetic teaching case, four rows. The repository verifier checks the arithmetic. Not a customer result.

## The question and the data

The growth lead wants to know whether to roll back the signup experience. The extract covers two comparable periods with the same eligibility and attribution rules. Each eligible session belongs to one channel; a signup is attributed to its session. Sessions are not unique people.

| Period | Channel | Eligible sessions | Signups | Conversion |
| --- | --- | ---: | ---: | ---: |
| Baseline | Direct | 8,000 | 800 | 10.0% |
| Baseline | Paid | 2,000 | 80 | 4.0% |
| Current | Direct | 2,000 | 220 | 11.0% |
| Current | Paid | 8,000 | 400 | 5.0% |

No randomized assignment, product change log, campaign cost, or user-level events. Those gaps limit the recommendation.

## Rebuild the reported rate

Baseline: 880 signups over 10,000 eligible sessions, 8.8%. Current: 620 over 10,000, 6.2%. The movement is −2.6 percentage points.

The unweighted mean of the two channel rates answers a different question. Direct was 80% of sessions before and 20% after; the weights moved, not just the rates.

Check grain and bounds first: one row per period and channel, signups nonnegative and no greater than sessions. Reconcile each period's counts before interpreting its rate.

## Account for all of the movement

Baseline rates measure the effect of changing weights; current weights measure the within-channel change:

```text
Mix contribution
  = (20% − 80%) × 10% + (80% − 20%) × 4%
  = −3.6 percentage points

Within-channel contribution
  = 20% × (11% − 10%) + 80% × (5% − 4%)
  = +1.0 percentage point

Total = −3.6 + 1.0 = −2.6 percentage points
```

The identity reconciles to the observed decline and names its allocation convention so another analyst can reproduce it. Mix more than offsets the within-channel gains.

## Say what the analysis supports

The aggregate decline is not, on its own, evidence that the signup experience worsened. It is evidence to investigate the acquisition shift and its economics. The data do not clear the product either: intent, device mix, or other factors could have moved inside each channel.

Recommend no rollback on the aggregate alone, find out why paid sessions grew, and get an experiment or user-level evidence before assigning a product effect. The growth lead still owns the decision.

## Run it yourself

An isolated Codex agent completed this case with `diagnose-change`, without the answer key: its [answer](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/outputs/conversion/answer.md) and [calculation](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/outputs/conversion/calculate.py). A rerun reproduced the saved output. The [trial record](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/runs/README.md) has the setup and limits; one synthetic case is not a benchmark.

No clone needed. Paste this into your agent (`$diagnose-change` in Codex):

```text
/diagnose-change Conversion fell from 8.8% to 6.2%. Should we roll
back signup?

Use https://raw.githubusercontent.com/patrickjmorris/aftergrid/main/examples/skills-lab/data/conversion.csv

Reproduce the movement. Separate mix from within-channel change.
Show the calculations. Do not recommend a rollback from the aggregate
alone.
```

From a checkout, `node examples/skills-lab/verify.mjs` checks the arithmetic independently. Inspect the [input CSV](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/data/conversion.csv), [case brief](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/cases/conversion.md), and [verifier](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/verify.mjs). Then try the [lesson-reuse follow-up](lesson-reuse.md), where conversion recovers and the earlier explanation has to be tested again.
