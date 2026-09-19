---
title: Analysis that compounds
description: Keep lessons the next analysis actually retrieves.
kicker: Fieldnote · Reusable practice
---

A team hits the same denominator mistake three times. Each analyst fixes their own query. Each report ends correct. The fourth analyst starts from the same trap.

The missing artifact is not another finished report. It is a small, findable statement of what went wrong, where it applies, and how the next analysis will check for it.

## Capture something that can change the next run

Suppose the [conversion case](../examples/conversion-mix.md) was your first investigation. The aggregate fell while both channel rates improved. The lesson: recompute rates from eligible-session counts and inspect channel composition before interpreting the total.

A proposed lesson from a synthetic case, not an approved fact about anyone's business. A compact record:

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

The note names the decomposition convention and keeps the limit: this accounts for arithmetic movement, not a product effect. "Paid acquisition causes conversion to fall" would overgeneralize it.

## Put enforceable knowledge in a check

Some lessons are better as code. One row per period and channel is a uniqueness check. Signups not exceeding eligible sessions is a bound. Contributions reconciling to the total is an identity.

Checks catch specific errors on future data without anyone remembering a paragraph. Keep the reasoning that does not reduce to an assertion beside them: why this decomposition, which populations, which interpretation it cannot support.

Use [learn-from-analysis](../skills/learn-from-analysis.md) after verified work:

```text
/learn-from-analysis Capture the acquisition-mix lesson from this
analysis. Keep it scoped to its measurement rules, link the evidence,
and identify the reusable check. Mark unapproved guidance as proposed.
Show where a future diagnosis will retrieve it.
```

## Retrieval is the other half

A second task should visibly read the lesson before producing another result. The bundled [follow-up case](../examples/lesson-reuse.md) supplies a new extract with the same counting rules:

```text
/plan-analysis Read examples/skills-lab/cases/learning.md and the lesson
from our earlier conversion analysis. Plan the follow-up analysis of
examples/skills-lab/data/conversion-followup.csv. State which lesson
applies and which checks it adds. Test the explanation again.
```

Then run `checked-analysis` on that plan. Conversion recovers from 6.2% to 8.0%. Same convention: composition +1.2 points, within-channel +0.6. Direct stays at 11%; paid rises from 5% to 6%. Not the previous decline in reverse.

Evidence of reuse is concrete: the plan cites the lesson, verifies the attribution rule, and adds the composition reconciliation. "I considered prior learnings" shows nothing. The lesson supplies a question to check, not an answer to repeat.

An isolated Codex agent completed this sequence without the answer key. Its [saved lesson](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/outputs/learning/lessons/conversion-mix.md), [follow-up plan](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/outputs/learning/plan.md), and [answer](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/outputs/learning/answer.md) show the retrieval and scope checks. It found a partial mix reversal and improved paid conversion, using the other exact ordering: +1.0 mix, +0.8 within-channel. Both reconcile to +1.8; they allocate the interaction differently.

The [trial record](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/runs/README.md) keeps the inputs, executed code, and reruns. Sequential tasks in one agent, not independent sessions or a controlled comparison. Observable reuse on this case; not general model accuracy.

## Let later evidence narrow the lesson

Suppose the next extract adds an `unknown` channel or switches attribution from session source to first user source. The lesson no longer applies unchanged. Reconcile the new taxonomy, update the proposed guidance, keep the old scope in its history. Do not force new data through an obsolete check to get a familiar answer.

If a later experiment finds a negative signup-flow effect, that does not contradict the arithmetic. It supplies the causal evidence the first extract lacked. The lesson makes room for both facts instead of becoming a standing excuse to dismiss product problems.

The influence is explicit: [Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin) connects capture to later retrieval; [pstack](https://github.com/cursor/plugins/tree/main/pstack) insists on observable proof and structural checks. For analytics, the recurring asset is a scoped definition, check, or reasoning pattern the next analyst can inspect, reuse, and revise.
