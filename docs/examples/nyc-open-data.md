---
title: Two questions on New York City open data
description: Real agent runs produce one inconclusive comparison and one descriptive answer, with their evidence and mistakes preserved.
kicker: Worked example · Public data
---

The NYC example contains two completed Findings from real agent runs: a comparison of trips into the Congestion Relief Zone, and a comparison of Citi Bike members' e-bike use. Both are included in the repository and reviewed by agents. Neither has human publication approval. Their metric definitions remain proposed.

These examples use the Aftergrid Engine's retained-input and review workflow. They are more involved than the [small CSV quickstart](../guides/quickstart.md), and their run log includes failed attempts and corrections.

## A rise that did not survive its own check

The first question compared trips into the zone in January 2025 with January 2024. The coverage is yellow taxi and high-volume app-based for-hire trips that started or ended in the zone, counted once. It does not cover all vehicles entering Manhattan.

In the completed second revision, the whole-month weekday average was 5.3% higher. But among five weekday pairs matched on day of week, non-holiday status, and the example's proposed weather-comparability rule, the average was 5.4% lower. The test written before that revision's queries required the direction to hold in the matched comparison. It failed.

The weekend comparison had only one weather-comparable pair, below the chosen minimum of three. It could not establish whether the observed whole-month direction held under that check.

The Finding is **inconclusive**. That does not erase the calculated increase over the whole month. It means the stronger directional interpretation did not survive the test the analysis set for itself. Neither comparison estimates the causal effect of congestion pricing; matching on these few attributes does not remove every competing explanation.

There is further context worth keeping: separating weekdays and weekends was chosen after an earlier run had seen the monthly totals. The revised comparisons are therefore labeled as follow-up analyses. The new falsifier was recorded before the revision's queries, but the entire investigation was not blind to the earlier result.

## A descriptive answer with a visible caveat

The second question asked whether Citi Bike members were riding e-bikes more than a year earlier. Member e-bike rides rose from 1,055,584 in January 2024 to 1,329,923 in January 2025. Their share of all member rides rose from 62.8% to 69.2%.

The count and share moved together, satisfying this Finding's stated falsifier. Its outcome is **answered**, as a descriptive comparison. The months were not comparable on the example's weather rule. That caveat sits beside the answer; the result does not establish why usage changed or what a fee change caused.

The first draft also contained a useful failure: percent-change operands were reversed, producing negative percentages beside prose describing increases. Valid arithmetic alone did not catch that semantic mistake. The method reviewer did, and the run stopped for correction. The final artifact retains the earlier review history alongside reviews of the corrected content.

## Inspect the evidence

The [run log](https://github.com/patrickjmorris/aftergrid/blob/main/examples/nyc-open-data/docs/run-log.md) records the attempts, halts, operator decisions, and repairs. Each Finding directory contains its memo, manifest, executed queries, saved results, checks, chart specifications, retained inputs, and rendered page:

- [Congestion-zone Finding](https://github.com/patrickjmorris/aftergrid/tree/main/examples/nyc-open-data/analytics/findings/2026-09-17-crz-trips-after-pricing)
- [Member e-bike Finding](https://github.com/patrickjmorris/aftergrid/tree/main/examples/nyc-open-data/analytics/findings/2026-09-17-member-ebike-share-jan2025)

Open `render/finding.html` locally from either directory to read the saved page. Its draft status is part of the result. Merging an example into a repository and obtaining agent reviews do not confer human publication approval.

## Reproduce the example

The data builders fetch publisher data from NYC TLC, NOAA, and Citi Bike. Follow the [build instructions](https://github.com/patrickjmorris/aftergrid/tree/main/examples/nyc-open-data/scripts) and [source notices](https://github.com/patrickjmorris/aftergrid/blob/main/examples/nyc-open-data/NOTICE.md) for exact coverage, processing, and attribution. The source build downloads substantial data; the small teaching cases require no such download.

To explore the analytical question with installed skills, start with:

```text
/plan-analysis Review the NYC example's source coverage and proposed
definitions. Design a comparison of member e-bike use across the two
Januaries. State what would count as a descriptive answer, what could
undermine it, and what this design cannot say about causation.
```

Use `$plan-analysis` in Codex. Read the completed Finding afterward to compare the choices. This is a worked example, not a blind evaluation when its answer is already visible. Its value is the inspectable chain from question to evidence, including where the original runs needed correction.
