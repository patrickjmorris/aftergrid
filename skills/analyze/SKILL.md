---
name: analyze
description: "Analyze a question from the data you have. Clarify the decision, run the checks that could invalidate the result, keep a log of what ran, test explanations, and deliver an evidence-linked answer or an honest limit; optionally produce an Engine Finding."
disable-model-invocation: true
---

# Analyze

Take the question through to an answer the intended reader can act on. Start with the user's files, pasted results, notebook, or existing data connector. A database connection, aftergrid CLI, GitHub repository, and publication approval are not prerequisites for ordinary analysis.

## Choose the output

**Portable analysis is the default** when the user has not requested an aftergrid Instance or Finding. Work in the current conversation or the user's chosen artifact. Do not create configuration, install packages, or scaffold an Instance just to start.

**Engine Finding:** if the input is an existing Finding directory or the user requests checked Finding artifacts, use [the Engine workflow](references/engine-workflow.md). That route needs the complete aftergrid toolkit; an individually installed skill does not include it. Preserve its evidence, review, and publication contracts. Do not silently convert an existing Finding into portable output to bypass a failed check.

## Resolve what changes the answer

Read available context before asking. State the original ask, reader, decision, metric including numerator and denominator, population, time window/timezone, and comparison. Ask only about ambiguity that would change the calculation or decision. Group consequential unknowns into one round and suggest reasonable choices. Ask them through the harness's structured question tool when it has one (`AskUserQuestion` in Claude Code, `request_user_input` in Codex), recommended choice first, each option saying what it would change; choices that others depend on go in the first call. Otherwise end with a numbered list. Do not require a business decision for a purely descriptive request. Distinguish a descriptive question from an attribution question; the claims rules in [rigor](references/rigor.md) say what each can support.

A missing source is a concrete limit, not a reason to invent a result. If enough is known for a bounded descriptive analysis, proceed with its assumptions clearly stated; pause only the dependent part.

## Inspect and plan before interpreting

Read relevant existing lessons in the user-designated project context before choosing a plan. Check each lesson's source evidence, grain, population, time/version, and invalidating conditions against this task. Treat a previous explanation as a hypothesis to test; preserve contradictory evidence. If no lesson store exists, proceed without claiming one was searched. Do not create global memory or apply another project's assumptions.

Establish the source grain and units. Run the grain, join, time, and coverage checks in [rigor](references/rigor.md) that this source needs. Read only the data required for this question through already authorized tools. When a check shows a source defect — the data disagreeing with how its source is meant to behave — follow [data issues](references/data-issues.md): measure it, continue under a stated workaround, and leave a note for its owner.

Write the primary comparison and what would undermine it before making explanatory cuts. Follow the planned and exploratory rules in [rigor](references/rigor.md). Choose meaningful checks, not a quota.

## Run the checks and keep the log

A checked analysis names and performs the relevant checks. It does not certify the answer. Before the main query, choose the checks this question needs: key uniqueness, completeness, range and unit consistency, reconciliation to an independent total, denominator eligibility, cohort maturity, and source coverage. For each, state the expected behavior and why before it runs.

Use read-only queries and bounded local computation through tools already authorized. Record every query and transformation as [rigor](references/rigor.md) requires. If access is unavailable, deliver a runnable plan instead and mark every result in it unexecuted.

Keep a short analysis log as the work happens. Each entry names the question tested, what was observed, the next decision, and whether the cut was planned or exploratory. The log is how a reader sees the middle of the analysis, so write it then, not afterward.

## Follow the evidence

Reproduce the headline before explaining it. Apply the rate and mix rules in [rigor](references/rigor.md). Rank plausible explanations by what the evidence currently supports and what would distinguish them. Take the smallest useful next cut, record its actual result and what it changes, then update the plan. An available `diagnose-change` skill can deepen this step; these instructions also work alone.

Record each cut and its result in the log, including dead ends that constrain the conclusion. Re-anchor when a cut no longer bears on the question: stop that branch or explicitly explain the revised question. Stop when the decision-relevant uncertainty is resolved, the useful evidence is exhausted, or further work needs a source or choice the user has not supplied. Never manufacture a dead end or run extra cuts to make an analysis look deep.

## Write and challenge the answer

Lead with the observed answer, for whom and when, and put the decision-changing caveat beside it. Link each material number to a supplied source, saved result, or reproducible calculation. Include the denominator, baseline, scope, and checks actually performed. Use a chart only when it makes the comparison easier to assess; inspect its rendered form if available.

Review the draft through four lenses: method (does the calculation earn the claim?), question (did the answer drift?), reader (what could they reasonably misread?), materiality (is the headline big enough to change the decision?). For each suspected problem, seek a counterexample to your criticism before reporting it. Independent reviewers help when available; serial self-review is still self-review and must be described as such. A simulated reader is never a real reader study.

When the reader has a decision to make, state the result in a unit they manage, say whether it is large against normal variation and the goal, and name which true findings do not change the decision. An available `make-the-call` skill deepens this step; these instructions also work alone.

Finish with the answer or precise reason it remains unknown, its units, population, and window, evidence and computations, assumptions, material caveats, and what decision or next observation follows. Attach the analysis log. Report executed and proposed checks as [rigor](references/rigor.md) requires. Say whether another person can rerun the calculation, only inspect saved results, or neither. A portable answer has no Engine verification, publication approval, or reproducibility guarantee merely because this skill produced it.
