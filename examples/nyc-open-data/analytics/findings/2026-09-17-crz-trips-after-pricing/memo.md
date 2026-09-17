---
finding: fnd_l1lnb6r5tcdr
revision: 2
---

# Weekday and weekend trips into the Congestion Relief Zone, {{literal:January 2025}} against {{literal:January 2024}}

## Answer

We cannot say which way trips into the Congestion Relief Zone moved between {{literal:January 2024}} and {{literal:January 2025}}, on weekdays or on weekend days: over the whole month the average weekday had {{derived:weekday_per_day_pct_change}} more trips into the zone than the same month a year earlier, but among the {{ref:weather_matched_pairs.weekday.comparable_pairs}} pairs of weekdays that were alike the change was {{derived:matched_weekday_pct_change}}, the opposite direction, which is what the test written down in advance said would show the rise wrong, and the weekend change of {{derived:weekend_per_day_pct_change}} could not be tested at all.

<!-- material_caveat -->
The test written down before any new query was run asked whether each direction still holds among days that were alike (same day of the week, no public holiday, comparable weather). It recorded fail for weekdays and could not be run for weekend days. Whichever way trips moved, a difference between {{literal:January 2024}} and {{literal:January 2025}} is not the effect of the charge: nothing here separates the charge from weather, from a year of change in how people travel, or from growth in taxi and app-based trips across the city.

## Decision it informs

What the transport programme lead reports upward about how trips into the zone in {{literal:January 2025}} compare with the same month a year earlier, how firmly to say it, and whether to wait for a longer period before drawing a conclusion. The programme lead owns that decision. The options are to report a direction now, to report the numbers with no direction, or to wait for more months. This Finding supports the second and third and does not support the first.

## Evidence

### This Analysis cannot say which way weekday trips into the zone moved: across the whole month the average weekday had {{derived:weekday_per_day_pct_change}} more trips into the zone than the same month a year earlier, but over the {{ref:weather_matched_pairs.weekday.comparable_pairs}} pairs of weekdays that were alike, trips into the zone changed by {{derived:matched_weekday_pct_change}}. <!-- claim: c1 -->

<!-- chart: trips_per_day_by_day_type_chart -->

Who is counted: yellow taxi and app-based for-hire trips that started or ended in the zone, counted once, on Mondays to Fridays. Private cars, buses, the subway and green taxis are not in the data. Both months have {{ref:crz_by_day_type.baseline_weekday.days}} weekdays, so the averages are over the same number of days.

Across the whole month, the average weekday had {{ref:crz_by_day_type.baseline_weekday.crz_trips_per_day}} trips into the zone in {{literal:January 2024}} and {{ref:crz_by_day_type.after_weekday.crz_trips_per_day}} in {{literal:January 2025}}.

The test written in advance then set each {{literal:January 2025}} day against the {{literal:January 2024}} day on the same day of the week, left out pairs with a public holiday on either side, and kept only pairs where the weather was comparable. Of {{ref:weather_matched_pairs.weekday.matched_pairs}} weekday pairs, {{ref:weather_matched_pairs.weekday.holiday_pairs}} were left out for a holiday and {{ref:weather_matched_pairs.weekday.not_comparable_pairs}} differed on weather. Over the {{ref:weather_matched_pairs.weekday.comparable_pairs}} that were alike, the {{literal:January 2024}} days averaged {{ref:weather_matched_pairs.weekday.base_crz_trips_per_day}} trips into the zone and the {{literal:January 2025}} days {{ref:weather_matched_pairs.weekday.after_crz_trips_per_day}}. That is the opposite direction, which is what the test said would show the whole-month direction wrong.

<!-- table: alike_weekday_pairs_table -->

The limits matter here. One month either side is not a trend. The number of pairs that were alike is the fewest the test allowed, and some of those pairs rose while others fell. Two of them set 2025-01-02 and 2025-01-03, the two days straight after New Year's Day, against 2024-01-04 and 2024-01-05, which were further from the holiday. That was noticed after the result, so it is a reason to write the next test differently; the test was not changed to leave those days out. Looking at weekdays and weekend days apart was itself chosen after an earlier run had shown the monthly totals, so it is a follow-up look, not a comparison planned before the data was seen.

