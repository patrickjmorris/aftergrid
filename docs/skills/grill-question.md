# grill-question

## What it does

Interviews you until a raw ask is a question another analyst could execute: who uses the answer, what is counted, among whom, over what window, against what baseline, and what would change the conclusion.

It asks only about choices that would change the work. Facts in the supplied data are looked up, not turned into a meeting. Unresolved fields stay unresolved.

## When to reach for it

You start it: `/grill-question`, or `$grill-question` in Codex.

Use it before an expensive analysis, or when words like active, retained, revenue, or improved hide several calculations. Use [analyze](analyze.md) for the interview and the investigation in one run. Use [revise-finding](revise-finding.md) when the artifact exists and the answer, not the question, needs changing.

## A falsifier is not a ritual field

For an explanatory question, name competing explanations and the comparison that would distinguish them. For a descriptive count, reconcile against an independent total or say no such check is available. Do not invent a threshold after seeing the numbers. If the metric will be optimized, ask what could get worse while it improves.

The [fieldnote on asking first](../fieldnotes/ask-before-query.md) is the teaching companion. The onboarding lab case is the caution: 60% versus 40% week-four return does not establish what mandatory onboarding would do.

## Common questions

**Will it ask the same things twice?** No. Settled answers are restated so you can correct them, then left alone.

**What if I do not know the falsifier?** Then it is not written. An unresolved question with the missing parts named beats a resolved-looking one with an invented bar.

**Does it approve metric definitions?** No. Proposed definitions remain proposals.

**Does a warehouse or CLI have to exist?** No. The default output is a short brief in the conversation or a file you choose.

## It's working if

- The original wording is preserved next to the sharpened question.
- Each question in a round would change the metric, population, window, comparison, or decision if answered differently.
- Unsettled parts are marked unresolved, not quietly completed.
- Causal wording is challenged when the design only supplies an association.

## Where it fits

User-invoked Frame-stage entry. [analyze](analyze.md) reuses the same clarification procedure without calling this skill. Neighbors: [define-metric](define-metric.md) when the label is the dispute, [explore-data](explore-data.md) when the tables are the dispute.

If you use the optional command-line tool, [this page](engine/grill-question.md) covers how this skill works with it.
