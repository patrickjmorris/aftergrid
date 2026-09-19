---
title: Two questions about New York
description: Real taxi, weather, and bike data. One inconclusive answer, one descriptive one, dead ends kept.
kicker: Worked example · Public data
---

Two completed Findings from real agent runs: trips into the Congestion Relief Zone, and Citi Bike members' e-bike use. Both are in the repository and agent-reviewed. Neither has human publication approval. Their metric definitions are proposed, not approved.

These use the Engine's retained-input and review workflow, so they are more involved than the [four-row quickstart](../guides/quickstart.md). The run log keeps the failed attempts.

## A rise that did not survive its own check

The first question compared trips into the zone in January 2025 with January 2024: yellow taxi and high-volume app-based for-hire trips that started or ended in the zone, counted once. Not every vehicle entering Manhattan.

In the second revision, the whole-month weekday average was 5.3% higher. Among five weekday pairs matched on day of week, non-holiday status, and a proposed weather-comparability rule, it was 5.4% lower. The test written before that revision's queries required the direction to hold in the matched comparison. It failed.

The weekend comparison had one weather-comparable pair, below the minimum of three, so it could not test the direction at all.

The Finding is **inconclusive**. The whole-month increase is still calculated; the stronger directional reading did not survive the test the analysis set for itself. Neither comparison estimates the causal effect of congestion pricing.

One more thing kept on the record: splitting weekdays from weekends was chosen after an earlier run had seen the monthly totals, so the revised comparisons are labeled follow-up analyses. The falsifier was recorded before the revision's queries, but the investigation as a whole was not blind to the earlier result.

## A descriptive answer with a visible caveat

The second question asked whether Citi Bike members were riding e-bikes more than a year earlier. Member e-bike rides rose from 1,055,584 in January 2024 to 1,329,923 in January 2025; their share of member rides rose from 62.8% to 69.2%.

Count and share moved together, satisfying the stated falsifier. Outcome: **answered**, as a descriptive comparison. The months were not weather-comparable, and that caveat sits beside the answer. The result does not say why usage changed or what a fee change caused.

The first draft had a useful failure: percent-change operands were reversed, producing negative percentages beside prose describing increases. The arithmetic was valid. The method reviewer caught it and the run stopped for correction. The final artifact keeps the earlier review history beside the reviews of the corrected content.

## Inspect the evidence

The [run log](https://github.com/patrickjmorris/aftergrid/blob/main/examples/nyc-open-data/docs/run-log.md) records attempts, halts, operator decisions, and repairs. Each Finding directory has its memo, manifest, executed queries, saved results, checks, chart specs, retained inputs, and rendered page:

- [Congestion-zone Finding](https://github.com/patrickjmorris/aftergrid/tree/main/examples/nyc-open-data/analytics/findings/2026-09-17-crz-trips-after-pricing)
- [Member e-bike Finding](https://github.com/patrickjmorris/aftergrid/tree/main/examples/nyc-open-data/analytics/findings/2026-09-17-member-ebike-share-jan2025)

Open `render/finding.html` from either directory to read the saved page. Its draft status is part of the result. A merged PR and agent reviews are not human publication approval.

## Reproduce the example

The data builders fetch from NYC TLC, NOAA, and Citi Bike. See the [build instructions](https://github.com/patrickjmorris/aftergrid/tree/main/examples/nyc-open-data/scripts) and [source notices](https://github.com/patrickjmorris/aftergrid/blob/main/examples/nyc-open-data/NOTICE.md) for coverage, processing, and attribution. The build downloads a lot of data; the four-row cases do not.

To work the question with installed skills:

```text
/plan-analysis Review the NYC example's source coverage and proposed
definitions. Design a comparison of member e-bike use across the two
Januaries. State what would count as a descriptive answer, what could
undermine it, and what this design cannot say about causation.
```

Use `$plan-analysis` in Codex. Then read the completed Finding and compare choices. With the answer visible this is a worked example, not a blind test. Its value is the inspectable chain from question to evidence, including where the runs needed correction.
