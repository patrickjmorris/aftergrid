-- Weather in each month at Central Park (station USW00094728), including snow, which comparable_weather_day v1
-- does not test. tmax_c is degrees Celsius, prcp_mm and snow_mm are millimetres.
-- Parameters: $base_from, $base_to, $after_from, $after_to.
with wx as (
  -- retained extracts load every column as text, so each column is cast once, here
  select cast(observation_date as DATE) as observation_date, station_id, cast(tmax_c as DOUBLE) as tmax_c,
         cast(prcp_mm as DOUBLE) as prcp_mm, cast(snow_mm as DOUBLE) as snow_mm
  from weather_daily
)
select case when observation_date >= $base_from::DATE and observation_date < $base_to::DATE then 'baseline' else 'after' end as period,
       strftime(min(observation_date), '%B %Y') as period_label,
       cast(count(*) as BIGINT) as days_observed,
       cast(avg(tmax_c) as DECIMAL(18,1)) as mean_tmax_c,
       cast(count(*) filter (where tmax_c <= 0) as BIGINT) as freezing_days,
       cast(count(*) filter (where prcp_mm >= 1) as BIGINT) as wet_days,
       cast(count(*) filter (where snow_mm > 0) as BIGINT) as snow_days,
       cast(sum(prcp_mm) as DECIMAL(18,1)) as total_prcp_mm,
       cast(sum(snow_mm) as DECIMAL(18,1)) as total_snow_mm
from wx
where (observation_date >= $base_from::DATE and observation_date < $base_to::DATE)
   or (observation_date >= $after_from::DATE and observation_date < $after_to::DATE)
group by 1
order by min(observation_date)
