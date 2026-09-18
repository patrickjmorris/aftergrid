---
name: ask-aftergrid
description: "Ask which analytics skill or flow fits the work in front of you. A router over this collection: name one next skill, say why, and stop."
disable-model-invocation: true
---

# Ask aftergrid

You do not have to remember every skill. Describe the situation. This skill chooses the next one.

A **flow** is a path through the skills. Most analytical work travels one **main flow**. Other starts merge onto it. Some jobs are standalone. Engine setup is off this map.

## Do not run the next skill

Name exactly one next skill, why it fits, and a copyable prompt the user can paste. Then stop.

Do not invoke another user-invoked skill (`grill-question`, `analyze`, `revise-finding`, `setup-aftergrid`, or this router again). Do not start a full analysis, write a Finding, or configure an Instance from here. If the user already named a skill, confirm or redirect — do not nest.

## The main flow: question → useful answer

The route most work travels when someone has an ask and wants an answer they can act on.

1. **`/grill-question`** — sharpen the decision, population, metric, window, comparison, and what would overturn the answer. Start here when the ask is still a slogan (“is activation okay?”, “did onboarding work?”).
2. **Branch — is the data unfamiliar or untrusted?** If grain, keys, joins, coverage, or meaning of columns are unknown, take **`explore-data`** before planning cuts. If the dispute is what a named metric even means, take **`define-metric`**. Those are on-ramps, then return.
3. **Branch — one comparison, or a full investigation?**
   - A reported jump, drop, or “the dashboard moved” → **`diagnose-change`**. Reproduce, decompose mix from within-group change, rank rival explanations.
   - Several competing explanations that need an ordered test sequence → **`plan-analysis`**, which also retrieves prior lessons.
   - Carry the question through inspection, checks, writing, and review in one run → **`analyze`**.
4. **Explain** with **`write-finding`** (answer first, evidence attached). Use **`iterate-visual`** when a chart has to earn the claim, **`shape-narrative`** when the order and wording hide the answer.
5. **Challenge** with **`analysis-review`** before someone acts. A review may conclude “inconclusive.”
6. **Keep the lesson** with **`learn-from-analysis`** when a verified surprise should change the next plan or check. Retrieval happens in `plan-analysis` and `analyze`; capture without retrieval is a diary.

Use only the steps the current task needs. Reviewing a chart does not require the full loop. An honest “cannot distinguish” is a complete result.

## On-ramps

Match the starting situation. Then merge onto the main flow at the step above; do not invent a parallel methodology.

| Situation | Next skill | Because |
| --- | --- | --- |
| Vague ask, hidden decision, overloaded words (active, retained, converted) | `/grill-question` | Wrong question wastes the query. |
| Unfamiliar extract, warehouse, or join | `explore-data` | Grain and fanout before interpretation. |
| “What do we mean by X?” | `define-metric` | Denominator, window, exclusions, counter-metric. |
| Metric moved; someone already has a story | `/diagnose-change` | Reproduce and decompose before the story. |
| Need a test sequence before seeing the answer | `plan-analysis` | Discriminating checks, including retrieved lessons. |
| Want the whole path in one run | `/analyze` | Orchestrates; still portable by default. |
| Draft, notebook, or chart about to inform a decision | `analysis-review` | Try to disprove the claim. |
| Feedback on an existing answer | `/revise-finding` | Scope what reopens vs what is wording. |
| Caught a durable mistake | `learn-from-analysis` | Scoped, proposed, retrievable. |
| Chart exists but does not show the comparison | `iterate-visual` | Inspect the rendered form. |
| Answer is buried in sections | `shape-narrative` | Answer first; caveat beside it. |
| Want typed Findings, retained evidence, publication controls | `/setup-aftergrid` | Optional Engine; not required to analyze. |

If two rows fit, pick the earlier failure: question before data, data before diagnosis, diagnosis before prose.

## Standalone vs orchestrator

- **`analyze`** is the orchestrator. Reach for it when the user wants one run from ask to reviewed answer. It reuses clarification, checking, writing, and review procedures; it does not call this router or other user-invoked skills.
- **Craft skills** (`checked-analysis`, `write-finding`, `iterate-visual`, `shape-narrative`, `analysis-review`) may be model-invoked. Name them when that is the stuck point. In hosts that hide them from a slash menu, give a plain-language prompt.
- **`checked-analysis`** is execute-and-record discipline, not the movement playbook. Use `diagnose-change` when the job is “why did this number move?”

## Completion

You are done when the reply contains:

1. The matched situation in one sentence.
2. Exactly one next skill, with invocation syntax for this host (`/name`, `$name`, or plain language).
3. Why not the most tempting sibling (one sentence).
4. A prompt the user can paste, naming their file or question.
5. What “working” looks like after that skill — an inspectable artifact, not a vibe.

If the work is already mid-skill, say so and do not restart from `/grill-question`. If Engine setup is what they asked for, send them to `/setup-aftergrid` and say the other skills do not need it.
