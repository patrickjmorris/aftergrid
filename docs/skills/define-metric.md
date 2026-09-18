# define-metric

Specify an ambiguous analytical metric with numerator, denominator, grain, eligibility, time semantics, examples, and counter-metrics. Use before comparing or optimizing a number; definitions stay proposed until the owner approves.

## What it does

`define-metric` turns a business label into a counting contract two analysts would apply the same way: numerator membership, denominator eligibility, time rules, edge cases, checks, and what could get worse if the number became a target.

The defining constraint: the skill proposes. An agent does not approve organizational meaning, and it does not silently edit an already approved definition.

## When to reach for it

Type `/define-metric`, or ask in plain language. Available for explicit use and automatic discovery.

Reach for it when “activation,” “active,” “revenue,” or “retained” would produce different SQL in two reasonable readings, or before anyone starts optimizing the number. Use [grill-question](grill-question.md) when the decision and comparison are still unset. Use [checked-analysis](checked-analysis.md) to compute a definition that is already agreed.

## The counting contract

Specify numerator and denominator independently. For a proportion, every numerator member belongs in the eligible denominator. For a ratio of totals, do not substitute a mean of row-level ratios.

Name event time versus processing time, timezone, interval boundaries, cohort assignment, maturation, and late arrivals. Give a few include/exclude examples at the real ambiguity: midnight, two devices, a later refund, an immature cohort. If the metric will become a target, name a counter-metric and the mechanism, or write one sentence why none is needed.

## Common questions

**Does proposing a definition make it official?** No. Status stays proposed until the responsible person approves it. Under the Engine, approval is a separate attestation bound to the file’s content hash.

**What if an approved definition already exists?** Preserve it. If the meaning must change, propose a new version rather than rewriting the approved file.

**Do I need aftergrid installed?** No. A definition can be a short document, a comment, or a dbt-style markdown file in the project. The Engine path adds versioning and hash-bound approval.

## It's working if

- Two people could classify the same edge-case row the same way from the write-up.
- Time rules are explicit enough that a late-arriving event has a stated home.
- Rival interpretations were shown on a small example before one was chosen.
- Counter-metrics are named with a mechanism, or “none” has a sentence of reasoning — not a blank.

## Where it fits

A Frame-stage standalone, often after [grill-question](grill-question.md) and before [plan-analysis](plan-analysis.md). Neighbors: [explore-data](explore-data.md) for source grain, [learn-from-analysis](learn-from-analysis.md) when a later correction should become a proposed definition rather than folklore. The map is [ask-aftergrid](ask-aftergrid.md).
