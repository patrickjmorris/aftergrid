---
id: tip_rate
version: 1
kind: metric
lifecycle: proposed
grain: one window (a month, unless the Analysis says otherwise), yellow service only
population: yellow taxi trips in the window
denominator: the sum of metered fare (fare_amount) over the same yellow trips, including trips that recorded no tip
window: stated per Analysis as a half-open range of pickup dates; pickup_date is the date the TLC file carries, which is local New York time
owner: Patrick Morris
---
The **tip rate** is total tips divided by total metered fare, over yellow taxi trips only:
`sum(tip_sum) / sum(fare_sum)` where `service = 'yellow'`.

It is a **ratio of dollars, not an average of per-trip rates.** A big fare with a big tip moves it more than a
short one. That is deliberate — it is the share of fare revenue that arrives as tips — but it is not "what a
typical rider tips", and a Finding must not read it as that.

## Yellow only, and why the other service is excluded rather than merged

`trips_daily` does carry a `tip_sum` for `service = 'hvfhs'`: the build sums the HVFHS `tips` column. What it
does not carry is a denominator that means the same thing. HVFHS's `fare_sum` is `base_passenger_fare`; yellow's
is the metered `fare_amount`. They are different quantities, published by different parties under different
rules, and the build keeps `service` in the grain precisely so nothing divides one by the other. So:

- **available**: tips and base passenger fare for HVFHS, separately, per day and zone pair;
- **not available**: any tip rate comparable across the two services, because the denominators are not the same
  thing. Reporting both as "tip rate" on one chart would be the error this paragraph exists to prevent.

## What the denominator includes, and what cannot be separated out

Every yellow trip in the window is in the denominator, **including cash trips, which record a tip of zero**
whatever the rider handed over. The TLC only sees tips that went through the meter. So this rate is diluted by
cash and it moves when the cash share moves, with no change in anybody's tipping.

`payment_type` would separate them, and the build keeps it — but **only in `trips_sample`**, one trip in a
thousand, and only for yellow (the HVFHS files carry no payment column, so it is null there). At the
`trips_daily` grain the split is not available at all. A card-only tip rate is computable from `trips_sample`
as a **diagnostic** with its own sampling caveat; it is not this definition, and this definition cannot be
quietly reinterpreted as it.

Tolls, surcharges, the congestion surcharge and the 2025 CBD congestion fee are their own columns and are in
neither the numerator nor the denominator.

## SQL (duckdb)

```sql
-- Parameters: $from (first pickup date, inclusive), $to (first pickup date after the window, exclusive).
-- Tables: trips_daily.
select date_trunc('month', pickup_date) as month,
       sum(trips) as yellow_trips,
       sum(tip_sum) as tip_usd,
       sum(fare_sum) as metered_fare_usd,
       sum(tip_sum) / nullif(sum(fare_sum), 0) as tip_rate
from trips_daily
where service = 'yellow'
  and pickup_date >= $from::DATE
  and pickup_date < $to::DATE
group by 1
order by 1
```
