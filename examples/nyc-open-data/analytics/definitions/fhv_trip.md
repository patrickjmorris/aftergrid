---
id: fhv_trip
version: 1
kind: metric
lifecycle: proposed
grain: pickup date × pickup zone × dropoff zone, for the high-volume for-hire service only
population: high-volume for-hire vehicle trips (the TLC's HVFHS records), counted on their pickup date
denominator: not a rate; a count. An Analysis that divides by all trips must name trips_daily's own total, which is yellow plus high-volume for-hire and nothing else
window: stated per Analysis as a half-open range of pickup dates; pickup_date is the date the TLC file carries, which is local New York time
owner: Patrick Morris
---
An **FHV trip** here is one row of the TLC's **high-volume** for-hire records (`fhvhv_tripdata`): a trip
dispatched by a licensed high-volume service — in practice Uber, Lyft and Via. In `trips_daily` it is
`service = 'hvfhs'`.

**The id says `fhv` and the data says HVFHS, and those are not the same population.** The TLC publishes a
separate `fhv_tripdata` file for the rest of the for-hire fleet — black car, livery, luxury limousine — and this
build does not fetch it. So an "FHV trip" in this Instance excludes every non-high-volume for-hire trip. The
name is kept because it is what the Reader says; this paragraph is the correction that has to travel with it. An
Analysis that means the whole for-hire fleet cannot answer from this Instance.

**`fare_sum` for HVFHS is `base_passenger_fare`, not a metered fare**, and it is a different quantity from
yellow's `fare_amount`. The build sums each service's own field and keeps `service` in the grain so nothing adds
them together. A definition that wants one "fare" across both services has to say what it means first; this one
does not attempt it.

High-volume for-hire is about four fifths of the trips in `trips_daily` — roughly 1.0 to 1.1 million daily rows
a month against yellow's 0.2 to 0.3 million — so any citywide total is dominated by it.

## SQL (duckdb)

```sql
-- Parameters: $from (first pickup date, inclusive), $to (first pickup date after the window, exclusive).
-- Tables: trips_daily.
select pickup_date,
       sum(trips) as fhv_trips,
       sum(fare_sum) as base_passenger_fare_usd,
       sum(distance_sum) as distance_miles
from trips_daily
where service = 'hvfhs'
  and pickup_date >= $from::DATE
  and pickup_date < $to::DATE
group by 1
order by 1
```
