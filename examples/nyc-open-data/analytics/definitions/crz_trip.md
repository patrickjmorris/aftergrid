---
id: crz_trip
version: 1
kind: metric
lifecycle: proposed
grain: pickup date × service × in_crz — the grain of crz_daily, derived from trips_daily by scripts/derive-question-tables.mjs
population: yellow taxi and high-volume for-hire trips whose pickup zone or dropoff zone is one of the 38 taxi zones in crz_zones
denominator: all yellow and high-volume for-hire trips in the same window, zone or no zone
window: stated per Analysis as a half-open range of pickup dates; pickup_date is the date the TLC file carries, which is local New York time
owner: Patrick Morris
---
A **trip into the Congestion Relief Zone** is a yellow taxi or high-volume for-hire trip that either *started*
in the zone or *ended* in it. "Into" is the word the Question uses; the rule is *touches*, in either direction.

The zone is the 38 taxi zones in `crz_zones` — Manhattan south of 60th Street, as the build script's
hand-checked list defines it (`examples/nyc-open-data/scripts/README.md`, "The Congestion Relief Zone"). It is a
map, not a derivation from the data.

Three things this definition is not, each of which is a different number:

- **Pickups only is a different metric.** Counting trips that *start* in the zone answers "how much are people
  leaving the zone by taxi", not "how much traffic is the zone drawing". Roughly half the trips here are one and
  not the other. An Analysis that wants pickups-only must define it separately and say so in the Claim.
- **A trip that both starts and ends in the zone is counted once**, not twice. The `or` is over one row of
  `trips_daily`, which already carries the pickup zone and the dropoff zone together.
- **It is not "trips that paid the congestion fee".** `cbd_congestion_fee_sum` exists in the 2025 files and is
  charged for touching the zone, including on trips a zone *outside* this list collected it on. The fee is
  evidence about the list; it is not the list.

Trips the TLC publishes with a null pickup or dropoff zone, and the ids 264/265 that mean "unknown", are not in
`crz_zones`, so they never enter the numerator. They stay in the denominator, because a trip with an unknown end
is still a trip that happened. An Analysis that reports a share must say so.

## Where it is computed

**From `crz_daily`, not from `trips_daily` directly.** `crz_daily` is a bounded table the Operator derives
inside this Instance's own DuckDB file with
[`../../scripts/derive-question-tables.mjs`](../../scripts/derive-question-tables.mjs): one row per pickup date
× service × `in_crz`, where `in_crz` is exactly the rule above — pickup zone **or** dropoff zone in `crz_zones`
— evaluated once, at the build, instead of in every Analysis. `trips_daily` at this Instance's window is
5,390,695 rows against an admission cap of 5,000,000, so `aftergrid capture` refuses it whole and the contract's
answer is a bounded per-Question table beside it (`docs/contracts/adapters.md`, "Large sources: the windowed
Instance pattern"). `crz_daily` is 484 rows and is admissible.

Three consequences a Finding using this definition has to carry:

- **The derivation is evidence, not a shortcut.** The script is in this repository and writes a
  `build_provenance` row (`source` `derived:crz_daily`, `fetch_mode` `derived`) naming what it read and when.
- **A Snapshot over `crz_daily` retains the derived table, not the TLC files.** A rerun reproduces the analysis
  over `crz_daily`. Say that, rather than implying the raw trip records were retained.
- **The window still lives in the SQL.** `crz_daily` holds every date `trips_daily` holds; it is a smaller
  grain, not a smaller period. The `$from`/`$to` below are what decide which days are in.

The denominator is in the same table: the rows where `in_crz` is false are the trips that touched neither end of
the zone, so `sum(trips) filter (where in_crz) / sum(trips)` over a window is the share, from one scan.

This is still **version 1**. The rule — a trip that starts or ends in the zone, counted once — has not changed;
only the table it is read from has. The definition is `proposed` and carries no `approval` block, so no
attestation is pinned to a previous content hash (`docs/contracts/instance-layout.md`), and there is nothing a
version bump would protect.

## SQL (duckdb)

```sql
-- Parameters: $from (first pickup date, inclusive), $to (first pickup date after the window, exclusive).
-- Table: crz_daily, derived from trips_daily and crz_zones by scripts/derive-question-tables.mjs.
select pickup_date,
       service,
       sum(trips) as crz_trips
from crz_daily
where in_crz
  and service in ('yellow', 'hvfhs')
  and pickup_date >= $from::DATE
  and pickup_date < $to::DATE
group by 1, 2
order by 1, 2
```
