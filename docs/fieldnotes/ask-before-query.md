---
title: The useful work before the query
description: A clear analytical question names the decision, denominator, comparison, and evidence that could overturn the answer.
kicker: Fieldnote · Analytical judgment
---

“Did onboarding work?” looks like a request for a query. It is several questions compressed into three words. Did people finish it? Did they return later? Did the experience cause them to return? Should everyone have to complete it?

Those questions can use the same table and still require different answers. The first analytical task is to separate them.

## A correct calculation can answer the wrong question

The bundled [onboarding case](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/cases/review.md) is deliberately small and synthetic. Of 100 users who completed onboarding, 60 returned during week four. Of 100 who did not complete it, 40 returned. Both groups have finished the observation window.

The arithmetic is straightforward: 60% against 40%, a difference of 20 percentage points, or 50% relative to the lower rate. None of those calculations tells us what would happen if we required everyone to finish onboarding.

Users chose whether to complete it. People already inclined to explore the product may also be more likely to return. The extract has no random assignment, prior-engagement measure, or other information that resolves that explanation. “Onboarding caused a 50% improvement” turns an observed group difference into an intervention effect the data do not identify.

This is why asking before querying matters. If the decision is whether to require onboarding, a descriptive comparison is useful context but insufficient decision evidence. If the task is to describe who currently returns, the same comparison can answer it directly.

## Write a question with an owner

A useful brief states who will act and what choice they face. “The product manager is deciding whether to make the checklist mandatory next month” is more productive than “analyze onboarding.” It exposes the consequence of overstating a result.

Next specify the unit. In this case it is an eligible user, not a session or an event. Define completion, the return activity, and the window. Establish when the cohort is mature enough to observe week four. Then name the comparison: self-selected completers against non-completers, or users assigned to two experiences in an experiment. They are different designs even when their output tables have identical columns.

Finally, write what would weaken the answer. That could be a large difference in prior engagement, incomplete observation windows, or a randomized comparison that fails to support the expected benefit. Choose checks because they address the question's vulnerabilities. A threshold invented after seeing results cannot honestly be presented as a test chosen in advance.

## Ask questions that can change the work

Clarification should reduce uncertainty that matters. Asking the owner to pick a chart color does not help establish the denominator. Asking whether staff and test accounts count might change every result.

A practical opening prompt is:

```text
/grill-question We are deciding whether to require onboarding.
Before analyzing the export, resolve the eligible population,
completion rule, retention window, and comparison. Distinguish what
we can describe from what would establish an intervention effect.
Ask only questions whose answers would change the analysis or decision.
```

The agent should first read definitions and context that already exist. A question the repository can answer should not become a meeting. Where a decision genuinely belongs to the owner, it should say what is missing and why it matters.

## The answer should retain the boundary

An honest headline for this extract is: “Week-four retention was higher among users who completed onboarding.” The next sentence should state the limit: the groups selected themselves, so the comparison does not establish what mandatory onboarding would do.

The recommendation can still be useful. Investigate selection differences, gather friction measures, and design an intervention test before projecting a retention lift. The analyst has narrowed the decision and named the next evidence needed.

Run [analysis-review](../skills/analysis-review.md) on the original overconfident draft, or use [plan-analysis](../skills/plan-analysis.md) to design the next comparison. The point of clarification is to make the resulting answer usable, including when that answer is that the current data cannot settle the decision.
