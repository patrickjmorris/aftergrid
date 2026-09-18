---
name: grill-question
description: "Turn a vague analytics ask into an answerable question: decision or purpose, reader, metric, population, window, comparison, and evidence that could change the conclusion."
disable-model-invocation: true
---

# Sharpen the question

Use this before expensive analysis or when an apparently simple ask hides different possible calculations. The result can be a short question brief in the conversation or a user-chosen file. No CLI, manifest, or warehouse is required.

## Preserve the ask and find the ambiguity

Keep the original wording. Read supplied definitions and prior decisions before questioning the user. Identify what decision the answer informs, or the purpose if it is purely descriptive, and who needs to understand it. Translate words such as active, retained, new, revenue, and improved into countable events and an eligible population.

For a rate, name numerator and denominator; for a total, name unit and grain. Separate event time from ingestion time and timezone from reporting date. Establish the comparison window and baseline, including cohort maturity and seasonality where relevant. Challenge causal wording when the design only supplies an association.

## Ask only what changes the work

Group unresolved consequential choices into one round. Give each a recommended interpretation and what an alternative would change. Look up facts in the supplied data rather than asking the user to describe columns you can inspect. Do not ask again for settled answers; state them so the user can correct them.

A falsifier is an observation that could change the proposed conclusion, not a ritual field. For an explanatory question, name competing explanations and the comparison that would distinguish them. For a descriptive count, reconcile against an independent total or state that no such check is available. Do not invent an arbitrary threshold or imply that an unavailable causal design exists.

If the metric will be optimized, ask what could get worse while it improves. Record a relevant counter-metric and why, or a concrete reason none is needed. Proposed definitions remain proposals; an agent does not approve organizational meaning.

## Return a question brief

Include the original ask; sharpened question; reader and decision/purpose; metric and units; eligible population and exclusions; time window/timezone; comparison; evidence that would change the answer; available sources; and remaining assumptions or questions with their effect. Mark unresolved fields as unresolved rather than quietly filling them. If the ask cannot be answered as phrased, explain why and offer the nearest answerable question without pretending the user already accepted it.

## Existing Engine Finding

Only when working in an existing aftergrid Instance or explicitly asked for a Finding, follow [the Engine procedure](references/engine-workflow.md). It records the brief in the manifest and preserves definition approval rules. It requires the complete toolkit. Portable use above is self-contained.