### The average weekend day had fewer trips into the zone than the same month a year earlier, a change of {{derived:weekend_per_day_pct_change}}, and that direction could not be tested: only {{ref:weather_matched_pairs.weekend.comparable_pairs}} of the {{ref:weather_matched_pairs.weekend.matched_pairs}} matched weekend pairs had comparable weather. <!-- claim: c2 -->

<!-- table: trips_per_day_table -->

The same trips, on Saturdays and Sundays. Both months have {{ref:crz_by_day_type.baseline_weekend.days}} weekend days. The average weekend day had {{ref:crz_by_day_type.baseline_weekend.crz_trips_per_day}} trips into the zone in {{literal:January 2024}} and {{ref:crz_by_day_type.after_weekend.crz_trips_per_day}} in {{literal:January 2025}}. A month has few weekend days, so one unusual Saturday moves the average, and the test written in advance needed more weekend pairs that were alike than the two months hold. This direction is reported as a description and was not tested.

### Trips into the zone were a smaller share of all taxi and app-based trips on both kinds of day: {{ref:crz_by_day_type.after_weekday.crz_share}} out of all weekday trips, from {{ref:crz_by_day_type.baseline_weekday.crz_share}} a year earlier, and {{ref:crz_by_day_type.after_weekend.crz_share}} out of all weekend trips, from {{ref:crz_by_day_type.baseline_weekend.crz_share}}. <!-- claim: c3 -->

<!-- table: share_of_all_trips_table -->

Out of all yellow taxi and app-based trips anywhere in the city on those days. On weekdays the share moved by {{derived:weekday_share_change}} because all trips per day grew faster ({{derived:weekday_all_trips_pct_change}}) than trips into the zone. On weekend days it moved by {{derived:weekend_share_change}}: all trips per day barely moved ({{derived:weekend_all_trips_pct_change}}) while trips into the zone fell. A smaller share is not a fall in trips across the city, and all trips here means these two services only. Trips with an unknown zone stay in all trips and never count as into the zone. The share was not part of the test written in advance.

### The two services did not move together: yellow taxi trips into the zone per day changed by {{derived:yellow_weekday_pct_change}} on weekdays and {{derived:yellow_weekend_pct_change}} on weekend days, and app-based for-hire trips by {{derived:hvfhs_weekday_pct_change}} and {{derived:hvfhs_weekend_pct_change}}. <!-- claim: c4 -->

<!-- table: trips_per_day_by_service_table -->

Each service in {{literal:January 2025}} against itself a year earlier. Nothing was left out beyond what the data never held: app-based for-hire here means the high-volume services only, so black car, livery and limousine trips are not counted. This split was not part of the test written in advance, and an earlier run had already shown each service's direction for the month, so it is a follow-up look.

### The two months were not alike on weather: only {{derived:comparable_pairs_all}} matched pairs of days had comparable weather and {{derived:not_comparable_pairs_all}} did not, and {{literal:January 2025}} was colder and much drier. <!-- claim: c5 -->

<!-- table: weather_by_month_table -->

Readings from the Central Park weather station. Two days count as comparable when their highs are within {{literal:5}} degrees Celsius of each other and both are dry or both are wet (comparable_weather_day v1, a proposed rule that does not look at snow). The average daily high was {{ref:weather_by_period.baseline.mean_tmax_c}} degrees in {{literal:January 2024}} and {{ref:weather_by_period.after.mean_tmax_c}} in {{literal:January 2025}}; there were {{ref:weather_by_period.baseline.wet_days}} wet days against {{ref:weather_by_period.after.wet_days}}. Pairs with a public holiday on either side are left out of the count. A weather match would not turn the comparison into a measure of the charge, and a mismatch does not explain the difference. Every pair is listed below.

<!-- table: matched_pair_days_table -->

## How we checked

