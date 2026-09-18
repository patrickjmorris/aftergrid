---
title: The metric moved. Find out what moved with it.
description: Reconcile the total, separate composition from within-group change, and keep arithmetic explanations distinct from causal ones.
kicker: Fieldnote · Diagnosis
---

A rate fell. Someone remembers a recent product change. The explanation arrives before the analysis: the change must have hurt conversion.

A useful diagnosis slows that association down long enough to ask whether the measurement changed, the population changed, or performance within comparable groups changed. All three can move a dashboard. They call for different responses.

## Begin with the denominator

The [conversion teaching case](../examples/conversion-mix.md) has four synthetic rows. Direct traffic converts at 10% in the baseline period and 11% in the current period. Paid traffic improves from 4% to 5%. Yet overall conversion falls from 8.8% to 6.2%.

The total is correct. The population changed. Direct traffic went from 80% of eligible sessions to 20%, while paid traffic went from 20% to 80%. More of the current period came from the channel with the lower conversion rate.

An average of the two channel rates would give each channel equal importance. The reported conversion rate must instead be total signups divided by total eligible sessions. Reconstructing that total is the first check, before any narrative about why it changed.

## Make the decomposition add up

For this case, hold channel rates at their baseline values while changing the channel weights. That produces a composition contribution of −3.6 percentage points. Then apply each channel's rate improvement using the current weights. That contributes +1.0 point. Together they account for the observed −2.6-point movement.

This is a specified arithmetic decomposition. A different ordering can allocate an interaction term differently when weights and rates both change. State the convention, reconcile it to the total, and avoid treating the parts as natural constants.

Here the result gives a clear operational lead: inspect the acquisition shift before interpreting the aggregate decline as a worse signup experience. It does not prove the product change had no effect. Channels are broad categories; user intent, devices, campaigns, or measurement could have changed within them. The extract has no experimental assignment or change log.

## Check whether the metric stayed the same

Before decomposing a real movement, establish that the two periods measure comparable things. A tracking release may exclude a class of sessions. A timezone change may move late-night events across date boundaries. A new deduplication rule may lower a count without changing behavior.

Those possibilities need evidence: release records, event volumes, null rates, distinct keys, or reconciliation against an independent source. A list of possible causes is only a research plan. Report which possibilities were checked, which were supported, and which remain open.

Use a prompt that asks for that distinction:

```text
/diagnose-change Conversion fell last week. Reconstruct the reported
numerator and denominator, check measurement continuity, and separate
composition from within-group movement. Reconcile contributions to
the total. For each explanation, show its evidence and what could
disconfirm it. Name what the supplied data cannot establish.
```

## Counts need bridges too

The same discipline works without a rate. In the [revenue case](../examples/revenue-bridge.md), contracted MRR increases from $430 to $440. New business adds $90; expansion adds $20; contraction subtracts $20; churn subtracts $80.

The net gain is $10. The customers present at baseline contribute $350 at the end, down from $430. A growth headline and a retention concern can therefore both be accurate. The bridge exposes what the aggregate conceals.

With five synthetic account rows, this is a lesson in accounting for movement, not a reliable forecast or an industry benchmark. The next investigation should examine the losses and their context. It should not pretend the extract can tell the founder how to allocate a budget optimally.

## Finish with a narrower decision

A diagnosis is useful when it changes what someone investigates or does next. “Conversion declined” repeats the chart. “The shift toward paid sessions more than offsets the measured gains within channels” identifies a mechanism in the supplied counts and directs the next question.

Keep that sentence separate from a causal claim. Arithmetic tells us how a total is composed. Establishing why people behaved differently requires evidence about the process that produced those components.
