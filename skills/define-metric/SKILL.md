---
name: define-metric
description: "Specify an ambiguous analytical metric with numerator, denominator, grain, eligibility, time semantics, examples, and counter-metrics. Use before comparing or optimizing a number; definitions stay proposed until the owner approves."
disable-model-invocation: false
user-invocable: true
---

# Define the metric

Turn a business label into a calculation whose edge cases two analysts would handle the same way. Use the supplied data and policies; no aftergrid Instance is required. Preserve an existing approved definition and propose a new version if its meaning must change.

## Start with the use

Name the decision or descriptive purpose, intended reader, unit, and unit of analysis. Distinguish the business concept from the available proxy. Revenue could mean booked, billed, collected, recognized, gross, or net; “active” could mean an event, a session, or a qualifying action. Show the materially different interpretations before picking one. Ask the owner only about choices that cannot be settled from existing policy or data.

## Write the counting contract

Specify numerator membership and denominator eligibility independently. For a proportion, explain why every numerator member belongs in the eligible denominator. For an incidence rate or ratio such as events per person-time or revenue per account, state both units and their relationship; numerator and denominator need not count the same kind of thing. Define distinct entities versus event counts, repeat actions, identity merges, cancellations, refunds, trials, reactivations, internal/test traffic, and missing values where they affect this metric.

Specify event time versus processing time, timezone, closed/open interval boundaries, cohort assignment, maturation period, and treatment of late arrivals or restatements. State whether comparisons hold population fixed or use each period's eligible population. For a ratio of totals, do not substitute a mean of row-level ratios.

Name source tables/fields and join conditions only when verified. Separate a logical definition from its implementation; unavailable columns make the implementation unresolved, not permission to silently change the concept.

## Exercise the boundary

Give a few concrete include/exclude examples targeting the definition's real ambiguity: an event at midnight, one user on two devices, a refund in a later period, or an immature cohort. Show how rival interpretations change a small supplied or explicitly synthetic example. Label invented examples as illustrative, never measured production effects.

Propose validity checks: uniqueness at the chosen grain, reconciliation to a source total, numerator containment, and coverage. Explain a zero denominator separately from zero performance. If the metric will become a target, name a counter-metric and mechanism by which the headline could improve while the outcome worsens; a justified “none” is better than a decorative metric.

## Deliver a proposed definition

Return name, purpose, unit/grain, formula, eligibility/exclusions, time rules, sources, edge-case examples, checks, counter-metric, unresolved choices, and owner/status. Optional SQL must implement these rules and clearly state whether it ran. Keep definitions proposed until the appropriate human's approval is supplied; never fabricate a signature or update an approved file silently. Under the Engine, follow its version/hash approval contract through the complete toolkit.
