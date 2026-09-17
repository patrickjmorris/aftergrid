---
finding: fnd_jtk514b8viry
revision: 1
---

# E-bikes carried more of member riding than a year earlier

## Answer

Yes. Members took more rides on e-bikes than in the same month a year earlier, and e-bikes were a bigger share of their riding.

<!-- material_caveat -->
These are rides, not riders: the files carry no rider identity, so one member riding far more often and many more members riding look exactly the same here. And this describes two Januaries rather than explaining them - the two months were not alike on weather, {{literal:January 2025}} being colder and much drier, and nothing here separates that from a fee change, from more e-bikes in the system, or from a year of change in how people ride. The weather test behind that was written before any weather number was read from the data kept here, but it was not a blind test: another Finding in this Instance covering the same two months had already reported the weather as not alike, so the likely outcome was known when the bar was set. This Instance records no date for any Citi Bike fee change, so this Finding names none.

## Decision it informs

Whether e-bike use among member rides is growing, flat or moving with something else. The bike share product manager owns it. The options this Finding speaks to are: treat e-bike demand among members as growing and plan for it; wait for more months before planning around one January against another; or ask for the one thing missing here - a dated record of when e-bike fees changed - before reading anything into the timing. Nothing in this Instance records how big a change would have to be before it is worth acting on, so this Finding reports the size of the change and does not call it large or small.

## Evidence

### Members rode e-bikes more in {{literal:January 2025}} than in {{literal:January 2024}}, both in rides and as a share of their riding: {{ref:member_ebike_by_period.after.member_ebike_rides}} e-bike rides against {{ref:member_ebike_by_period.baseline.member_ebike_rides}}, and {{ref:member_ebike_by_period.after.member_ebike_share}} of member rides against {{ref:member_ebike_by_period.baseline.member_ebike_share}}. <!-- claim: c1 -->

<!-- chart: member_ebike_share_chart -->

Who is counted: every Citi Bike ride taken under a membership in the New York City monthly files, on ride dates from 2024-01-01 to 2024-01-31 and from 2025-01-01 to 2025-01-31 - {{ref:member_ebike_by_period.after.member_rides}} rides in the later month and {{ref:member_ebike_by_period.baseline.member_rides}} in the earlier one. The word "members" here counts rides taken under a membership, never people: the files carry no rider identity and no way to link one ride to the next.

Compared with what: the same month a year earlier, so a winter month is set against a winter month, whole month against whole month. Both months are complete, with every day present.

The share is out of all member rides in that month, e-bikes and classic bikes together. Rides on e-bikes rose by {{derived:member_ebike_rides_pct_change}}, and their share of member riding rose by {{derived:member_ebike_share_change}}.

<!-- table: member_ebike_by_period_table -->

Left out: Jersey City rides are in separate files this build does not fetch, so they are absent rather than zero. Rides whose start or end time does not read, or whose end comes before its start, were dropped by the build. A ride belongs to the month its start time falls in.

Limits: one month either side is not a trend. The two definitions used - member_ride v1 and ebike_ride v1 - are proposals their owner has not approved. What was kept is the daily summary table, not the Citi Bike trip files themselves.

### The bigger share is not a shrinking total: members took {{ref:member_ebike_by_period.after.member_rides}} rides in all, up from {{ref:member_ebike_by_period.baseline.member_rides}}, while their rides on classic bikes went from {{ref:member_ebike_by_period.baseline.member_classic_rides}} to {{ref:member_ebike_by_period.after.member_classic_rides}}. <!-- claim: c2 -->

<!-- table: member_rides_split_table -->

A share can rise because the thing on top grew or because everything else shrank. Here member riding as a whole changed by {{derived:member_rides_pct_change}} and rides on classic bikes by {{derived:member_classic_rides_pct_change}}, against {{derived:member_ebike_rides_pct_change}} for e-bikes. So e-bikes grew faster than member riding as a whole, on a total that grew.

<!-- chart: member_rides_total_chart -->

Limits: a count of rides is not a count of riders, so more member rides is not the same as more members. Both months are whole calendar months, but they do not have the same number of weekend days in the same places, and this Finding does not adjust for that.

### Casual riders moved the same way, so this is not something happening only to members: e-bikes were {{ref:rides_by_period_member_type.after_casual.ebike_share}} of casual rides against {{ref:rides_by_period_member_type.baseline_casual.ebike_share}} a year earlier, on a casual ride total that changed by {{derived:casual_rides_pct_change}}. <!-- claim: c3 -->

<!-- table: rides_by_member_type_table -->

Casual riders were already more likely than members to take an e-bike, and the gap between the two kinds of rider stayed. Their share rose by {{derived:casual_ebike_share_change}}, against {{derived:member_ebike_share_change}} for members.

Limits: casual covers both a single ride and a day pass, and these files do not separate them. The casual share sits on far fewer rides than the member share, so it moves more easily. Two groups moving together does not say what moved them.

### The two Januaries were not alike on weather: {{ref:weather_pairs.comparable.day_pairs}} of {{ref:weather_pairs.comparable.all_day_pairs}} matched-up days were alike, and {{literal:January 2025}} was colder and much drier. <!-- claim: c4 -->

<!-- table: weather_pairs_table -->

Two days count as alike when their daily high temperatures are within five degrees Celsius of each other and both are wet or both are dry. Matching the first day of one month against the first day of the other, and so on through the month, most pairs were not alike.

