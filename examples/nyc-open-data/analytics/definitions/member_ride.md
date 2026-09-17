---
id: member_ride
version: 1
kind: metric
lifecycle: proposed
grain: ride date × bike type, for rides taken under a membership
population: Citi Bike rides in the New York City monthly archives whose member_casual field is 'member'
denominator: all Citi Bike rides in the same window, member and casual together
window: stated per Analysis as a half-open range of ride dates; ride_date is the local start date the Citi Bike file carries
owner: Patrick Morris
---
A **member ride** is one Citi Bike ride that was taken under a membership: `member_casual = 'member'` in
`citibike_daily`. The other value is `casual` — a single ride or a day pass.

**It is a ride, not a rider.** The Citi Bike files carry no rider identity and no repeat-rider link, so nothing
here counts people. One member taking two hundred rides in a month is two hundred member rides, and the data
cannot tell that from two hundred members taking one each. Every Finding that uses the word "members" has to say
this the first time it says it; the Citi Bike data sharing policy also forbids using the data to identify
riders, and this Instance has no way to and no intention of doing so.

Three boundaries the build draws, which this definition inherits:

- **New York City only.** The build reads the NYC monthly archives; the separate Jersey City (`JC-`) files are
  not fetched, so a Jersey City ride is absent rather than zero.
- **Rides with unusable timestamps are dropped**, not counted: a start or end that does not parse, or an end
  before its start. The build logs how many (none in any of the four months here).
- **A ride belongs to the month its start time falls in.** Rides in a file but outside that file's own month are
  dropped, so a month means a month.

`duration_seconds_sum` is whole seconds from `started_at` to `ended_at`, summed over the group.

## SQL (duckdb)

```sql
-- Parameters: $from (first ride date, inclusive), $to (first ride date after the window, exclusive).
-- Tables: citibike_daily.
select ride_date,
       rideable_type,
       sum(rides) as member_rides,
       sum(duration_seconds_sum) as duration_seconds
from citibike_daily
where member_casual = 'member'
  and ride_date >= $from::DATE
  and ride_date < $to::DATE
group by 1, 2
order by 1, 2
```
