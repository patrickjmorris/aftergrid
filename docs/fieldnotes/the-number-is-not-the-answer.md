---
title: After you have the number
description: Getting a metric is close to solved. The harder part is working out whether it matters and what to do about it.
kicker: Fieldnote · Insight
---

If you ask an agent for last month's conversion rate, you'll usually get it. Text-to-SQL, semantic layers, and BI copilots have made the number easy to request, and that work matters, because a team needs a consistent number before it can discuss anything else.

What gets less attention is what happens next. A product lead has a signup target and has to decide where the next sprint goes, so the conversion rate is only a starting point. Most of an analyst's work comes after the query returns.

## Three answers from the same four rows

The numbers in this section are synthetic. They come from a four-row teaching case in this repository.

Conversion fell from 8.8% to 6.2% on 10,000 sessions in each period. Before, direct brought 8,000 sessions and 800 signups (10%), and paid brought 2,000 sessions and 80 signups (4%). Now direct brings 2,000 sessions and 220 signups (11%), and paid brings 8,000 sessions and 400 signups (5%). For this case, assume the plan was 900 signups for the period, and that the team acts on any shortfall over 100.

**The number.** "Conversion fell 2.6 points." This is correct, and the team starts debating a rollback of the latest signup change.

**The correct answer.** "Both channels improved. Direct rose from 10% to 11% and paid from 4% to 5%. Overall conversion fell because traffic shifted toward paid, which converts lower." This stops a bad rollback. Many careful analyses end here, which I understand, because going further means stating assumptions someone in the meeting can challenge.

**The useful answer.** "Leave the signup flow alone. Signups fell 260, from 880 to 620, which puts us 280 short of plan. The shift toward paid cost 360 signups. Better rates in both channels won back 100. That gain is real, but it does not change this week's priority. Direct lost 6,000 sessions and paid gained 6,000. First check whether a tracking change relabeled direct visits as paid. If tracking is clean, the problem is the 6,000 lost direct sessions, and no change to the signup form will bring them back."

The third answer uses the same four rows as the second. It converts percentage points into the signups the team is measured on and compares the gap with the plan. It also leaves out a true finding that doesn't change the action, and it gives the owner a list of checks to run in order.

## What makes a result matter

A result matters when it's large compared with something the owner cares about. I usually compare it with these:

- **Normal variation.** Is this move bigger than the usual week-to-week swing?
- **The goal.** How much of the gap to target does it explain?
- **The decision threshold.** What size of effect would make the owner choose differently?

A 20% swing in a small segment can fall short on all of these, while a one-point shift in the core cohort can put the quarter out of reach. Experienced analysts make these comparisons before they write anything up. An agent asked only for a table has no reason to, because nobody gave it the target or the threshold.

## Getting an agent to do this

The agent needs better questions before and after the query. Before any SQL runs, it should ask what decision is on the table, which goal the metric serves, and what size of move would change the plan ([grill-question](../skills/grill-question.md)). Once the diagnosis holds up in [diagnose-change](../skills/diagnose-change.md), [make-the-call](../skills/make-the-call.md) converts it into goal units and recommends one of the options. Before the memo reaches a meeting, [analysis-review](../skills/analysis-review.md) checks whether the headline matters as well as whether the query ran.

The decision still belongs to the person running the team. The agent's job is to give them a sized argument and a clear recommendation.
