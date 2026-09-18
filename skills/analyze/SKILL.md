---
name: analyze
description: "Analyze a question from the data you have. Clarify the decision, test explanations, and deliver an evidence-linked answer or an honest limit; optionally produce an Engine Finding."
disable-model-invocation: true
---

# Analyze

Take the question through to an answer the intended reader can act on. Start with the user's files, pasted results, notebook, or existing data connector. A database connection, aftergrid CLI, GitHub repository, and publication approval are not prerequisites for ordinary analysis.

## Choose the output

**Portable analysis is the default** when the user has not requested an aftergrid Instance or Finding. Work in the current conversation or the user's chosen artifact. Do not create configuration, install packages, or scaffold an Instance just to start.

**Engine Finding:** if the input is an existing Finding directory or the user requests checked Finding artifacts, use [the Engine workflow](references/engine-workflow.md). That route needs the complete aftergrid toolkit; an individually installed skill does not include it. Preserve its evidence, review, and publication contracts. Do not silently convert an existing Finding into portable output to bypass a failed check.

## Resolve what changes the answer

Read available context before asking. State the original ask, reader, decision, metric including numerator and denominator, population, time window/timezone, and comparison. Ask only about ambiguity that would change the calculation or decision. Group consequential unknowns into one round and suggest reasonable choices. Do not require a business decision for a purely descriptive request. Distinguish a descriptive question from an attribution question: a before/after observation cannot establish what caused it.

A missing source is a concrete limit, not a reason to invent a result. If enough is known for a bounded descriptive analysis, proceed with its assumptions clearly stated; pause only the dependent part.

## Inspect and plan before interpreting

Read relevant existing lessons in the user-designated project context before choosing a plan. Check each lesson's source evidence, grain, population, time/version, and invalidating conditions against this task. Treat a previous explanation as a hypothesis to test; preserve contradictory evidence. If no lesson store exists, proceed without claiming one was searched. Do not create global memory or apply another project's assumptions.

Establish the source grain and units. Check join cardinality, missingness, duplicates, coverage, late arrivals, and whether the most recent cohort has matured. Read only the data required for this question through already authorized tools. Save the actual query or transformation and its observed result when producing an artifact.

Write the primary comparison and what would undermine it before making explanatory cuts. Distinguish data-validity checks (wrong grain, missing records) from a substantive test that could disconfirm the explanation. Choose meaningful checks, not a quota. Do not retrofit a threshold after seeing its result and call it pre-registered.

## Follow the evidence

Reproduce the headline before explaining it. For a rate, inspect numerator and denominator separately. For an aggregate change, separate changes within segments from changes in their weights. Rank plausible explanations by what the evidence currently supports and what would distinguish them. Take the smallest useful next cut, record its actual result and what it changes, then update the plan. An available `diagnose-change` skill can deepen this step; these instructions also work alone.

Keep dead ends that constrain the conclusion. Label new hypotheses and cuts made after seeing results as exploratory. Re-anchor when a cut no longer bears on the question: stop that branch or explicitly explain the revised question. Stop when the decision-relevant uncertainty is resolved, the useful evidence is exhausted, or further work needs a source or choice the user has not supplied. Never manufacture a dead end or run extra cuts to make an analysis look deep.

## Write and challenge the answer

Lead with the observed answer, for whom and when, and put the decision-changing caveat beside it. Link each material number to a supplied source, saved result, or reproducible calculation. Include the denominator, baseline, scope, and checks actually performed. Use a chart only when it makes the comparison easier to assess; inspect its rendered form if available.

Review the draft through three lenses: method (does the calculation earn the claim?), question (did the answer drift?), reader (what could they reasonably misread?). For each suspected problem, seek a counterexample to your criticism before reporting it. Independent reviewers help when available; serial self-review is still self-review and must be described as such. A simulated reader is never a real reader study.

Finish with the answer or precise reason it remains unknown, evidence and computations, material caveats, and what decision or next observation follows. Distinguish checks executed from checks proposed, and observed facts from explanations. A portable answer has no Engine verification, publication approval, or reproducibility guarantee merely because this skill produced it.
