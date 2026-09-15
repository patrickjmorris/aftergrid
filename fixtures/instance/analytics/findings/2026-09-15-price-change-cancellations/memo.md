---
finding: fnd_3p8r5t2y7vnc
revision: 1
---

# Too early to tell whether the price change made more people cancel

## Answer

We cannot tell yet. Only {{ref:since_change.post.days_elapsed}} days of data exist since the price change, and the team's own rule is to wait for {{ext:minimum_days}} days and {{ext:minimum_cancellations}} cancellations before comparing.

<!-- material_caveat -->
This is not evidence that the price change is fine. It is evidence that we cannot tell yet. The earliest day we can is {{ref:since_change.post.earliest_eligible_date}}.

## Decision it informs

Whether to keep the new price, roll it back, or wait. Dana owns the decision. The honest option today is to wait; nothing here supports rolling back or declaring success.

## Evidence

### Only {{ref:since_change.post.days_elapsed}} days and {{ref:since_change.post.cancellations}} cancellations have accumulated since the price change; the policy needs {{ext:minimum_days}} days and {{ext:minimum_cancellations}} cancellations before a comparison is made. <!-- claim: c1 -->

<!-- table: since_change_table -->

Who is counted: the {{ref:since_change.post.active_at_change}} paid subscriptions that were active when the price changed on the eighth of September. Cancellations are counted from that day through the fourteenth, the last full day of data.

Compared with what: not with the weeks before the change, but with the minimum the analysis policy requires. We are {{derived:days_short}} days and {{derived:cancellations_short}} cancellations short of it. The earliest day the comparison is allowed is {{ref:since_change.post.earliest_eligible_date}}.

Left out: subscriptions that started after the price change never saw the old price and are not part of this population.

Limits: the cancellation number is a raw count, not the weekly cancellation rate, which is still a proposed definition and has not been approved.

### The cancellations so far are not compared with the weeks before the change, because the first days after a price change mix people reacting to the announcement with normal cancellations. <!-- claim: c2 -->

A partial first week set against full earlier weeks would compare unlike things and invite a conclusion the data cannot support. If cancellations had spiked sharply in the first days, that would be visible in the daily count even without a comparison; nothing so far looks like that, but "does not look like" is a judgement, not a measurement.

## How we checked

- No subscription is counted twice (Check unique_subscriptions).
- The policy minimum is not yet met (Check minimum_data, which failed as expected; that failure is the result of this Finding, not an error).
- The question's own test, whether cancellations rose after the change, could not be run yet (Check falsifier_cancel_rate, not run until the minimum is met).
- Definition cited: weekly_cancellation_rate v1, proposed and not approved, so no rate is shown.
- Data: a retained copy of all subscriptions through the fourteenth of September. The numbers can be replayed from the saved results and rerun against the retained copy.
- Method review: recorded by the exemplar author. No human has approved this Finding for publication; it is a draft.

## What would change our mind

Once {{ext:minimum_days}} days and {{ext:minimum_cancellations}} cancellations have accumulated, the belief that the price change did not raise cancellations is wrong if the daily cancellation rate after the change is more than a fifth higher than in the {{ext:minimum_days}} days before it (Check falsifier_cancel_rate, expected to pass).

On a re-check with newer data, the first claim is re-tested by restating how many days have accumulated; it stops holding, and this Finding should be redone with the full comparison, once the day count reaches {{ext:minimum_days}}. The second claim is a method choice, not a measurement; Dana decides when to retire it.

## Appendix

- Query: cancellations_since_change, under queries/.
- Result: since_change, under results/.
- Retained input: inputs/subscriptions.csv, hash in the manifest.
- Parameters: analytical timezone America/New_York; change date eighth of September; data through the fourteenth; policy minimums as declared under external sources, and passed to the query as parameters so the earliest eligible date is computed from the same numbers.
