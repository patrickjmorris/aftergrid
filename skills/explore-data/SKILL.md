---
name: explore-data
description: "Inspect unfamiliar tables, files, or query results before analysis. Establish grain, keys, joins, coverage, measurement limits, and answerable questions without inventing a business conclusion."
disable-model-invocation: false
user-invocable: true
---

# Explore the data

Build a useful map of what the supplied data can answer. Use local files, pasted samples, or the user's existing connector. Start with bounded reads and the stated question; do not configure a new platform or scan an entire warehouse because a catalog is available.

## Establish what one row means

Read table descriptions and available schema, then verify against actual rows. Record candidate keys and test their uniqueness at the intended grain. Distinguish entities, events, snapshots, and slowly changing records. A column called `user_id` does not make a table one row per user; a timestamp does not establish event order without its semantics and timezone.

Inspect types, units, nulls, sentinel values, and plausible ranges. Determine whether apparent missing dates are zero activity, absent collection, or dates the source does not cover. Check coverage by source and period, not just overall min/max dates. Compare event time with ingestion time where available; identify cohorts or periods that have not matured.

When a value is measured repeatedly and overwritten (a lifetime count, a balance, a status), inventory the readings before anyone designs a comparison. For each stored reading, record when it was taken relative to the unit's start (its age) and relative to any event the question is about. Count the readings that fall cleanly before and cleanly after the event at comparable ages. Do not report that history is unavailable until you have counted it. A "before" group whose measurements were taken after the event is not a before group.

## Test joins, do not infer them from names

For a proposed join, compare row counts, distinct keys, and unmatched keys on both sides. State its cardinality at the grain the analysis needs. If multiple records exist per key, establish which record is valid as of the event or aggregate to the intended grain first. Do not repair a many-to-many join with unexplained DISTINCT.

Check whether the join changes population membership: an inner join may exclude inactive users, unpaid invoices, or unmatched historical records. Name what is dropped. A join that matches well overall can still fail for one period or segment.

## Probe for the question

Choose small, interpretable summaries tied to the ask: numerator/denominator counts, coverage by period, category frequencies, and distributions where averages could hide a tail. Compare totals with an independent supplied source if one exists. Identify candidate definitions and ambiguity; column names are not approved metric definitions.

Do not turn an exploratory correlation into a finding or expose unnecessary raw personal records in the output. When data access is missing, produce the exact bounded probes needed and label them unexecuted.

When a probe shows a source defect — rows missing for a period, a refresh that stopped, duplicates on a key meant to be unique — follow [data issues](references/data-issues.md): measure it, keep exploring around it, and leave a note for its owner.

## Return a data map

Report each relevant source's grain, key, units, coverage, freshness, safe join conditions, known limits, and data issues noted with query or file references. Separate observations from inferred meanings and open questions. Finish with the questions answerable now, the smallest additional information needed for others, and the checks a later analysis should retain. This map is proposed context, not an approval or a guarantee about future data.
