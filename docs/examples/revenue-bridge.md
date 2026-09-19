---
title: MRR grew. The starting customers shrank.
description: Headline +$10. Starting customers −$80. Reconcile before you celebrate.
kicker: Worked example · Synthetic data
---

Contracted MRR rose from $430 to $440. The customers present at baseline ended at $350, down from $430. New business covered the losses and left a small net gain.

Both statements are true. A bridge between the two snapshots shows how.

Synthetic teaching case, five account rows, one currency, month-end MRR rules. Contracted MRR, not recognized revenue, cash, or profit. The repository verifier checks the arithmetic.

## Start at account grain

| Account | Baseline MRR | Current MRR | Movement |
| --- | ---: | ---: | --- |
| A | $100 | $120 | $20 expansion |
| B | $80 | $0 | $80 churn |
| C | $50 | $30 | $20 contraction |
| D | $0 | $90 | $90 new business |
| E | $200 | $200 | Unchanged |
| Total | $430 | $440 | $10 net growth |

Zero means no active contract at the snapshot. Each account appears once. Zero to positive counts as new business here; with longer history you would separate first-time customers from reactivations, which two snapshots cannot do.

## Reconcile the bridge

```text
Baseline MRR        $430
+ new business       $90
+ expansion          $20
− contraction        $20
− churn              $80
= current MRR       $440
```

The total grows $10, about 2.3%. That is the net movement, not the health of the starting cohort.

Hold the baseline customer set fixed for net revenue retention. Account D had no baseline MRR, so it is out. The rest finish at $350:

```text
Net revenue retention
  = (baseline + expansion − contraction − churn) / baseline
  = ($430 + $20 − $20 − $80) / $430
  = 81.4%
```

Putting the new account in that numerator gives a growth ratio, not retention of the original base. Defining the cohort is part of defining the metric.

## Check before recommending

Check that account IDs are unique, amounts are valid under the contract rules, and every movement lands in exactly one category. Then reconcile the bridge to the ending total. Keep the snapshots unchanged and the calculation code.

On live data, also check snapshot completeness, currency, timing, and account identity. An ID migration looks like churn plus acquisition. A missing export makes healthy accounts look lost. The synthetic rules remove those problems so the bridge is easy to inspect; real work needs evidence they are absent.

## What should the founder do?

The bridge establishes that new business offset losses from the starting accounts. That justifies looking at B's churn and C's contraction before calling the month healthy growth.

It does not settle whether next week goes to acquisition or retention. There are no acquisition costs, cancellation reasons, tenure, margins, or intervention estimates here. Five accounts are the whole supplied population, not a forecast or an industry comparison.

So the recommendation names a next investigation: understand the two losses, check whether they are preventable or recurring, and weigh that against acquisition economics. Not a confident allocation the data cannot support.

## Run it yourself

An isolated Codex agent completed this case with `diagnose-change`, without the answer key. Its [answer](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/outputs/revenue/answer.md) separates the bridge from the founder's decision; its [calculation](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/outputs/revenue/calculate.py) reproduces the numbers above. A rerun matched. [Trial record](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/runs/README.md).

No clone needed (`$diagnose-change` in Codex):

```text
/diagnose-change MRR grew from $430 to $440. Is the business healthy?

Use https://raw.githubusercontent.com/patrickjmorris/aftergrid/main/examples/skills-lab/data/recurring-revenue.csv

Build the MRR bridge, calculate retention for the starting accounts,
and separate what is established from what the founder still has to
decide. Save the calculations.
```

From a checkout, `node examples/skills-lab/verify.mjs` checks the arithmetic. Inspect the [source CSV](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/data/recurring-revenue.csv), [case brief](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/cases/revenue.md), and [verifier](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/verify.mjs). Use [define-metric](../skills/define-metric.md) to pin your own MRR and retention rules before applying this to a warehouse.
