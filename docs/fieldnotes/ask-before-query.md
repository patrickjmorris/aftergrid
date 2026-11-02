---
title: Ask before you query
description: A clear question names the decision, the denominator, the comparison, and what would overturn the answer.
kicker: Fieldnote · Analytical judgment
---

"Did onboarding work?" looks like a request for a query, but it can mean several things. It might mean whether people finished onboarding, whether they came back later, whether onboarding caused them to come back, or whether everyone should have to complete it. The same table gives different answers to each, so I'd separate them before writing any SQL.

## A correct calculation can answer the wrong question

The [onboarding case](../examples/causal-claim.md) is small and synthetic. Of 100 users who completed onboarding, 60 returned in week four. Of 100 who did not, 40 returned. Both groups have finished the window.

The arithmetic is easy: 60% against 40%, which is 20 percentage points, or 50% relative to the lower rate. None of it tells you what would happen if everyone had to finish onboarding.

Users chose whether to complete it, and people already inclined to explore the product may also be more likely to return. There's no random assignment and no measure of prior engagement. So "onboarding caused a 50% improvement" turns a difference between groups into an intervention effect that the data can't identify.

If the decision is whether to require onboarding, this comparison is useful context but isn't enough evidence. If the task is to describe who currently returns, the comparison answers it.

## Write a question with an owner

A useful brief says who will act and what they're choosing between. "The product manager is deciding whether to make the checklist mandatory next month" is more useful than "analyze onboarding," because it shows what it would cost to overstate the result.

Next comes the unit, which here is an eligible user rather than a session or an event. Define completion, the return activity, and the window, and say when the cohort is mature enough to observe week four. Then decide on the comparison. Self-selected completers against non-completers is a different design from users assigned to two experiences in an experiment, even when the output tables have identical columns.

Finally, write down what would weaken the answer, such as a large difference in prior engagement, incomplete windows, or a randomized comparison that shows no benefit. A threshold chosen after seeing the results can't be presented as a test chosen in advance.

## Ask questions that can change the work

Clarifying questions should reduce uncertainty that matters. Asking the owner to pick a chart color doesn't help with the denominator. Asking whether staff and test accounts count might change every result.

Here's a prompt you can start with:

```text
/grill-question We are deciding whether to require onboarding.
Before analyzing the export, resolve the eligible population,
completion rule, retention window, and comparison. Distinguish what
we can describe from what would establish an intervention effect.
Ask only questions whose answers would change the analysis or decision.
```

The agent reads existing definitions and context first, so it doesn't ask about anything the repository can answer. Where a decision belongs to the owner, it says what's missing and why it matters.

## Keep the limit in the answer

A headline this extract can support is "Week-four retention was higher among users who completed onboarding." The next sentence should state the limit: the groups selected themselves, so this doesn't establish what mandatory onboarding would do.

The recommendation can still be useful. You can investigate how the groups differ, measure friction, and design a test before projecting a lift.

Run [analysis-review](../skills/analysis-review.md) on an overconfident draft, or [plan-analysis](../skills/plan-analysis.md) to design the next comparison. Sometimes the answer you end up with is that the current data can't settle the decision, and that's useful to know too.