- The test written in advance, falsifier_direction_holds_in_matched_weather_pairs, recorded fail where pass was expected. Its SQL, its expected result, that it is not a validity condition, and the wording of the test in the Question were pinned in analysis.yaml before any query of this revision was written, and aftergrid check compares all four with what ran. It was not loosened, re-aimed or rewritten after its result was seen, and no second test was written once it failed.
- Six other Checks recorded pass: inv_day_type_split_matches_definition (weekdays plus weekend days add up to the whole month and follow the definition as written), inv_matched_pairs_aligned (the pairs are what they are said to be), inv_grain_unique_and_valid (nothing is double counted), inv_definition_sql_matches_analysis (the monthly totals follow the crz_trip definition as written), min_data_every_day_present (both months are whole) and min_data_weather_observed (every day has a weather reading).
- The three definitions used, crz_trip v1, weekday_share v1 and comparable_weather_day v1, are proposed and not approved. They were used as written at the Operator's direction. crz_trip v1 cannot headline a published decision metric until its owner approves it.
- A Check that passed shows the numbers were counted the way this page says. It does not show that the charge moved anything, and it does not make the two months safe to compare. The Checks show the analysis follows the definitions' text; they are not a reconciliation against an approved definition, because none exists.
- This is the second revision of this Finding. The first asked for one direction for the whole month; its own test written in advance recorded fail, and the Operator then decided that weekdays and weekend days are separate questions. Because that choice came after the monthly totals had been seen, every comparison here is marked as a follow-up look. Only the new test had not been seen by anyone before it ran.
- The holiday dates and the minimum numbers of pairs in the test are the analyst's choices, made before any query; no document in the Instance sets them.
- aftergrid ran every query and Check itself on a retained copy of the inputs, and a rerun reproduced every result exactly. The Snapshot guarantees artifact_replay and analysis_rerun.
- Written for the Reader profile city_transport_analyst, which is a composite and not a person.
- No human has approved this Finding. Any review recorded by an agent is listed by the page itself and is not an approval.

## What would change our mind

The test written in advance has already fired, so it is no longer an open test. It asked whether the whole-month direction for each kind of day still holds among days matched on the day of the week, with no public holiday and comparable weather. For weekdays it does not. For weekend days there were too few such pairs to run it.

What would settle the Question instead:

- More months after {{literal:January 2025}}, and the same months a year earlier. One month against one month yields very few days that are alike; the same test over several months would have enough to test both directions.
- A test whose pairs also avoid the days straight after a public holiday, written before those months are looked at.
- A holiday list kept in the Instance, so the holiday dates stop being the analyst's.
- A recorded start date for the charge, if any day inside the month is to be treated as before it.

No Claim here can be re-checked automatically. Each names Patrick Morris as the owner of a re-check, and the step is the same for all of them: rebuild the data with later months and rerun the same Checks unchanged. The weather description in the last Claim is about two fixed months and does not change with new data. The Instance holds trips up to 2025-02-28 and weather up to 2025-02-05, so the earliest a re-check means anything is when the build holds at least one more whole month with weather and the matching month a year earlier; no date for that is recorded.

## Appendix

Queries, each with a result of the same id under results/: crz_by_day_type (queries/crz_by_day_type.sql), crz_by_day_type_service (queries/crz_by_day_type_service.sql), crz_trips_by_period (queries/crz_trips_by_period.sql, context only), weather_matched_pairs (queries/weather_matched_pairs.sql), matched_pair_days (queries/matched_pair_days.sql) and weather_by_period (queries/weather_by_period.sql).

Parameters: analytical_timezone America/New_York; base_from 2024-01-01, base_to 2024-02-01, after_from 2025-01-01, after_to 2025-02-01 (each range stops before its last date); for the matched pairs, pair_base_from 2024-01-03, pair_after_from 2025-01-01 and pair_days {{literal:29}}. The public holidays written into the SQL are 2024-01-01, 2024-01-15, 2025-01-01 and 2025-01-20.

What was run and by which tool: aftergrid execute, with the duckdb adapter, ran every query and Check once on the retained inputs, never on the live database. The retained inputs are inputs/crz_daily.csv, inputs/weather_daily.csv and inputs/build_provenance.csv, whole-table copies captured on 2026-09-17 after the Question was settled. crz_daily is a daily table the Operator derives from the TLC trip files; the trip files themselves were not retained.

The account of how the Question changed between revisions, including the looks taken after results were seen, is in analysis.yaml under probes. The first revision is archived under revisions/ and in git.
