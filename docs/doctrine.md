---
title: What the skills tell your agent to refuse
description: The rules these skills give your agent, quoted from the skills themselves.
kicker: Doctrine
---

An agent can carry a wrong number into a decision quickly, so these skills tell it to stop and push back first. Each section below quotes the skill file that carries the rule, and a test in this repository fails if a quote stops matching.

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

From [make-the-call](../skills/make-the-call/SKILL.md). A descriptive finding can support a cheap, reversible step, such as a check or a small test. It can't carry a costly or irreversible one on its own.

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

These are instructions to your agent, and an agent can still break one. An answer carries no guarantee just because a skill produced it. The [skills lab](../examples/skills-lab/runs/README.md) records one isolated agent on four synthetic tasks. It's a teaching record, and I wouldn't read it as a benchmark.

Two things help catch a miss. [analysis-review](../skills/analysis-review/SKILL.md) challenges the result as a separate step. The optional command-line tool adds checks you can run, and those establish only the properties they test.
