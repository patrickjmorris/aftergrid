# explore-data

## What it does

Builds a map of what the supplied data can answer. It verifies grain against rows, tests joins instead of trusting column names, and records coverage, missingness, and maturity — then lists questions the extract can and cannot support.

An inventory is not a finding. Exploratory correlations stay labeled. The map is proposed context, not an approved catalog.

## When to reach for it

Type `/explore-data`, or ask in plain language.

Use it when the tables, export, or warehouse objects are new to this question. Skip it when grain, keys, and join risks are already established. Use [grill-question](grill-question.md) if the ask itself is still several questions. Use [plan-analysis](plan-analysis.md) once you know what the data can bear.

## Grain before joins, joins before conclusions

A column called `user_id` does not make a table one row per user. A timestamp does not establish event order without its timezone and whether it is event time or ingestion time. Candidate keys are tested for uniqueness at the intended grain.

For a proposed join, compare row counts, distinct keys, and unmatched keys on both sides. Name the cardinality at the grain the analysis needs. An inner join that “mostly matches” can still drop one period or segment; say what is excluded. Do not repair a many-to-many join with unexplained `DISTINCT`.

## Common questions

**Should it scan the whole warehouse?** No. Start with bounded reads tied to the stated question.

**What if I cannot run the probes?** Write the exact bounded queries needed and mark them unexecuted. Do not fill results with expected values.

**Is a data map a metric definition?** No. Column names are not approved metrics. Candidate definitions belong to [define-metric](define-metric.md).

## It's working if

- Each relevant source has a stated grain, key, units, coverage, and known limit, with a file or query reference.
- Join risks are evidenced (counts, unmatched keys), not inferred from names.
- The closing section names questions answerable now versus the smallest additional information needed.
- Observations are separated from inferred meanings.

## Where it fits

A Frame-stage standalone. It feeds [plan-analysis](plan-analysis.md) and [checked-analysis](checked-analysis.md). It does not replace [grill-question](grill-question.md): a precise question and a trustworthy extract are different jobs.
