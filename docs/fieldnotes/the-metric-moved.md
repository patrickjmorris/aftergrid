---
title: The metric moved. Now what?
description: Separate the arithmetic from the story.
kicker: Fieldnote · Diagnosis
---

A rate fell. Someone remembers a recent product change. The explanation arrives before the analysis: the change must have hurt conversion.

A useful diagnosis slows that down long enough to ask whether the measurement changed, the population changed, or performance within comparable groups changed. All three move a dashboard. They call for different responses.

## Begin with the denominator

The [conversion case](../examples/conversion-mix.md) has four synthetic rows. Direct converts at 10% in the baseline and 11% now. Paid improves from 4% to 5%. Overall conversion falls from 8.8% to 6.2%.

The total is correct. The population changed. Direct went from 80% of sessions to 20%; paid from 20% to 80%. More of the current period came from the channel that converts worse.

Averaging the two channel rates would weight them equally. The reported rate is total signups over total sessions. Rebuilding that total is the first check, before any story about why it moved.

## Make the decomposition add up

Hold channel rates at baseline and change the weights: −3.6 percentage points from composition. Apply each channel's rate change at current weights: +1.0. Together, the observed −2.6.

That is one specified decomposition. Another ordering allocates the interaction differently when weights and rates both change. State the convention, reconcile to the total, and do not treat the parts as natural constants.

The result gives an operational lead: inspect the acquisition shift before reading the aggregate as a worse signup experience. It does not prove the product change had no effect. Channels are broad; intent, devices, campaigns, or measurement could have changed within them. There is no experimental assignment or change log.

## Check whether the metric stayed the same

Before decomposing a real movement, establish that the two periods measure the same thing. A tracking release can exclude a class of sessions. A timezone change can move late-night events across a date boundary. A new dedup rule can lower a count without anyone behaving differently.

Each needs evidence: release records, event volumes, null rates, distinct keys, reconciliation against an independent source. A list of possible causes is a research plan, not a finding. Report what was checked, what held, and what is still open.

A prompt that asks for the distinction:

```text
/diagnose-change Conversion fell last week. Reconstruct the reported
numerator and denominator, check measurement continuity, and separate
composition from within-group movement. Reconcile contributions to
the total. For each explanation, show its evidence and what could
disconfirm it. Name what the supplied data cannot establish.
```

## Counts need bridges too

The same discipline works without a rate. In the [revenue case](../examples/revenue-bridge.md), contracted MRR goes from $430 to $440. New business +$90, expansion +$20, contraction −$20, churn −$80.

Net gain $10. The customers present at baseline end at $350, down from $430. A growth headline and a retention concern are both accurate. The bridge shows what the aggregate hides.

Five synthetic rows teach accounting for movement, not forecasting or benchmarking. The next investigation looks at the losses and their context. It does not pretend the extract can tell the founder how to allocate budget.

## Finish with a narrower decision

A diagnosis is useful when it changes what someone investigates or does next. "Conversion declined" repeats the chart. "The shift toward paid sessions more than offsets the gains within channels" names a mechanism in the supplied counts and points at the next question.

Keep that sentence separate from a causal claim. Arithmetic says how a total is composed. Why people behaved differently needs evidence about the process that produced the components.
