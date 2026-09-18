---
name: plan-analysis
description: "Plan an analysis from a question and available evidence: estimand, data grain, comparison, validity checks, rival explanations, and stopping conditions. Retrieve relevant prior lessons without treating them as universal rules."
disable-model-invocation: false
user-invocable: true
---

# Plan the analysis

Produce a plan the available data can execute, proportionate to the question. A small descriptive question may need one calculation and reconciliation; an explanatory question may need competing hypotheses and several discriminating comparisons. Do not require a manifest, CLI, or elaborate process for a simple ask.

## Recover context before planning

Read the supplied question, metric definitions, schema/data map, and previous analysis artifacts. Search the user-designated project context or lesson directory for relevant lessons, using metric, source, grain, and failure-mode terms. Do not search unrelated private locations or create global memory. For each retrieved lesson, inspect its evidence, scope, time/version, and invalidating conditions. Record whether it applies, conflicts with current evidence, or remains a hypothesis to check. If no lesson store exists, proceed; do not invent one or claim retrieval happened.

## Fix the comparison

State the quantity to estimate: population, unit, outcome, window, and comparison. Explain how selection, missingness, cohort maturity, seasonality, or measurement changes could alter it. For observational before/after data, distinguish describing movement from attributing it. Name the identifying assumptions needed for a causal interpretation and whether the data can test them.

Resolve metric ambiguity before committing to query shape. Identify the source grain and join paths; a plan that requires an unobserved exposure or unavailable untreated comparison must say so. Propose the nearest supportable question when needed, without silently replacing the user's ask.

## Order tests by what they can settle

First reproduce the headline and validate its inputs: uniqueness, coverage, joins, denominator eligibility, and reconciliation as relevant. Then list plausible explanations, what each predicts, the comparison that would weaken it, and the data required. Choose the cheapest informative test, not every available segmentation. State expected behavior before executing, and retain an honest timestamp/order when work spans several runs.

For an aggregate rate change, inspect both within-group rates and group weights. For a funnel, separate entry volume, eligibility, transition rates, and elapsed time. For revenue, distinguish volume, price, mix, and timing without double-counting interactions. Avoid treating post-hoc subgroup discovery as confirmation.

Specify how to report uncertainty and what sample or coverage limitation would prevent the conclusion. Never invent a universal sample-size cutoff. Put any policy-driven threshold and its source in the plan; unknown policy remains unknown.

## Bound the work

For each planned step, name input, calculation/check, expected output, and the decision it informs. Set a stopping condition: enough evidence for the requested decision; hypotheses indistinguishable with available data; or required source/choice unavailable. Preserve discoveries that change the plan as dated amendments, not rewritten history.

Return the executable plan, assumptions, relevant retrieved lessons and applicability judgments, unresolved dependencies, and expected deliverable. A plan is not evidence that its queries ran or that its predicted result is true.
