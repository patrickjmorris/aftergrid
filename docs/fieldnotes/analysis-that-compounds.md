---
title: Keeping lessons from one analysis to the next
description: How to save a lesson so the next analysis uses it.
kicker: Fieldnote · Reusable practice
---

When an analyst catches a denominator mistake, the fix usually stays in that one query, so the next analyst can make the same mistake. To prevent that, you need a short note that says what went wrong, where it applies, and how the next analysis will check for it.

## Save something that can change the next run

Suppose the [conversion case](../examples/conversion-mix.md) was your first investigation. The total fell while both channel rates improved. The lesson is to recompute rates from eligible-session counts and look at channel composition before interpreting the total.

This is a proposed lesson from a synthetic case, so it says nothing about any real business. A short record might look like this:

```yaml
title: Check acquisition mix before interpreting conversion movement
status: proposed
applies_when:
  - Comparing session-to-signup rates across periods
  - Channels share a consistent, exclusive attribution rule
evidence:
  - examples/skills-lab/data/conversion.csv
  - examples/skills-lab/verify.mjs
check: Reconcile total signups and sessions, then decompose mix and rates
revisit_when:
  - Session eligibility or channel attribution changes
  - A channel is added, removed, or missing from one period
```

The note keeps the limit of the original analysis, which explained the arithmetic of the change and said nothing about a product effect. "Paid acquisition causes conversion to fall" would stretch it too far.

## Put what you can enforce in a check

Some lessons work better as code. You can check that there's one row per period and channel, that signups never exceed eligible sessions, and that contributions add up to the total.

A check catches a specific error on future data without anyone having to remember a paragraph. Next to the check, keep the reasoning that code can't capture, such as why you chose this decomposition and which interpretations it can't support.

Use [learn-from-analysis](../skills/learn-from-analysis.md) after verified work:

```text
/learn-from-analysis Capture the acquisition-mix lesson from this
analysis. Keep it scoped to its measurement rules, link the evidence,
and identify the reusable check. Mark unapproved guidance as proposed.
Show where a future diagnosis will retrieve it.
```

## Make sure the next analysis reads it

A second task should visibly read the lesson before producing another result. The bundled [follow-up case](../examples/lesson-reuse.md), also synthetic, supplies a new extract with the same counting rules:

```text
/plan-analysis Read examples/skills-lab/cases/learning.md and the lesson
from our earlier conversion analysis. Plan the follow-up analysis of
examples/skills-lab/data/conversion-followup.csv. State which lesson
applies and which checks it adds. Test the explanation again.
```

Then run that plan with its checks. The recorded run used `checked-analysis`, which has since been folded into `analyze`. Conversion recovers from 6.2% to 8.0%. With the same convention, composition contributes +1.2 points and within-channel change contributes +0.6. Direct stays at 11% and paid rises from 5% to 6%, so this isn't the earlier decline in reverse.

You can see the reuse in the plan, which cites the lesson, verifies the attribution rule, and adds the composition reconciliation. A line like "I considered prior learnings" doesn't show that. The lesson gives the agent a question to check, and the agent still has to work out the answer.

An isolated Codex agent completed this sequence without the answer key. Its [saved lesson](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/outputs/learning/lessons/conversion-mix.md), [follow-up plan](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/outputs/learning/plan.md), and [answer](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/outputs/learning/answer.md) show the retrieval and scope checks. It found a partial mix reversal and improved paid conversion, using the other exact ordering, which gives +1.0 from mix and +0.8 from within-channel change. Both orderings reconcile to +1.8 and allocate the interaction differently.

The [trial record](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/runs/README.md) keeps the inputs, executed code, and reruns. These were sequential tasks in one agent, without independent sessions or a controlled comparison. It shows reuse on this case and says nothing about general model accuracy.

## Update the lesson when the evidence changes

Suppose the next extract adds an `unknown` channel or switches attribution from session source to first user source. The lesson no longer applies as written. Reconcile the new taxonomy, update the proposed guidance, and keep the old scope in its history, so you aren't forcing new data through an old check.

If a later experiment finds a negative signup-flow effect, that doesn't contradict the arithmetic. It adds the causal evidence the first extract lacked, and the lesson should make room for both, so nobody uses it to dismiss a real product problem.

Two projects influenced this. [Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin) connects saving a lesson to retrieving it later, and [pstack](https://github.com/cursor/plugins/tree/main/pstack) insists on observable proof and structural checks. In analytics, what you keep is usually a scoped definition or check that the next analyst can inspect and change.
