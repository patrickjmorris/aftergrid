---
title: Make the next analysis start with what you learned
description: Capture scoped analytical lessons, retrieve them before new work, and revisit them when their assumptions change.
kicker: Fieldnote · Reusable practice
---

A team notices the same denominator mistake three times. Each analyst fixes their own query. Each report ends correctly. The fourth analyst still starts from the same trap.

The missing artifact is not another finished report. It is a small, discoverable statement of what went wrong, where the lesson applies, and how the next analysis will check it.

## Capture something that can change the next run

Suppose the [conversion case](../examples/conversion-mix.md) was your first investigation. The aggregate rate fell although both channel rates improved. A useful lesson would record that rates must be recomputed from eligible-session counts and that channel composition must be inspected before interpreting the total.

This is a proposed lesson derived from a synthetic teaching case, not an approved fact about anyone's business. A compact record might look like this:

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

The accompanying explanation should name the decomposition convention and preserve the limit: this accounts for arithmetic movement; it does not identify a product effect. A statement such as “paid acquisition causes conversion to fall” would overgeneralize the result.

## Put enforceable knowledge in a check

Some lessons are better expressed in executable form. One row per period and channel can be checked for uniqueness. Signups should not exceed eligible sessions under the case's measurement definition. Contribution totals should reconcile to the overall movement.

Those checks catch specific errors on future data without relying on someone remembering a paragraph. Keep the reasoning that cannot be reduced to an assertion alongside them: why the chosen decomposition is useful, which populations it covers, and which interpretation it cannot support.

Use [learn-from-analysis](../skills/learn-from-analysis.md) after verified work:

```text
/learn-from-analysis Capture the acquisition-mix lesson from this
analysis. Keep it scoped to its measurement rules, link the evidence,
and identify the reusable check. Mark unapproved guidance as proposed.
Show where a future diagnosis will retrieve it.
```

## Retrieval is the other half

A second task should visibly read the lesson before producing another result. The bundled [follow-up case](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/cases/learning.md) supplies a new extract with the same counting rules:

```text
/plan-analysis Read examples/skills-lab/cases/learning.md and the lesson
from our earlier conversion analysis. Plan the follow-up analysis of
examples/skills-lab/data/conversion-followup.csv. State which lesson
applies and which checks it adds. Test the explanation again.
```

Then run `checked-analysis` on that plan. Conversion recovers from 6.2% to 8.0%. Using the same decomposition convention, composition contributes +1.2 percentage points and within-channel movement contributes +0.6 points. Direct conversion stays at 11%; paid conversion rises from 5% to 6%. This is not simply the previous decline in reverse.

The useful evidence of reuse is concrete: the plan cites the lesson, verifies the attribution rule, and adds the composition reconciliation. A sentence saying “I considered prior learnings” is not enough to show what changed. The lesson supplies a question to check, not an answer to repeat.

A separate isolated Codex agent has now completed this sequence without the answer key. Its [saved lesson](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/outputs/learning/lessons/conversion-mix.md), [follow-up plan](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/outputs/learning/plan.md), and [answer](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/outputs/learning/answer.md) show the retrieval and scope checks. The agent found both a partial mix reversal and improved paid conversion. It used the other exact decomposition ordering: +1.0 point for mix and +0.8 for within-channel change. Both conventions reconcile to +1.8; they allocate the interaction differently.

The [trial record](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/runs/README.md) preserves the inputs, executed code, and successful coordinator reruns. These were sequential tasks in one isolated agent, not independent sessions or a controlled comparison. They demonstrate observable reuse on this case; they do not establish general model accuracy.

## Let later evidence narrow the lesson

Suppose the next extract adds an `unknown` channel or changes attribution from session source to first user source. The previous lesson no longer applies unchanged. Reconcile the new taxonomy, update the proposed guidance, and preserve the old scope in its history. Do not force new data through an obsolete check to obtain a familiar answer.

Likewise, if a later experiment identifies a negative signup-flow effect, that does not contradict the original arithmetic. It supplies causal evidence the first extract lacked. The lesson should make room for both facts instead of becoming a standing excuse to dismiss product problems.

The influence here is explicit: [Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin) connects knowledge capture to later retrieval; [pstack](https://github.com/backnotprop/pstack) emphasizes observable proof and structural checks. For analytics, the recurring asset is a scoped definition, check, or reasoning pattern that the next analyst can inspect, reuse, and revise.
