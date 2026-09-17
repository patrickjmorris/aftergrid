-- What the two Citi Bike months were built from, straight out of build_provenance. It is here because the
-- Reader is entitled to know that the ride archives were streamed rather than downloaded, so the build never
-- held their bytes and never hashed them: size, ETag and Last-Modified are what identify those files.
-- Parameters: $base_month, $after_month (the two Citi Bike archive periods, as yyyy-mm).
select period,
       source,
       url,
       cast(bytes as BIGINT) as bytes,
       fetch_mode,
       cast(nullif(sha256, '') as VARCHAR) as sha256,
       http_last_modified,
       cast(fetched_at as VARCHAR) as fetched_at
from build_provenance
where source = 'citibike'
  and period in ($base_month, $after_month)
order by period
