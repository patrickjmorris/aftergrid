---
title: MRR grew. The starting customers shrank.
description: Reconcile new business, expansion, contraction, and churn before interpreting a positive revenue headline.
kicker: Worked example · Synthetic data
---

Contracted monthly recurring revenue increased from $430 to $440. The existing customer base contributed $350 at the end of the period, down from $430. New business covered the losses and left a small net gain.

Both statements are true. A bridge between the two snapshots makes the relationship visible.

This synthetic teaching case contains five account rows. It uses one currency and consistent month-end MRR rules, with no discounts, account merges, or currency changes. It describes contracted MRR, not recognized revenue, cash collected, or profit. The repository verifier checks the arithmetic; these are not customer results.

## Start at account grain

| Account | Baseline MRR | Current MRR | Movement |
| --- | ---: | ---: | --- |
| A | $100 | $120 | $20 expansion |
| B | $80 | $0 | $80 churn |
| C | $50 | $30 | $20 contraction |
| D | $0 | $90 | $90 new business |
| E | $200 | $200 | Unchanged |
| Total | $430 | $440 | $10 net growth |

Zero means no active recurring contract at the snapshot. Each account appears once. For this case, an account going from zero to a positive amount is classified as new business. With longer history, a real system may distinguish first-time customers from reactivations; two snapshots alone cannot resolve that distinction.

## Reconcile the bridge

```text
Baseline MRR        $430
+ new business       $90
+ expansion          $20
− contraction        $20
− churn              $80
= current MRR       $440
```

The total grows by $10, or approximately 2.3%. That growth rate tells us the net movement. It does not describe the health of the starting cohort.

Keep the baseline customer set fixed to calculate net revenue retention. Exclude account D because it had no baseline MRR. The remaining accounts finish with $350:

```text
Net revenue retention
  = (baseline + expansion − contraction − churn) / baseline
  = ($430 + $20 − $20 − $80) / $430
  = 81.4%
```

Including the new account in that numerator would produce a growth ratio, not retained revenue from the original base. Defining the cohort is part of defining the metric.

## Check before recommending

A useful check confirms that account IDs are unique, amounts are valid under the stated contract rules, and every movement is assigned to a mutually exclusive category. A second check reconciles the bridge to the ending total. Keep the source snapshots unchanged and retain the calculation code.

For a live business, also reconcile snapshot completeness, currency, timing, and account identity. A migration that changes account IDs can look like simultaneous churn and acquisition. A missing export can make healthy accounts look lost. The synthetic input rules deliberately remove those issues so the bridge is easy to inspect; real work needs evidence that they are absent.

## What should the founder do?

The bridge establishes that new business offsets losses from the starting accounts. It justifies examining account B's churn and account C's contraction before describing the month as healthy growth.

It does not settle whether the next week should go to acquisition or retention. The extract lacks acquisition costs, reasons for cancellation, tenure, margins, and the likely impact of available interventions. It is the complete supplied population of five accounts, not a basis for a precise forecast or a broad industry comparison.

The recommendation should therefore name a next investigation: understand the two losses, check whether they are preventable or recurring, and compare that evidence with acquisition economics. Avoid a confident resource-allocation prescription that the data cannot support.

## Run it yourself

An isolated Codex agent completed this case using `diagnose-change`, without the answer key. Its [original answer](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/outputs/revenue/answer.md) separates the revenue bridge from the founder's resource decision; its [calculation](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/outputs/revenue/calculate.py) reproduces the numbers above. A coordinator rerun matched the saved output. See the [trial record](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/runs/README.md) for the bounded setup and limitations.

```text
/diagnose-change Read examples/skills-lab/cases/revenue.md and
analyze examples/skills-lab/data/recurring-revenue.csv. Build the MRR
bridge, calculate retention for the starting accounts, and distinguish
what is established from what the founder still needs to decide.
Save the calculations and executed code.
```

Use `$diagnose-change` in Codex. Verify the fixture with `node examples/skills-lab/verify.mjs`. The [source CSV](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/data/recurring-revenue.csv), [case brief](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/cases/revenue.md), and [verifier](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/verify.mjs) are available for inspection. Use [define-metric](../skills/define-metric.md) to make your own MRR and retention rules explicit before applying this pattern to a warehouse.
