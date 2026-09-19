# ask-aftergrid

## What it does

You describe a situation. It names one next skill, why the tempting sibling is wrong, and a prompt you can paste. Then it stops.

It does not run the analysis, start `/analyze`, interview you, or write a Finding.

## When to reach for it

You start it: `/ask-aftergrid`, or `$ask-aftergrid` in Codex.

Use it when two skills both look plausible, or you cannot remember which matches the stuck point. If you already know the job — sharpen this question, why did conversion fall — go straight there. For the whole path in one run, that is [analyze](analyze.md).

## One next skill, then stop

The main flow is question → inspect data or metric → investigate → explain → challenge → keep the lesson. Unfamiliar tables go through [explore-data](explore-data.md); a disputed label through [define-metric](define-metric.md); a dashboard movement through [diagnose-change](diagnose-change.md).

Use the smallest step that unblocks the work. A chart review does not need a full investigation. [setup-aftergrid](setup-aftergrid.md) is off this map: typed Findings and retained evidence only.

## Common questions

**Will it tell me to run analyze every time?** No. `/analyze` is a full question-to-answer run. A mix-shift diagnosis, a metric definition, or a review of an existing memo should not pay that cost.

**Does the router call the next skill?** No. User-invoked skills do not call each other. You start the named skill.

**Do I need the Engine first?** No. Ordinary routing works on a CSV, notebook, or SQL client.

**What if I am already mid-analysis?** Say so. The useful next step is rarely restarting at `/grill-question`.

## It's working if

- The reply names one skill, not a menu.
- The rejected sibling is the one you were about to pick.
- The pasted prompt includes your actual file or question.
- The agent stopped instead of beginning the investigation.

## Where it fits

The map over the set — Matt Pocock’s `ask-matt`, for analytics. The [workflow guide](../guides/skill-workflows.md) is the same map written for a person choosing without the skill.
