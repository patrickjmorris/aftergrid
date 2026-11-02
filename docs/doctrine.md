---
title: The agent argues before the number reaches a decision
description: What these skills tell your agent to refuse, quoted from the skills themselves.
kicker: Doctrine
---

A fast agent can carry a wrong number straight into a decision. These skills put an argument in the way. The agent is told to push back on you, on the draft, and on its own answer before anyone acts.

Each refusal below quotes the skill that carries it. A test in this repository fails if the quote stops matching the skill.

## No recommendation from a number nobody reproduced

> A recommendation built on an unreproduced number inherits its error.

From [make-the-call](../skills/make-the-call/SKILL.md). The agent reproduces the result first, and [diagnose-change](../skills/diagnose-change/SKILL.md) tells it to reconcile the recalculation to the reported figure:

> Recalculate the reported movement from the smallest sufficient source and reconcile it to the reported number.

## No story from the aggregate alone

> A rate can fall overall while every segment improves.

From the [rigor rules](../skills/diagnose-change/references/rigor.md). When a total moves, the agent separates change inside the segments from change in their weights. In the [conversion case](examples/conversion-mix.md), a synthetic teaching case, that is the difference between "signup broke" and "traffic shifted."

## No business fix from arithmetic

> Recommend the smallest useful next observation or action; do not prescribe a business intervention solely from a descriptive decomposition.

From [diagnose-change](../skills/diagnose-change/SKILL.md). A decomposition shows where the movement came from. It does not show why behavior changed.

## No causal verb the design hasn't earned

> Use causal language only when the design earns it.

From the [rigor rules](../skills/diagnose-change/references/rigor.md). "Caused," "drove," and "thanks to" need randomized assignment, or an identification strategy whose assumptions are named and testable.

## No costly action on descriptive evidence

> A costly or irreversible action needs evidence of cause.

From [make-the-call](../skills/make-the-call/SKILL.md). A descriptive finding can support a check or a small test. It can't carry a rollback or a mandate.

## No invented inputs

> Never fill it with an estimate you made up.

From [make-the-call](../skills/make-the-call/SKILL.md). A cost, value, or threshold the inputs don't supply reads "unknown," with what the owner would need to provide.

## No decision manufactured from a descriptive ask

> This skill does not manufacture a decision.

From [make-the-call](../skills/make-the-call/SKILL.md). With no decision in view, it says so and stops.

## No confident answer when the data can't give one

> "Not enough data," "inconclusive," and "the question needs reframing" are complete findings.

From [write-finding](../skills/write-finding/SKILL.md). The non-answer comes in the first clause, before the reason.

## No result for a query that didn't run

> Never fill a saved result with expected values.

From the [rigor rules](../skills/diagnose-change/references/rigor.md). A check that didn't run is labeled unexecuted.

## No approval it can't give

> The owner decides. A recommendation is a proposal, not an approval, and an agent never records one as accepted.

From [make-the-call](../skills/make-the-call/SKILL.md). Metric definitions work the same way: they stay proposed until the right person approves them.

## What this doesn't promise

These are instructions to your agent, not enforcement. An agent can still break one, and a portable answer carries no guarantee because a skill produced it. The [skills lab](../examples/skills-lab/runs/README.md) records one isolated agent on four synthetic tasks, which is a teaching record, not a benchmark.

Two things help catch a miss. [analysis-review](../skills/analysis-review/SKILL.md) challenges the result as a separate step. The optional Engine adds runnable Checks, and even those establish only the properties they test.
