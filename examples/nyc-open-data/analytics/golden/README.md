# Golden Questions

One file per reference case: a Question with a reviewed expected answer within tolerances, **or** an expected
abstention. A golden Question is how you find out that the Engine and this Instance still agree after a model,
skill or definition change.

`<question_id>.yaml` carries the raw ask, the Reader, the expected outcome (including `insufficient_data` and
`needs_reframing`, which are real answers), the definition ids and tables the Analysis is expected to use, the
values it must land on with their tolerances, what the Finding must state, and what it must not conclude.

The Engine ships worked examples under `fixtures/instance/analytics/golden/`. Nothing is scaffolded here,
because a golden Question is a judgment about your data that only you can make.

## Golden Questions, and the numbers behind them

Five reference cases. **Every value below was computed from the built database on 2026-09-17**; none was
estimated, rounded from memory or carried over from a published figure. Tolerances on counts are `0` on
purpose: a later rebuild that disagrees has hit a TLC restatement, which is worth knowing.

### `crz_trips_jan2025_vs_jan2024` — expected `answered`, `associational`

The headline case, and the answer is not the one the count alone suggests.

| | January 2024 | January 2025 | Change |
| --- | --- | --- | --- |
| Trips into the zone | 9,037,182 | 9,277,575 | **+2.7 %** |
| All yellow + HVFHS trips | 22,628,536 | 23,880,870 | **+5.5 %** |
| Zone share of all trips | 0.399371 | 0.388494 | **−1.09 pp** |

Trips into the zone rose — and rose *less* than trips everywhere, so the zone's share of all trips fell. Both
sentences are about the same data, and the Finding has to carry both. The weather Check's outcome is part of
what must be stated: 10 of the 31 aligned day pairs are comparable and **21 are not**.

### `tip_rate_after_pricing` — expected `inconclusive`

| Month | Tip rate | Step from the previous month in this Instance |
| --- | --- | --- |
| 2024-01 | 0.183541 | — |
| 2024-12 | 0.175953 | −0.007589 *(against January 2024: an eleven-month gap, not a month-on-month step)* |
| 2025-01 | 0.173272 | **−0.00268** — the move at the policy date |
| 2025-02 | 0.162998 | **−0.010274** — the very next move, with no policy change behind it |

`inconclusive`, not `insufficient_data`: every month asked for is present and complete and the metric computes.
The step at the change is *smaller* than the step immediately after it, four non-consecutive months give no
baseline for ordinary variation, and the rate is diluted by a cash share this grain cannot observe.

### `fewer_taxi_rides_citywide_because_of_pricing` — expected `needs_reframing`

| | January 2024 | January 2025 |
| --- | --- | --- |
| All trips citywide | 22,628,536 | 23,880,870 (**+5.5 %**) |
| Yellow only | 2,964,606 | 3,475,204 (**+17.2 %**) |
| Trips touching neither end of the zone | 13,591,354 | 14,603,295 |

Three defects at once: the denominator is wrong (three trips in five never touch the zone and were never
charged), "cause" is unavailable from an observational before/after with no randomization and no control area,
and the premise is false — citywide rides rose. Reporting the true direction while keeping the causal frame
would be the worse failure.

### `ebike_share_members_2025_vs_2024` — expected `answered`, `descriptive`

| | January 2024 | January 2025 |
| --- | --- | --- |
| Member rides | 1,679,647 | 1,922,501 (**+14.5 %**) |
| Member rides on an e-bike | 1,055,584 | 1,329,923 |
| Member e-bike share | 0.628456 | 0.691767 (**+6.3 pp**) |

The share rose *and* the total rose, which is what makes a share safe to report at all. **The Question does not
name a fee change or a date**, deliberately: Citi Bike has changed e-bike pricing more than once, and this
Reader will reach for that first — but no fee schedule, amount or date is in any of the three sources, in
`NOTICE.md` or in the example README, so asserting one would be inventing evidence. The golden records it as an
open input for the Operator: a sourced, dated fee document has to be added to this Instance before any Finding
here may name a fee change.

### `weather_confounded_comparison` — expected `inconclusive`

The case where the Check has to stop the Analysis. Same month pair, aligned day by day:

| | Value |
| --- | --- |
| Aligned day pairs | 31 |
| Comparable | **10** |
| Not comparable | **21** |
| Unknown (missing observation) | 0 |
| Largest same-day TMAX gap | 14.4 °C |

| | January 2024 | January 2025 |
| --- | --- | --- |
| Mean TMAX | 5.53 °C | 2.55 °C |
| Total precipitation | 134.1 mm | 15.5 mm |
| Wet days (≥ 1 mm) | 15 | 4 |

Ten days is not a January. This does not contradict the headline case: that one *describes* what changed and
states the Check's failure as a limitation; this one asks for a weather-matched comparison, which the same
failure makes unavailable.

### Reproducing the numbers

With a built `demo.duckdb` in this directory:

```bash
node --test src/examples-instance.test.ts
```

Its last test recomputes every reference value through the DuckDB adapter and skips out loud when the data is
absent. `src/examples-instance.test.ts` also runs in CI, where it validates the committed files and skips that
one test — it needs no data and makes no network call.

`node src/cli.ts eval --golden all --analyzer fixture --instance examples/nyc-open-data/analytics` runs and
loads all five goldens, but it reports five `not_run` cases and says so itself: with no recorded run under
`fixtures/runs/` the fixture analyzer declines, and **no reference query executes**. Recomputation needs
`--analyzer command` with a real model, or the test above.
