---
name: make-the-call
description: "Turn a checked result into a recommendation. Tie the metric to the goal it serves, judge whether the move is big enough to matter, drop true findings that do not change the decision, weigh the options, and name what would change the call."
disable-model-invocation: false
user-invocable: true
---

# Make the call

Use this when a result is in hand and someone has to decide something with it. A correct number is the input. The output is a recommendation the decision owner can accept, reject, or argue with, stated in the units they manage. Work from the user's files, results, and notes. No CLI or Instance is needed.

If the result has not been reproduced, do that first (`diagnose-change` or `analyze` when available). A recommendation built on an unreproduced number inherits its error.

## 1. Name the decision and the goal

State who decides, what they are choosing between, and by when. State the goal the metric serves: the target, plan, or commitment the owner is judged on, in its own units (signups this quarter, net revenue retained, cost per acquired customer). Read supplied plans, OKRs, and briefs before asking.

If the decision, owner, or goal is missing and would change the call, ask through the harness's structured question tool when it has one (`AskUserQuestion` in Claude Code, `request_user_input` in Codex), recommended interpretation first. Otherwise ask in a numbered list. If the request is purely descriptive, with no decision in view, say so and stop. This skill does not manufacture a decision.

Completion: the decision, owner, options on the table, and goal are stated, or the missing one is named as the limit.

## 2. Translate the result into goal units

Convert the movement into what the owner tracks. A rate change becomes the count it cost or gained over the period ("−2.6pp is 260 fewer signups this month"). A count becomes its share of the gap to target. Show the arithmetic. When a conversion needs a value the user did not supply (value per signup, margin, spend), state it as an assumption with its source, or leave that unit out. Do not invent a dollar figure.

Completion: the headline result appears in at least one unit the owner manages, with its calculation.

## 3. Judge materiality

A move matters when it is large against three references:

- **Normal variation.** Compare with the metric's range over comparable prior periods. If no history is available, say materiality against noise is unjudged.
- **The goal.** How much of the gap to target, or of the cushion above it, does this move account for?
- **The decision threshold.** What size of effect would make the owner choose differently? Ask when it is unknown and consequential. A move below it does not change the call, however surprising.

Label the result material, immaterial, or unjudged, with the reference that decided it.

Completion: every result that will appear in the recommendation carries a materiality label and its reference.

## 4. Rank findings by decision impact

List what the analysis established. Rank by how much each would change the decision, not by how surprising or hard-won it was. Say plainly which true findings do not matter for this decision and keep them out of the headline. A finding the owner cannot act on goes to an appendix or a follow-up, not the opening.

Completion: one or two findings lead; the rest are named as secondary or dropped, each with a reason.

## 5. Weigh the options

Lay out two or three options the owner could actually take. Include waiting or doing nothing when it is a real choice. For each give:

- what it would change, in goal units, and the evidence that estimate rests on;
- what it costs, in money, effort, or time, when known;
- the main risk, and whether the option is reversible;
- the assumption it depends on.

A descriptive finding can support a cheap, reversible action. A costly or irreversible action needs evidence of cause. Say which kind each option is. Do not upgrade an association into a forecast to make an option look stronger.

Completion: each option has an effect, cost, risk, reversibility, and the assumption it depends on.

## 6. Recommend, and say what would change it

Recommend one option at the confidence the evidence earns. Tie the recommendation to the finding that drives it. Where the evidence cannot separate two options, say so and recommend the cheaper test that would.

Name what would flip the call: an observation, a threshold, or a date ("If direct sessions are still below 3,000 a week by the 15th, the problem is no longer a tracking gap; fund the channel review"). A trigger someone can check beats a general caveat.

The owner decides. A recommendation is a proposal, not an approval, and an agent never records one as accepted.

Completion: one recommended option, the finding behind it, its confidence, and a checkable trigger that would reverse it.

## Return a decision brief

Lead with the call in one sentence the owner could repeat. Then, in order:

1. Why it matters, in goal units, with its materiality.
2. The finding behind it and its decisive caveat.
3. The options weighed, one line each.
4. What would change the call, and when to look.
5. What is true but not worth attention for this decision.

Keep it short enough to read before the meeting. Link each number to its source or calculation. Mark assumptions as assumptions and missing inputs as missing.
