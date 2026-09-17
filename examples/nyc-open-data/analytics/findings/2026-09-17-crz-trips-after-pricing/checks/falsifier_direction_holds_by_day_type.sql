-- Falsifier for the Question, written before any analysis query was run.
-- The Answer states the direction in which trips into the zone moved between the baseline month and the after
-- month. It is wrong if that direction is a calendar artefact: if average trips into the zone per weekday, or per
-- weekend day, did not move the same way as the monthly total.
-- pass = NULL (not evaluable) when either month is missing a day, or the monthly totals are exactly equal.
-- Parameters: $base_from, $base_to, $after_from, $after_to (half-open pickup-date ranges, local New York dates).
with crz as (
  -- retained extracts load every column as text, so each column is cast once, here
  select cast(pickup_date as DATE) as pickup_date, service, cast(in_crz as BOOLEAN) as in_crz, cast(trips as BIGINT) as trips
  from crz_daily
),
daily as (
  select case when pickup_date >= $base_from::DATE and pickup_date < $base_to::DATE then 'base' else 'after' end as period,
         case when isodow(pickup_date) <= 5 then 'weekday' else 'weekend' end as day_type,
         pickup_date,
         sum(trips) filter (where in_crz) as crz_trips
  from crz
  where service in ('yellow', 'hvfhs')
    and ((pickup_date >= $base_from::DATE and pickup_date < $base_to::DATE)
      or (pickup_date >= $after_from::DATE and pickup_date < $after_to::DATE))
  group by 1, 2, 3
),
agg as (
  select
    count(*) filter (where period = 'base') as base_days,
    count(*) filter (where period = 'after') as after_days,
    sum(crz_trips) filter (where period = 'base') as base_total,
    sum(crz_trips) filter (where period = 'after') as after_total,
    avg(crz_trips) filter (where period = 'base' and day_type = 'weekday') as base_weekday_avg,
    avg(crz_trips) filter (where period = 'after' and day_type = 'weekday') as after_weekday_avg,
    avg(crz_trips) filter (where period = 'base' and day_type = 'weekend') as base_weekend_avg,
    avg(crz_trips) filter (where period = 'after' and day_type = 'weekend') as after_weekend_avg
  from daily
)
select
  case
    when base_days <> date_diff('day', $base_from::DATE, $base_to::DATE)
      or after_days <> date_diff('day', $after_from::DATE, $after_to::DATE) then null
    when after_total = base_total then null
    else sign(after_total - base_total) = sign(after_weekday_avg - base_weekday_avg)
     and sign(after_total - base_total) = sign(after_weekend_avg - base_weekend_avg)
  end as pass,
  'monthly total direction ' || cast(sign(after_total - base_total) as integer)
    || '; per-weekday average direction ' || cast(sign(after_weekday_avg - base_weekday_avg) as integer)
    || '; per-weekend-day average direction ' || cast(sign(after_weekend_avg - base_weekend_avg) as integer)
    || '; days ' || base_days || ' and ' || after_days as detail
from agg
