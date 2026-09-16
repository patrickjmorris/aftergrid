---
finding: fnd_9d4h6m2s8xkp
revision: 1
---

# Too early to tell whether the price change made more people cancel

## Answer

We cannot tell yet. Only {{ref:since_change.post.days_elapsed}} days of data exist since the price change, and the team's own rule is to wait for {{ext:minimum_days}} days and {{ext:minimum_cancellations}} cancellations before comparing.

<!-- material_caveat -->
This is not evidence that the price change is fine. It is evidence that we cannot tell yet. The day count is met once {{ref:since_change.post.earliest_window_end}} has closed; an answer also needs {{ext:minimum_cancellations}} cancellations and an approved definition, so it may still be too early then.

## Decision it informs

Whether to keep the new price, roll it back, or wait. Dana owns the decision. This analysis cannot choose between keeping and rolling back; Dana decides whether to wait or to use other evidence.

## Evidence

### Only {{ref:since_change.post.days_elapsed}} days and {{ref:since_change.post.cancellations}} cancellations have accumulated since the price change; the policy needs {{ext:minimum_days}} days and {{ext:minimum_cancellations}} cancellations before a comparison is made. <!-- claim: c1 -->

<!-- table: since_change_table -->

Who is counted: the {{ref:since_change.post.active_at_change}} paid subscriptions that were active when the price changed on the eighth of September. Cancellations are counted from that day through the fourteenth, the last full day of data.

Compared with what: not with the weeks before the change, but with the minimum the analysis policy requires. We are {{derived:days_short}} days and {{derived:cancellations_short}} cancellations short of it. The day count is first met when {{ref:since_change.post.earliest_window_end}} has closed; the cancellation count may or may not be met by then.

Left out: subscriptions that started after the price change never saw the old price and are not part of this population.

Limits: the cancellation number is a raw count, not the weekly cancellation rate, which is still a proposed definition and has not been approved.

### The cancellations so far are not compared with the weeks before the change, because the first days after a price change mix people reacting to the announcement with normal cancellations. <!-- claim: c2 -->

A partial first week set against full earlier weeks would compare unlike things and invite a conclusion the data cannot support. No daily series is shown here, so this Finding says nothing about whether cancellations spiked in the first days; that would need its own evidenced claim.

## How we checked

- No subscription is counted twice (Check unique_subscriptions). Every Check below was run by the Operator's own tool and reported to aftergrid, which did not run them; the tool's output for each is saved beside this Finding.
- The policy minimum is not yet met (Check minimum_data, which failed as expected; that failure is the result of this Finding, not an error).
- The question's own test, whether cancellations rose after the change, could not be run yet (Check falsifier_cancel_rate, not run until the minimum is met).
- Definition cited: weekly_cancellation_rate v1, proposed and not approved, so no rate is shown.
- Data: the Operator's own tool read the subscriptions through the fourteenth of September, directly from the source. No copy was kept, so these numbers can be replayed exactly as saved, and the queries cannot be rerun against anything here.
- Method review: recorded by the exemplar author. No human has approved this Finding for publication; it is a draft.
- What none of this establishes: the Checks were reported, not executed here, so a passing Check is the tool's word and the guardrail that watches shell commands never saw whatever the tool did.

## What would change our mind

Once {{ext:minimum_days}} days and {{ext:minimum_cancellations}} cancellations have accumulated, the belief that the price change did not raise cancellations is wrong if the daily cancellation rate after the change is more than a fifth higher than in the {{ext:minimum_days}} days before it (Check falsifier_cancel_rate, expected to pass).

On a re-check with newer data, the first claim is re-tested by restating whether both policy minimums are met on the same population; it stops holding, and this Finding should be redone with the full comparison, only once both are met. The second claim is a method choice, not a measurement; Dana decides when to retire it.

## Appendix

- Query: cancellations_since_change, under queries/.
- Result: since_change, under results/.
- Retained input: none. What was run is in the manifest: the query text, the parameters, the tool that ran it, and the hash of everything it produced.
- Check evidence: the tool's output for each Check, under checks/evidence/, hashes in the manifest.
- Parameters: analytical timezone America/New_York; change date eighth of September; data through the fourteenth; policy minimums as declared under external sources, and passed to the query as parameters so the earliest window end and the minimum-met flag are computed from the same numbers.
