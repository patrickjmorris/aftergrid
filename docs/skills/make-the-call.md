# make-the-call

## What it does

Turns a checked result into a recommendation. It ties the metric to the goal it serves, judges whether the move is big enough to matter, drops true findings that do not change the decision, weighs the real options, and names the observation that would reverse the call.

The other skills make sure the number is right. This one works out what the person deciding should do about it.

## When to reach for it

Type `/make-the-call`, or ask in plain language. The agent can also reach for it when an analysis ends at a decision.

Use it when the result is in hand and someone has to act on it: fund or cut a channel, ship or roll back, hold a target or reset it. Use [diagnose-change](diagnose-change.md) or [analyze](analyze.md) first if the movement has not been reproduced. Use [write-finding](write-finding.md) to write up the full analysis; use this when the reader needs the call.

## Correct is not the same as useful

In the [conversion case](../examples/conversion-mix.md), conversion fell from 8.8% to 6.2% while both channels improved. A correct answer says "mix, not a broken signup flow." A useful answer goes on. Signups fell 260 on flat traffic. Direct lost 6,000 sessions and paid gained 6,000, at less than half the conversion rate. That shift cost 360 signups; better rates in both channels won back 100. The decision is not whether to roll back signup. It is finding out why direct traffic fell 75%, starting with whether a tracking change relabeled it as paid.

That second step needs the goal, a sense of normal variation, and the size of effect that would change what the owner does. The skill asks for those when they are missing. It does not invent a dollar value to make a recommendation look precise.

## Common questions

**Can it recommend an action from a descriptive result?** Yes, when the action is a check or a small reversible test, and it says so. A costly or irreversible action needs evidence of cause. When cost is unknown, it frames the option as a test and asks the owner to confirm the cost.

**What if the inputs do not supply a cost, value, or threshold?** It writes "unknown" and says what the owner would need to supply. It never fills the gap with a number it made up.

**What if there is no goal or decision?** It says the request is descriptive and stops. With no action on the table, a recommendation only invents work.

**Does it decide for the owner?** No. It proposes one option at the confidence the evidence earns. The owner accepts or rejects it.

## It's working if

- The first sentence is a call the owner could repeat in the meeting.
- The headline result appears in a unit the owner manages, such as signups this quarter, with its arithmetic.
- Each result is labeled material, immaterial, or unjudged, with the reference that decided it.
- At least one true finding is named as not worth attention for this decision.
- The brief names a checkable trigger that would reverse the recommendation, such as an observation that separates the explanations still standing.
- Every cost, value, or threshold came from the inputs or is marked unknown.

## Where it fits

The Decide stage. After [diagnose-change](diagnose-change.md) or [analyze](analyze.md) has produced a checked result, and alongside [write-finding](write-finding.md) when the full write-up is also needed. Challenge the recommendation with [analysis-review](analysis-review.md) before it reaches the meeting.
