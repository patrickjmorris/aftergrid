---
title: Conversion recovered. Was it the same mechanism?
description: A second extract retrieves the mix-shift lesson, tests it, and finds mix and within-channel movement both contributing.
kicker: Worked example · Synthetic data · Lesson reuse
---

The first [conversion case](conversion-mix.md) ended with a proposed lesson: before interpreting an aggregate conversion move, recompute the pooled rate from counts and decompose mix versus within-channel change. This follow-up asks whether that lesson changes the next analysis, or whether it becomes a story the agent repeats without checking.

This is a synthetic teaching case. An isolated Codex agent completed it after the first case, without the answer key. Sequential tasks in one agent are not independent sessions or an accuracy benchmark.

## The second question

Conversion recovered in the next comparable period. The source grain and counting rules are unchanged: one row per period and exclusive channel, eligible sessions and signups, sessions not unique people. The baseline here is the earlier case’s current period. No intervention log, costs, or user-level records are supplied.

| Period | Channel | Eligible sessions | Signups | Conversion |
| --- | ---: | ---: | ---: | ---: |
| Baseline | Direct | 2,000 | 220 | 11.0% |
| Baseline | Paid | 8,000 | 400 | 5.0% |
| Current | Direct | 4,000 | 440 | 11.0% |
| Current | Paid | 6,000 | 360 | 6.0% |

Baseline pooled rate: 620 / 10,000 = 6.2%. Current: 800 / 10,000 = 8.0%. The movement is +1.8 percentage points.

## What retrieval is supposed to change

A useful plan cites the earlier lesson, verifies that channel attribution is still exclusive and complete, and adds the mix/rate reconciliation before treating “recovery” as the reverse of the previous decline. Direct conversion is still 11%. Paid conversion rises from 5% to 6%. Paid’s session share falls from 80% to 60%.

One exact decomposition, assigning interaction to the mix term, is:

```text
Mix contribution
  = (40% − 20%) × 11% + (60% − 80%) × 5%
  = +1.2 percentage points

Within-channel contribution
  = 40% × (11% − 11%) + 60% × (6% − 5%)
  = +0.6 percentage points

Total = +1.2 + 0.6 = +1.8 percentage points
```

The earlier decline was mostly mix. This recovery is mix and a paid-rate improvement together. Repeating “it was mix last time” would miss half the movement and would treat a prior observation as a mechanism that must recur.

The other exact ordering exists; it reallocates the interaction and still sums to +1.8. The [trial record](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/runs/README.md) notes that the isolated agent used that other ordering. Both conventions are arithmetic identities. Neither identifies a product or campaign cause.

## What the saved run actually did

The agent’s [proposed lesson](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/outputs/learning/lessons/conversion-mix.md) stays scoped to the measurement rules and marks itself proposed. Its [follow-up plan](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/outputs/learning/plan.md) cites that lesson and adds the composition check. Its [answer](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/outputs/learning/answer.md) reports both a partial mix reversal and improved paid conversion.

That is the Compound Engineering bar applied to analytics: capture a demonstrated lesson, retrieve it on a later question, and show the check that changed. A sentence that says “I considered prior learnings” is not enough.

## Run it yourself

Complete the first conversion case, then:

```text
/learn-from-analysis Capture the acquisition-mix lesson from the
conversion analysis you just ran. Keep it scoped, link the evidence,
and mark it proposed.

/plan-analysis Read examples/skills-lab/cases/learning.md and that
lesson. Plan the follow-up on examples/skills-lab/data/conversion-followup.csv.
State which lesson applies, which check it adds, and what would
invalidate it. Then run the plan.
```

In Codex, use `$learn-from-analysis` and `$plan-analysis`. Independently:

```bash
node examples/skills-lab/verify.mjs
```

Inspect the [follow-up CSV](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/data/conversion-followup.csv), [case brief](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/cases/learning.md), and [Analysis that compounds](../fieldnotes/analysis-that-compounds.md).
