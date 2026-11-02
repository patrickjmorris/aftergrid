---
title: When a metric moves
description: How to separate the arithmetic of a change from the explanation for it.
kicker: Fieldnote · Diagnosis
---

When a rate falls right after a product change, people tend to blame the change before anyone has looked at the data.

I try to slow that down long enough to ask whether the measurement changed, the population changed, or performance changed within comparable groups. Any of these can move a dashboard, and each calls for a different response.

## Begin with the denominator

The [conversion case](../examples/conversion-mix.md) has four synthetic rows. Direct converts at 10% in the baseline and 11% now. Paid improves from 4% to 5%. Overall conversion falls from 8.8% to 6.2%.

The total is correct, and the population changed. Direct went from 80% of sessions to 20%, and paid went from 20% to 80%, so more of the current period came from the channel that converts worse.

Averaging the two channel rates would weight them equally, but the reported rate is total signups over total sessions. I'd rebuild that total first, before forming any view on why it moved.

## Make the decomposition add up

Holding channel rates at baseline and changing the weights gives −3.6 percentage points from composition. Applying each channel's rate change at current weights gives +1.0. Together they make the observed −2.6.

That's one way to do the decomposition. Another ordering allocates the interaction differently when weights and rates both change, so state the convention you used and reconcile to the total.

The result tells you to look at the acquisition shift before reading the total as a worse signup experience. It doesn't prove the product change had no effect. Channels are broad, and intent, devices, campaigns, or measurement could have changed within them. This data has no experimental assignment or change log.

## Check whether the metric stayed the same

Before decomposing a real change, make sure the two periods measure the same thing. A tracking release can exclude a class of sessions, a timezone change can move late-night events across a date boundary, and a new dedup rule can lower a count without anyone behaving differently.

Each of these needs evidence, such as release records, event volumes, null rates, distinct keys, or reconciliation against an independent source. A list of possible causes is only a plan for what to check. Report what you checked, what held, and what's still open.

This prompt asks for that distinction:

```text
/diagnose-change Conversion fell last week. Reconstruct the reported
numerator and denominator, check measurement continuity, and separate
composition from within-group movement. Reconcile contributions to
the total. For each explanation, show its evidence and what could
disconfirm it. Name what the supplied data cannot establish.
```

## Counts need bridges too

The same approach works without a rate. In the synthetic [revenue case](../examples/revenue-bridge.md), contracted MRR goes from $430 to $440, with new business at +$90, expansion at +$20, contraction at −$20, and churn at −$80.

The net gain is $10, while the customers present at baseline end at $350, down from $430. A growth headline and a retention concern are both accurate, and the bridge shows both.

Five synthetic rows can teach how to account for a change, but they can't support a forecast or a benchmark. The next step is to look at the losses and their context. The extract can't tell the founder how to allocate budget.

## Finish with a narrower decision

A diagnosis is useful when it changes what someone investigates or does next. "Conversion declined" repeats the chart. "The shift toward paid sessions more than offsets the gains within channels" names a mechanism in the supplied counts and leads to the next question.

Keep that sentence separate from a causal claim. Arithmetic tells you how a total is composed. To say why people behaved differently, you need evidence about the process behind those numbers.
