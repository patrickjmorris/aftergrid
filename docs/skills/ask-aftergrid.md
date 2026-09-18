# ask-aftergrid

Choose the next analytics skill for the work in front of you. Name one skill, say why, and stop.

## What it does

`/ask-aftergrid` is the map over this collection. You describe a situation — a vague ask, a moved metric, an untrusted table, a draft about to be believed — and it returns one next skill, the reason the tempting sibling is wrong, and a prompt you can paste.

The defining constraint: it does not do the analysis. It will not start `/analyze`, interview you, or write a Finding. The output is a directed next step, not a nested run.

## When to reach for it

You invoke this by typing `/ask-aftergrid` — the agent will not start it on its own. In Codex, use `$ask-aftergrid`.

Reach for it when you cannot remember which skill matches the stuck point, or when two skills both look plausible. If you already know the job is “sharpen this question” or “why did conversion fall,” go straight to that skill. If you want the whole path in one run, that is [analyze](analyze.md), not this router.

## One next skill, then stop

The main flow is question → inspect data or metric → investigate → explain → challenge → keep the lesson. On-ramps merge onto it: unfamiliar tables go through [explore-data](explore-data.md), a disputed label through [define-metric](define-metric.md), a dashboard movement through [diagnose-change](diagnose-change.md).

Use the smallest step that unblocks the work. A chart review does not need a full investigation. Optional Engine setup is off this map; [setup-aftergrid](setup-aftergrid.md) is only when you want typed Findings and retained evidence.

## Common questions

**Will it just tell me to run analyze every time?** No. `/analyze` is for a full question-to-answer run. A mix-shift diagnosis, a metric definition, or a review of an existing memo should not pay that cost.

**Does the router call the next skill for me?** No. User-invoked skills do not call each other. You (or a fresh turn) start the named skill.

**Do I need the Engine first?** No. Ordinary routing and portable skills work on a CSV, notebook, or SQL client.

**What if I am already mid-analysis?** Say so. The useful next step is rarely restarting at `/grill-question`.

## It's working if

- The reply names one skill, not a menu.
- The rejected sibling is the one you were about to pick.
- The pasted prompt includes your actual file or question.
- The agent stopped instead of beginning the investigation in the same turn.

## Where it fits

The router over the set — Matt Pocock’s `ask-matt`, for analytics. Each other docs page is a node; this page is the map. The [workflow guide](../guides/skill-workflows.md) is the same map written for a person choosing without the skill.
