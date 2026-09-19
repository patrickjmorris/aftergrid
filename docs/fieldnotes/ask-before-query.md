---
title: Ask before you query
description: A clear question names the decision, the denominator, the comparison, and what would overturn the answer.
kicker: Fieldnote · Analytical judgment
---

"Did onboarding work?" looks like a request for a query. It is four questions in three words. Did people finish it? Did they return later? Did the experience cause them to return? Should everyone have to complete it?

Same table, different answers. Separate them first.

## A correct calculation can answer the wrong question

The [onboarding case](../examples/causal-claim.md) is small and synthetic. Of 100 users who completed onboarding, 60 returned in week four. Of 100 who did not, 40 returned. Both groups have finished the window.

The arithmetic is easy: 60% against 40%, 20 percentage points, 50% relative to the lower rate. None of it says what would happen if everyone had to finish onboarding.

Users chose whether to complete it. People already inclined to explore the product may also be more likely to return. There is no random assignment and no prior-engagement measure. "Onboarding caused a 50% improvement" turns an observed group difference into an intervention effect the data do not identify.

If the decision is whether to require onboarding, the descriptive comparison is useful context and insufficient evidence. If the task is to describe who currently returns, the same comparison answers it.

## Write a question with an owner

A useful brief says who will act and what they are choosing between. "The product manager is deciding whether to make the checklist mandatory next month" beats "analyze onboarding." It exposes the cost of overstating the result.

Then the unit: an eligible user, not a session or an event. Define completion, the return activity, and the window. Say when the cohort is mature enough to observe week four. Then the comparison: self-selected completers against non-completers, or users assigned to two experiences in an experiment. Different designs, even when the output tables have identical columns.

Finally, what would weaken the answer: a large difference in prior engagement, incomplete windows, or a randomized comparison that fails to show the benefit. Choose checks for the question's vulnerabilities. A threshold invented after seeing results cannot be presented as a test chosen in advance.

## Ask questions that can change the work

Clarification should reduce uncertainty that matters. Asking the owner to pick a chart color does not establish the denominator. Asking whether staff and test accounts count might change every result.

A practical opening prompt is:

```text
/grill-question We are deciding whether to require onboarding.
Before analyzing the export, resolve the eligible population,
completion rule, retention window, and comparison. Distinguish what
we can describe from what would establish an intervention effect.
Ask only questions whose answers would change the analysis or decision.
```

The agent reads existing definitions and context first. A question the repository can answer should not become a meeting. Where a decision belongs to the owner, it says what is missing and why it matters.

## The answer keeps the boundary

An honest headline for this extract: "Week-four retention was higher among users who completed onboarding." The next sentence states the limit: the groups selected themselves, so this does not establish what mandatory onboarding would do.

The recommendation is still useful. Investigate selection differences, measure friction, and design an intervention test before projecting a lift. The analyst has narrowed the decision and named the next evidence.

Run [analysis-review](../skills/analysis-review.md) on the overconfident draft, or [plan-analysis](../skills/plan-analysis.md) to design the next comparison. Clarification exists to make the answer usable, including when the answer is that the current data cannot settle the decision.