<!-- table: weather_by_period_table -->

The average daily high changed by {{derived:mean_tmax_change_c}} degrees Celsius, and the number of days with rain or more changed by {{derived:wet_days_change}}. Drier weather makes cycling easier, so this is a live competing explanation for the change in riding above, and nothing in this Finding separates the two.

Limits: the rule used here does not look at snow, and {{literal:January 2025}} had more snow by depth than {{literal:January 2024}}. Days are matched by their number in the month, not by day of the week. One weather station stands in for the whole city. Two months being alike on weather would not have made this comparison a cause, and their not being alike does not by itself explain the difference in riding.

### Both months come from Citi Bike archive files republished on the same day, {{ref:source_provenance.2025-01.http_last_modified}}, and read as a stream rather than kept, so each file is identified by its size and that date rather than by a fingerprint of its contents. <!-- claim: c5 -->

<!-- table: source_provenance_table -->

Neither side of the comparison is fresher than the other, which matters because Citi Bike can republish a month after the fact.

Limits: a streamed file has no fingerprint, so a rebuild cannot prove it read the same bytes - only a file of the same size with the same publication date. If Citi Bike republishes either month, a rebuild could disagree with these numbers.

## How we checked

- Nothing is double counted: inside both months the daily table has one row per ride date, kind of rider and kind of bike, with no missing or negative counts (Check inv_grain_unique_and_valid, required, passed).
- The share is a two-way split: the only kinds of bike in these months are classic and electric, with no third kind that would change what the share is out of (Check inv_no_third_bike_type, required, passed).
- The totals match the definitions as written, and the two definitions agree with each other where they overlap (Check inv_definition_sql_matches_analysis, required, passed).
- Both months are whole: every calendar day carries member rides on both kinds of bike (Check min_data_every_day_present, passed).
- The weather is fully observed: every day of both months has a high temperature and a precipitation reading, so no matched-up day is unknown for want of data (Check min_data_weather_observed, passed).
- The two months were **not** alike enough on weather: the bar, set before any weather number was read from the data kept here, was more than half of the matched-up days alike, and fewer than half were (Check check_weather_comparable, **failed**). The bar was **not** set blind: another Finding in this Instance covering the same two months had already reported the weather as not alike, and that was known when this bar was written, so the bar is the natural one and set in the harder direction but it is not a blind pre-registration. This Check is not one the numbers depend on - it is a fact about how alike the two months were, and it is why the caveat beside the Answer is the one it is.
- The falsifier, written before any ride number existed, passed: see the next section.
- Definitions used: member_ride v1, ebike_ride v1 and comparable_weather_day v1. **All three are proposals and none has been approved by its owner.** None of them may headline a published number until it is.
- Data: a kept copy of the daily ride-count table, the daily weather readings and the build's own record of what it fetched. Anyone can replay these numbers from the saved results, and rerunning the queries against the kept copies reproduced every one of them exactly.
- Written for the bike share product manager profile, which is a composite of the role and not a real person; nobody in that role has read a Finding here yet.
- **No review and no approval is recorded on this Finding.** It is a draft.
- None of these Checks says the answer is right. They say the ride counts are what the files say, that both months are whole, and that the weather was not alike. Whether the change means what it looks like it means is the judgement the caveat beside the Answer is about.

## What would change our mind

The falsifier, fixed in writing before any ride was counted, said this: the Answer names one direction for member e-bike riding, and it is wrong if the two ways of reading "more" disagree - if the number of member rides on e-bikes and the share of member rides that were on e-bikes did not move the same way. Both moved up, so it passed (Check falsifier_count_and_share_agree, expected to pass). It was not loosened, re-aimed or rewritten at any point.

What this Finding cannot be re-tested against: the data here stop at {{literal:February 2025}}, so the same comparison cannot be run again on newer months from this Instance. Rebuilding with {{literal:January 2026}} in it and rerunning the same Checks unchanged is what would test whether the direction held, so the earliest a re-check means anything is once that month has been published. The weather description is about two fixed months and does not change when new data arrives, and what the build read is a fact about this build rather than something a later run re-tests.

What would change the answer to the fee question underneath this one: a sourced, dated record in this Instance of when Citi Bike e-bike fees changed and by how much. There is none in any source read here, which is why this Finding says nothing about fees.

## Appendix

- Queries, under queries/: member_ebike_by_period (the comparison fixed in advance), rides_by_period_member_type, member_ebike_daily, weather_pairs, weather_by_period, source_provenance.
- Results, under results/, one per query and named the same.
- Checks, under checks/: inv_grain_unique_and_valid, inv_no_third_bike_type, inv_definition_sql_matches_analysis, min_data_every_day_present, min_data_weather_observed, check_weather_comparable, falsifier_count_and_share_agree.
- Kept copies of the data, under inputs/: citibike_daily.csv, weather_daily.csv, build_provenance.csv. Their fingerprints are in the manifest.
- Parameters, the same for every ride query: baseline month from 2024-01-01 up to but not including 2024-02-01; after month from 2025-01-01 up to but not including 2025-02-01; analytical timezone America/New_York. The ride date in the file is already the local New York date, so no timezone conversion is applied and that parameter is recorded rather than used.
- Run by the aftergrid DuckDB adapter against the kept copies, never against a live source.
