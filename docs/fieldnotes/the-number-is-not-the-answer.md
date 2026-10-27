---
title: The number is not the answer
description: Getting a metric is close to solved. Knowing whether it matters, and what to do about it, is the job.
kicker: Fieldnote · Insight
---

Ask an agent for last month's conversion rate and you will usually get it. Text-to-SQL, semantic layers, and BI copilots have made the number cheap to request. That work matters. A team that cannot get a consistent number cannot argue about anything else.

But nobody's job is to know the conversion rate. A product lead's job is to hit a signup goal, decide where the next sprint goes, and explain to their boss why. The number is an input to that. Most of the value an analyst adds happens after the query returns.

## Three answers to the same four rows

Conversion fell from 8.8% to 6.2%. Traffic was flat at 10,000 sessions. Here are three answers an agent could give.

**The number.** "Conversion fell 2.6 points." True. The room hears "signup broke" and someone proposes a rollback.

**The correct answer.** "Both channels improved. Direct went from 10% to 11%, paid from 4% to 5%. The drop is mix: traffic shifted toward paid, which converts lower." Also true, and it prevents the rollback. Many careful answers stop here.

**The useful answer.** "The signup flow is fine. We lost 260 signups because about 6,000 direct sessions disappeared and paid sessions took their place at less than half the conversion rate. The question for this week is where the direct traffic went. If a tracking change relabeled it, the channel split is wrong and the diagnosis starts over. If it is real, it cost 260 signups this period, and no change to the signup flow would win them back."

The third answer uses the same arithmetic as the second. It differs in what it does with it. It states the move in the unit the owner manages, says which true finding drives the decision, and names the next question in terms of the goal.

## What makes a result matter

A result is material when it is large against something the owner cares about. Three references do most of the work:

- **Normal variation.** Is this move bigger than the usual week-to-week swing?
- **The goal.** How much of the gap to target does it explain?
- **The decision threshold.** What size of effect would make the owner choose differently?

A surprising finding below all three is trivia. A dull finding above them is the headline. Analysts who have sat through enough reviews do this ranking without thinking. Agents rarely do it at all, because nobody asked them what the number was for.

## Putting it in the agent

The aftergrid skills split this into steps an agent can follow and a reviewer can check.

- [grill-question](../skills/grill-question.md) asks for the goal and the action threshold before any query runs.
- [diagnose-change](../skills/diagnose-change.md) and [analyze](../skills/analyze.md) make sure the number is right.
- [make-the-call](../skills/make-the-call.md) turns the result into goal units, labels it material or not, drops the true findings that do not matter, weighs the options, and names what would reverse the recommendation.
- [analysis-review](../skills/analysis-review.md) checks materiality alongside method, so a correct but useless memo does not pass review.

The owner still decides. The agent's job is to put the decision in front of them, sized and argued, instead of a number they have to interpret alone.
