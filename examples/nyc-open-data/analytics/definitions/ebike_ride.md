---
id: ebike_ride
version: 1
kind: metric
lifecycle: proposed
grain: ride date × member type, for rides on an electric bike
population: Citi Bike rides in the New York City monthly archives whose rideable_type is 'electric_bike'
denominator: all Citi Bike rides in the same window and the same member type, electric and classic together
window: stated per Analysis as a half-open range of ride dates; ride_date is the local start date the Citi Bike file carries
owner: Patrick Morris
---
An **e-bike ride** is one Citi Bike ride taken on an electric bike: `rideable_type = 'electric_bike'` in
`citibike_daily`. The only other value present in the four months this Instance holds is `classic_bike`.

The publisher's own labels are carried through unchanged. Citi Bike has used a third value, `docked_bike`, in
earlier files; none of the months here contain one, so any share computed over these months is a two-way split.
An Analysis over a wider window must check for a third value rather than assume two.

**"E-bike share" needs its denominator said out loud.** The share of member rides that were on an e-bike, the
share of *all* rides that were on an e-bike, and the share of *e-bike* rides taken by members are three
different numbers, and a Reader will read whichever one is on the chart as the first. Always state the member
type the share is within, and always show the total alongside the share: a rising share with a falling total is
not rising e-bike use.

**Nothing in this Instance says anything about price.** Citi Bike has changed e-bike fees more than once, and a
fee change would be an obvious explanation for a change in e-bike use. No fee schedule, fee amount or fee change
date is in any of the three sources this Instance reads, and none is in `NOTICE.md` or the example README. So a
Finding here may state that fees are a plausible explanation it cannot test, and it may not state when a fee
changed, by how much, or that a change caused anything. If the Operator wants that, it has to come from a
sourced, dated document added to this Instance.

## SQL (duckdb)

```sql
-- Parameters: $from (first ride date, inclusive), $to (first ride date after the window, exclusive).
-- Tables: citibike_daily.
select ride_date,
       member_casual,
       sum(rides) as ebike_rides,
       sum(duration_seconds_sum) as duration_seconds
from citibike_daily
where rideable_type = 'electric_bike'
  and ride_date >= $from::DATE
  and ride_date < $to::DATE
group by 1, 2
order by 1, 2
```
