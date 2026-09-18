---
name: checked-analysis
description: "Analyze supplied data with explicit grain, comparisons, validity checks, and a record of what ran. Use for reproducible calculations or evidence a writer can inspect; optionally bind an Engine Finding."
user-invocable: false
---

# Run a checked analysis

Work with the user's files, notebook, SQL client, or existing connector. A checked analysis means naming and performing the relevant checks, not declaring the answer certified. For an existing aftergrid Finding or a requested Engine artifact, use [the Engine workflow](references/engine-workflow.md); do not apply its CLI requirements to ordinary analysis.

## Establish the calculation

Restate the question, metric/units, eligible population, time window, and comparison. Resolve only unknowns that change the result. Inspect the source grain and key before aggregating. A user row, an event row, and an invoice line are different units even when each has a user ID.

Check whether joins are one-to-one, one-to-many, or many-to-many at that grain; compare row counts and distinct keys before and after. Aggregate each side to the intended grain before joining when needed. Do not use DISTINCT to conceal an unexplained multiplication. Keep unmatched rows visible and explain exclusions.

## Name what would invalidate or weaken the result

Before the main query, select the checks the question needs: key uniqueness, completeness, range/unit consistency, reconciliation, denominator eligibility, cohort maturity, and source coverage. State expected behavior and why; derive thresholds from supplied policy or analytical requirements, not from convenient observed values.

Separate a failed validity check from a substantive result. Duplicate events can invalidate the count; a pre-specified contrast that does not support the hypothesis is evidence against it. Missing rows, measured zeros, and not-applicable cells must not become the same value.

## Execute through the available tools

Use read-only queries and bounded local computation appropriate to the source. Record actual query/transform text, parameters, source/version or retrieval time when available, result, and the checks that ran. If access is unavailable, deliver a runnable plan and mark every unexecuted result as unexecuted. Never fill a saved result with expected values.

Compute pooled rates from summed numerators and denominators, not the unweighted mean of subgroup rates unless that is the estimand. Show absolute and relative change with named before/after operands. Inspect segment weights when the aggregate moves differently from its components. Check whether incomplete periods or late events explain apparent changes.

Keep a concise analysis log as work happens: question tested, observation, next decision, and whether the cut was planned or exploratory. Preserve consequential dead ends. Exploratory checks can discover a useful explanation but cannot retroactively become pre-registration.

## Hand over evidence, not just a number

Return results with units, population, windows, source/query references, checks performed and their outcomes, assumptions, unsuccessful explanations, candidate conclusions, and limitations. Say whether another person can rerun the calculation, only inspect saved results, or neither. Recommend an answer, reframing, or further data based on what was actually established. Do not invent approvals, confidence intervals, or causal identification.
