---
id: taxi_trip
version: 1
kind: metric
lifecycle: proposed
grain: pickup date × pickup zone × dropoff zone, for the yellow service only
population: yellow medallion taxi trips as the TLC publishes them, counted on their pickup date
denominator: not a rate; a count. An Analysis that divides by all trips must name trips_daily's own total, which is yellow plus high-volume for-hire and nothing else
window: stated per Analysis as a half-open range of pickup dates; pickup_date is the date the TLC file carries, which is local New York time
owner: Patrick Morris
---
A **taxi trip** is one row of the TLC's yellow trip records: a metered trip in a yellow medallion cab. In
`trips_daily` it is `service = 'yellow'`, and `trips` is how many of them fell in that day-and-zone-pair group.

What "taxi" does **not** cover here, so the word is not read wider than the data:

- **Green (boro) taxis are not in this build at all.** The build script fetches yellow and high-volume for-hire;
  `green_tripdata` is not among its sources, so a green trip is absent, not zero.
- **An Uber or Lyft trip is not a taxi trip.** It is `fhv_trip`, and the two are kept apart in the `service`
  column precisely so nothing adds them by accident.
- **`fare_sum` for yellow is the metered `fare_amount`** — before tip, tolls, surcharges and the congestion fee,
  which are their own columns. It is not what the passenger paid.

The build drops rows whose pickup timestamp falls outside the file's own month, so a month means a month. It
keeps rows with a null or unknown (264/265) zone exactly as published.

## SQL (duckdb)

```sql
-- Parameters: $from (first pickup date, inclusive), $to (first pickup date after the window, exclusive).
-- Tables: trips_daily.
select pickup_date,
       sum(trips) as taxi_trips,
       sum(fare_sum) as metered_fare_usd,
       sum(distance_sum) as distance_miles
from trips_daily
where service = 'yellow'
  and pickup_date >= $from::DATE
  and pickup_date < $to::DATE
group by 1
order by 1
```
