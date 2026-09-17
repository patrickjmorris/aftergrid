---
id: crz_trip
version: 1
kind: metric
lifecycle: proposed
grain: pickup date × service × pickup zone × dropoff zone — the grain of trips_daily
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

## SQL (duckdb)

```sql
-- Parameters: $from (first pickup date, inclusive), $to (first pickup date after the window, exclusive).
-- Tables: trips_daily, crz_zones.
select t.pickup_date,
       t.service,
       sum(t.trips) as crz_trips
from trips_daily t
where t.service in ('yellow', 'hvfhs')
  and t.pickup_date >= $from::DATE
  and t.pickup_date < $to::DATE
  and (t.pu_location_id in (select location_id from crz_zones)
       or t.do_location_id in (select location_id from crz_zones))
group by 1, 2
order by 1, 2
```
