---
title: The number is not the answer
description: Getting a metric is close to solved. Knowing whether it matters, and what to do about it, is the job.
kicker: Fieldnote · Insight
---

Ask an agent for last month's conversion rate and you will usually get it. Text-to-SQL, semantic layers, and BI copilots have made the number cheap to request. That work matters. A team that cannot get a consistent number cannot argue about anything else.

But nobody is paid to know the conversion rate. A product lead is paid to hit a signup target, decide where the next sprint goes, and explain the tradeoff. The metric is an input. Most of an analyst's value arrives after the query returns.

## Three answers to the same four rows

Conversion fell from 8.8% to 6.2% on 10,000 sessions in each period. Before, direct brought 8,000 sessions and 800 signups (10%), and paid brought 2,000 sessions and 80 signups (4%). Now direct brings 2,000 sessions and 220 signups (11%), and paid brings 8,000 sessions and 400 signups (5%). For this teaching case, say the plan was 900 signups for the period, and the team acts on any shortfall over 100.

**The number.** "Conversion fell 2.6 points." Every digit is right, and the team starts debating a rollback of the latest signup change.

**The correct answer.** "Both channels improved. Direct rose from 10% to 11% and paid from 4% to 5%. Overall conversion fell because traffic shifted toward paid, which converts lower." This stops a bad rollback. Many careful analyses end here, and for an understandable reason. The arithmetic is safe. Going further means stating assumptions someone in the meeting can challenge.

**The useful answer.** "Leave the signup flow alone. Signups fell 260, from 880 to 620, which puts us 280 short of plan. The shift toward paid cost 360 signups. Better rates in both channels won back 100; that is real, and it does not change this week's priority. Direct lost 6,000 sessions and paid gained 6,000. First check whether a tracking change relabeled direct visits as paid. If tracking is clean, the problem is where direct traffic went, and no change to the signup form will bring it back."

The third answer uses the same four rows as the second. It differs in judgment. It translates percentage points into the signups the team is measured on and sizes the gap against the plan. It sets aside a true finding because it does not change the action. It gives the owner a sequence of checks instead of a number to interpret.

## What makes a result matter

A result is material when it is large against something the owner cares about. Three references do most of the work:

- **Normal variation.** Is this move bigger than the usual week-to-week swing?
- **The goal.** How much of the gap to target does it explain?
- **The decision threshold.** What size of effect would make the owner choose differently?

A 20% swing in a small segment can sit below all three. A one-point shift in the core cohort can put the quarter out of reach. Experienced analysts run results against those references before they open a doc. An agent asked only for a table has no reason to, because nobody gave it the target or the threshold.

## Putting it in the agent

Teaching an agent this work does not take a bigger model. It takes better questions before and after the query. Before any SQL runs, the agent should ask what decision is on the table, what goal the metric serves, and what size of move would change the plan; that is [grill-question](../skills/grill-question.md). Once the diagnosis holds up in [diagnose-change](../skills/diagnose-change.md), [make-the-call](../skills/make-the-call.md) translates it into goal units, sets aside true findings that do not change the choice, weighs the options, and names the observation that would flip the recommendation. Before the memo reaches a meeting, [analysis-review](../skills/analysis-review.md) checks whether the headline matters, not only whether the query ran.

The decision still belongs to the person running the team. The agent's job is to put a sized argument and a clear recommendation on the table, not another number the room has to interpret from scratch.
