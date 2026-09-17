# Data build

`build-data.mjs` is the one command that turns three public sources into the bounded `demo.duckdb` the Instance
reads. It exists and runs; everything below describes what it actually does.

```bash
# every month the TLC CDN serves, from 2024-01 onward
node examples/nyc-open-data/scripts/build-data.mjs

# one month, which is what the walkthrough and the tests use
node examples/nyc-open-data/scripts/build-data.mjs --from 2025-01 --to 2025-01

# one source, into a named file
node examples/nyc-open-data/scripts/build-data.mjs --from 2024-01 --to 2024-03 --sources yellow,ghcn --out /tmp/small.duckdb

# two far-apart months in one database, without the twelve months between them
node examples/nyc-open-data/scripts/build-data.mjs --from 2024-12 --to 2025-02 --out demo.duckdb
node examples/nyc-open-data/scripts/build-data.mjs --from 2024-01 --to 2024-01 --append --out demo.duckdb

# row count and content hash per table, no network
node examples/nyc-open-data/scripts/build-data.mjs --verify
```

| Option | Meaning |
| --- | --- |
| `--from YYYY-MM` | First month. Default `2024-01`. |
| `--to YYYY-MM` | Last month. Default: **probed**. The build sends HEAD requests for `yellow_tripdata_YYYY-MM.parquet` walking forward from `--from` and stops at the first month the CDN does not serve. On 2026-09-17 that gave `2024-01..2026-05`, 29 months. |
| `--sources a,b,c` | Any of `yellow`, `hvfhs`, `ghcn`, `citibike`. Default: all four. An unknown name is refused, not ignored. |
| `--out PATH` | Output database. Default `examples/nyc-open-data/demo.duckdb`. |
| `--raw-dir PATH` | Where downloads and streamed CSVs land. Default `examples/nyc-open-data/data/raw`. |
| `--sample-rate N` | One trip in `N` enters `trips_sample`. Default **1000**, the constant `SAMPLE_RATE` in the script. |
| `--append` | Add to an existing `--out` only the months of this window it does not already hold. See below. |
| `--keep-raw` | Keep the streamed Citi Bike CSVs instead of deleting each once it is aggregated. |
| `--verify` | Do not build. Print each table's row count and content hash from `--out`, and exit. |

Output is gitignored, as is `data/raw/`. Nothing the script writes is ever committed.

## `--append`: months, not windows

A window is a contiguous range, so a database holding January 2024 *and* January 2025 costs the twelve months
between them — about 12 GB streamed for the two that are wanted. `--append` is the way out, and it is the only
way this script adds to a database rather than replacing it.

```bash
node examples/nyc-open-data/scripts/build-data.mjs --from 2024-12 --to 2025-02 --out demo.duckdb   # 3 months
node examples/nyc-open-data/scripts/build-data.mjs --from 2024-01 --to 2024-01 --append --out demo.duckdb
```

What it does, in order: read `build_meta` from `--out`; refuse if the run would make that file untrue; copy the
database to `<out>.building`; build only the months `build_meta.months` does not list, logging the ones it
skipped; rewrite `build_meta`; rename over `--out`. The same temporary-file discipline as a fresh build, so a
throttled or failed append leaves the previous database exactly as it was — which is not hypothetical: the
append that produced the four-month demo database was refused by CloudFront on its first attempt and the
existing three months were untouched.

**Three refusals, none of them overridable.** An append is refused when `--out` was built with a different
source list, a different `--sample-rate`, or a different `builder_version`. Each would leave one file holding
two rules while `build_meta` described only the last run. The answer is a rebuild, not a flag.

**What is not re-fetched.** `taxi_zones` and `crz_zones` do not vary by month, so an append keeps them and keeps
the `build_provenance` row of the fetch that wrote them. Weather is re-read from the station history for the
appended months only, with an anti-join on the days already present, so an overlapping append adds nothing
twice. The GHCN row therefore appears in `build_provenance` once per run — with the *same* `fetched_at`, because
the sidecar records when those bytes were fetched and not when the build ran.

`--append` cannot be combined with `--verify`, which does not build; the pair is refused rather than silently
dropping the flag. The offline half — the month plan, the month merge, the three refusals — is tested in
`src/examples-build.test.ts`.

### `build_meta.months` is the authority

`build_meta` gains a `months` key: every month the database holds, sorted and comma-separated. **`from` and `to`
are its outer bounds and, after an append of two far-apart windows, are not a range that every month between
them is present for.** A four-month demo database reads `from: 2024-01`, `to: 2025-02`, and
`months: 2024-01,2024-12,2025-01,2025-02`. Read `months`.

`weather_coverage` has the same shape and the same caveat: it names the first and last observation in
`weather_daily`, not a guarantee that every day between them is there. On the four-month build it reads
`2024-01-01..2025-02-05` over 98 rows, which is January 2024 plus December 2024 through 5 February 2025 and
nothing in between.

A database written before `months` existed has no such key, and the script falls back to `from`..`to` for it —
correct, because every window was contiguous before `--append` existed.

## What it builds

The sources are far larger than an Instance should hold — one HVFHS month is 20 million rows — so the script
writes **bounded, aggregated tables**, not copies. Windowing happens here, outside aftergrid, and the Instance
reads the result. No month is ever held in memory: each is scanned once, column-projected, and reduced by
DuckDB, which spills to `--raw-dir/duckdb-spill` if it needs to.

| Table | Grain | Columns |
| --- | --- | --- |
| `trips_daily` | pickup date × service × pickup zone × dropoff zone | `trips`, `fare_sum`, `tip_sum`, `distance_sum`, `congestion_surcharge_sum`, `cbd_congestion_fee_sum` |
| `trips_sample` | one sampled trip | `service`, `pickup_datetime`, `dropoff_datetime`, `pu_location_id`, `do_location_id`, `trip_distance`, `fare_amount`, `tip_amount`, `tolls_amount`, `congestion_surcharge`, `cbd_congestion_fee`, `passenger_count`, `payment_type` |
| `weather_daily` | date | `station_id`, `tmax_c`, `tmin_c`, `prcp_mm`, `snow_mm` |
| `citibike_daily` | date × member type × rideable type | `rides`, `duration_seconds_sum` |
| `citibike_stations` | station × month | `station_name`, `latitude`, `longitude`, `starts`, `ends`, `first_seen`, `last_seen` |
| `taxi_zones` | taxi zone | `location_id`, `borough`, `zone`, `service_zone` — the TLC lookup, unchanged |
| `crz_zones` | taxi zone | the Congestion Relief Zone; see below |
| `build_provenance` | one row per fetched source file | see below |
| `build_meta` | one row per build parameter | `builder_version`, `from`, `to`, `months`, `sources`, `sample_rate`, `weather_coverage`, `built_at`, `duckdb_version`. **`months` is the authority on what the database holds**; `from`/`to` are its outer bounds — see `--append` below |

### Units, and what the columns are not

- **Money** — `fare_sum`, `tip_sum`, `congestion_surcharge_sum`, `cbd_congestion_fee_sum` are US dollars, and
  `distance_sum` is miles. Every summed column is `DECIMAL(18,4)`, never a `DOUBLE`. That is not cosmetic:
  floating-point addition is not associative, so a parallel `sum(DOUBLE)` lands on a different last bit
  depending on how the scan was partitioned, and two builds of the same bytes then disagree. Decimal addition is
  exact and order-independent. (This was found by running the build twice: the first version's `trips_daily`
  hash moved and nothing else did.)
- **`fare_sum` is per service and is not comparable across them.** Yellow's is the metered `fare_amount`;
  HVFHS's is `base_passenger_fare`. They are different quantities. The build sums each service's own field and
  keeps `service` in the grain so nothing adds them by accident; a definition that wants one number across both
  has to say what it means by "fare" first.
- **Weather** — `tmax_c` / `tmin_c` are degrees Celsius (GHCN publishes tenths, divided by 10 here),
  `prcp_mm` is millimetres (also tenths in the source), `snow_mm` is millimetres (already mm in the source).
  A value GHCN marks with a quality flag (`Q_FLAG`) is dropped rather than carried. **The station file stops
  before the trip data does** — see below.
- **Citi Bike** — `duration_seconds_sum` is whole seconds from `started_at` to `ended_at`. Rides whose
  timestamps do not parse, or end before they start, are dropped and counted in the build log. The build reads
  the NYC monthly archives only; the separate Jersey City (`JC-`) files are not included.
- **Zone ids can be null.** The TLC publishes trips with no pickup or dropoff zone, and ids 264/265 mean
  "unknown". Those rows are kept as they are, not dropped and not recoded.
- **Rows outside the file's own month are dropped.** TLC and Citi Bike files each carry a few stray rows from
  neighbouring months; the build filters on the pickup/start timestamp so a month means a month.

## Sources, and what "fetched" means for each

Two rules, one per source, because the files are not the same size:

| Source | Rule | Why |
| --- | --- | --- |
| TLC yellow (`yellow_tripdata_YYYY-MM.parquet`) | **Downloaded** to `data/raw/`, and sha256'd | ~48-64 MB a month. Small enough to hold, so the build hashes the exact bytes it read. |
| TLC taxi zone lookup (`taxi_zone_lookup.csv`) | **Downloaded**, sha256'd | 12 KB. |
| GHCN-Daily (`by_station/USW00094728.csv`) | **Downloaded**, sha256'd | 16 MB, and one file covers the station's whole history — by far the smaller fetch. It is also the stale one; see the note below. |
| TLC high-volume FHV (`fhvhv_tripdata_YYYY-MM.parquet`) | **Streamed**: DuckDB reads it over HTTPS with `httpfs`, pulling only the columns the aggregate needs | ~500 MB and ~20M rows a month. Downloading 30 of those would be 15 GB of disk for data that is thrown away after one scan. |
| Citi Bike (`YYYYMM-citibike-tripdata.zip`) | **Streamed**: the zip's central directory is read from its tail with an HTTP range request, then each member CSV is fetched as its own byte range, aggregated and deleted | 370-1000 MB a month. The 2024+ archives hold two to four CSVs each, stored uncompressed, so a range read gets a member without the archive. |

A streamed file is **never hashed**, because the build never holds its bytes. `build_provenance.sha256` is NULL
for those rows and `fetch_mode` says `streamed`; the URL, HTTP `Content-Length`, `ETag`, `Last-Modified` and
fetch time are what identifies them. `provenanceRow()` refuses a streamed row that carries a sha256 and a
downloaded row that does not, so the distinction cannot rot into a comfortable lie.

Downloaded files are kept in `--raw-dir` with a small `<file>.fetch.json` sidecar recording what the server said
when the bytes landed. A rerun reads the sidecar instead of asking again — one less request against a CDN that
rate-limits, and the honest answer, because `fetched_at` then names when *those bytes* were fetched rather than
when the build ran. Delete the file or the whole `--raw-dir` to force a fresh fetch.

### The weather file stops before the trip data does

`by_station/USW00094728.csv` is a periodic export, not a live feed. On 2026-09-17 its `Last-Modified` was
2025-02-09 and its last observation was **2025-02-05**, while the TLC was serving trips through 2026-05. A full
build therefore gets about 400 weather days against 29 months of trips. The build does not leave that to be
discovered later: it logs the covered range, prints a warning when the range ends before the window, and records
`weather_coverage` in `build_meta`.

This is deliberate and it is the smaller fetch. The live alternative is the same data as parquet, partitioned by
year and element:

```
https://noaa-ghcn-pds.s3.amazonaws.com/parquet/by_year/YEAR=2025/ELEMENT=TMAX/*.snappy.parquet
```

Those are updated daily, and four elements cost roughly 85 MB a year streamed — about 250 MB for a three-year
window against 16 MB for the station file, which is why the station file is the default. The demo's headline
Question (January 2025 against January 2024) is inside the station file's coverage. A Finding that needs weather
past early 2025 has to switch sources, and this paragraph is the reason it is not a surprise.

## Provenance table

Every fetched source file gets a row, and the table is queryable from any Finding, so a number can be traced
past the Instance to the file it came from.

| Column | Meaning |
| --- | --- |
| `source` | `tlc_yellow`, `tlc_hvfhs`, `tlc_zones`, `ghcn`, `citibike` |
| `url` | The exact URL fetched |
| `period` | The month the file covers (`static` for the zone lookup, `station history` for GHCN) |
| `bytes` | Size as downloaded, or the HTTP `Content-Length` for a streamed file |
| `sha256` | Hash of the downloaded bytes — **NULL for a streamed file**, which the build never holds |
| `fetch_mode` | `downloaded` or `streamed` |
| `http_etag`, `http_last_modified` | What the server said about the object, and the only change detector a streamed file has |
| `fetched_at` | UTC timestamp of the fetch that produced these bytes |
| `builder_version` | Version string of `build-data.mjs` that wrote the row |

## The Congestion Relief Zone

`crz_zones` is the 38 taxi zones that make up Manhattan south of 60th Street. **It is not derived from the
lookup table**, which carries no geometry and no street bounds — it is a committed list (`CRZ_ZONE_IDS` in the
script) that was hand-checked against the TLC taxi zone map, and the build only validates it: every id must
exist in `taxi_zones` and be in Manhattan, or the build stops and says which one is not.

The list is cross-checked against evidence the data itself carries. The 2025 TLC files have a
`cbd_congestion_fee` column, charged on trips that touch the zone. Over `yellow_tripdata_2025-03.parquet`,
grouped by dropoff zone across zones with at least 500 trips (measured 2026-09-16):

- every zone in the list has **≥ 94.1%** of dropoffs carrying the fee;
- the highest share for any zone *not* in the list is Newark Airport at **88.8%**;
- the excluded Manhattan boundary zones sit at 51-61% — Central Park 58.2%, Lincoln Square East 57.5%,
  Lenox Hill East 51.0%, Upper East Side South 52.8% — which is what a zone just north of 60th St looks like.

That gap between 94.1% and 88.8% is the list's edge, and it is evidence, not the definition: the fee is charged
for *touching* the zone, so a zone outside it collects the fee on trips that crossed. The definition is the map.
Deliberately excluded, and named in the script so a future reader does not have to re-derive them: Central Park
(43), Lincoln Square East/West (142/143), Lenox Hill East/West (140/141), Upper East Side South (237) and Upper
West Side South (239) start at or above 60th St; Roosevelt Island (202), Randalls Island (194) and
Governor's/Ellis/Liberty Island (103/104/105) are outside the road cordon.

## Sampling

`trips_sample` holds one trip in **1,000** (`SAMPLE_RATE`; `--sample-rate` overrides it, and the value used is
recorded in `build_meta`). The rule is a hash of the trip's own fields, not a random draw and not a row number:

```
md5_number_lower(pickup_datetime | dropoff_datetime | PULocationID | DOLocationID | fare) % 1000 = 0
```

Fields are rendered to text, joined with `|`, and a NULL is rendered `\N` so it never collides with an empty
string. MD5 is used rather than DuckDB's own `hash()` so the sample does not move when the engine version does.
Two consequences the rule is chosen for: the same trip is in or out regardless of what order the file is read
in or how the scan is partitioned, and a coarser rate is a strict subset of a finer one.

1 in 1,000 is roughly **22,000-24,000 sampled trips a month** across both services, measured (see below). It is
the row that grows with the window, and at this rate it is a rounding error against `trips_daily`.

## Determinism, size and time

Two runs against the same fetched bytes produce identical table hashes — that is the acceptance criterion, and
`--verify` is how you check it:

```
$ node examples/nyc-open-data/scripts/build-data.mjs --verify --out examples/nyc-open-data/demo-2024-01.duckdb
(read under the Instance's own limits: 256MB, 2 threads)
  trips_daily               1310050 rows                 12070728758449131695883908    592ms
  trips_sample                22488 rows                   206518096206617798993235     26ms
  ...
```

The hash is order-independent: a sum, over rows, of the MD5 of the row rendered as text. Row *order* inside a
table is not promised and does not need to be. Two things that legitimately differ between two builds and are
therefore never compared: `build_provenance` and `build_meta`, which record the fetch rather than the data (they
are printed and marked `volatile`), and the **size of the `.duckdb` file itself** — DuckDB's block allocation
leaves a variable number of free blocks, so the same seven data tables came out as 32.2 MiB and 42.5 MiB in two
builds with byte-identical contents. Compare hashes, not file sizes.

`--verify` opens the database `READ_ONLY` under the Engine's own limits — 256 MB, 2 threads
(`scripts/lib/sql-runner.mjs` `DEFAULT_LIMITS`) — so "an Instance can query this" is checked rather than assumed.

### Measured

Two one-month windows, all four sources, each built twice, on 2026-09-17: macOS on Apple silicon, Node 26.0.0,
DuckDB 1.5.5, over a residential connection. Every non-volatile table hashed identically across the two builds
of each window.

| | 2024-01 | 2025-01 |
| --- | --- | --- |
| Build time, cold (nothing in `data/raw`) | 79.7 s | 87.5 s |
| Build time, rerun (downloads cached, streams repeated) | 71.9 s | 69.3 s |
| Yellow trips read → `trips_daily` rows | 2,964,606 → 210,955 | 3,475,204 → 262,640 |
| HVFHS trips read → `trips_daily` rows | 19,663,930 → 1,099,095 | 20,405,666 → 1,117,553 |
| Citi Bike rides read | 1,888,085 (2 CSVs) | 2,124,475 (3 CSVs) |
| `trips_daily` | 1,310,050 rows | 1,380,193 rows |
| `trips_sample` | 22,488 rows | 23,920 rows |
| `weather_daily` | 31 rows | 31 rows |
| `citibike_daily` | 124 rows | 124 rows |
| `citibike_stations` | 2,262 rows | 2,277 rows |
| `taxi_zones` / `crz_zones` | 265 / 38 | 265 / 38 |
| Database file | 33.8 MB / 40.4 MB (26.5 MiB in used blocks) | 44.6 MB / 46.4 MB (31.7 MiB in used blocks) |
| Slowest `--verify` table scan | 1.6 s (`trips_daily`) | 0.7 s (`trips_daily`) |

Roughly: a month costs 80-90 s, of which about 47 s is Citi Bike (370-414 MB streamed out of the zip), 12 s is
the HVFHS remote scan, and the rest is the yellow download and the local work.

### Extrapolated

**These are extrapolations from the two months above, not measurements.** The full 2024-01-onward build has not
been run.

- **Size.** About 29 MiB of used blocks a month, essentially all of it `trips_daily`. A 30-month window
  (2024-01 through mid-2026) extrapolates to roughly **0.85 GiB of data and a ~0.9-1.0 GB file**, which is at
  the edge of the 1 GB budget rather than comfortably inside it. It crosses 1 GB somewhere past month 34 at this
  grain. The levers, in order: a narrower `--from`, dropping `hvfhs` from `--sources` (it is 84% of
  `trips_daily`), or coarsening the daily grain. `--sample-rate` is not one of them — `trips_sample` is under
  2% of the rows.
- **Time.** 30 months × 80-90 s ≈ **40-45 minutes**, network-bound, plus about 1.5 GB of yellow parquet left in
  `data/raw`. A rerun with those cached is a few minutes faster; the streamed sources are re-read every time.

## Determinism, and where it stops

Determinism stops at the network: **the TLC restates published months**, so a rebuild weeks later can
legitimately fetch different bytes for the same month and produce different numbers. The script does not hide
that. It records the hash (or, for a streamed file, the size and `ETag`) and the fetch time of every file, and a
rebuild whose provenance differs from a previous one is a changed source, not a failed build. Any Finding built
on this data states the fetch date behind its numbers.

Two more edges worth knowing before you trust a rerun:

- **CloudFront answers 403 for a file that is not there, and 403 when it is throttling.** The TLC bucket grants
  no `ListBucket`, so an unpublished month is a 403, not a 404 — and several builds in a row also earn 403 for a
  few minutes. One response cannot tell those apart, and guessing either way is a real error: read as "absent" it
  silently shortens the window, read as "throttled" it stalls on a month that will never exist. So the build
  confirms a missing-looking answer against a control object on the same host that certainly exists. Control
  refused too, and the build stops and names throttling as the reason. Control served, and the object itself gets
  one more full-budget look before "absent" is concluded — a throttle can refuse a 500 MB object's HEAD while
  still serving a 12 KB one, which is exactly what happened once during development and dropped a whole month
  from a build. Only then is the month skipped, with a line saying so. Finished downloads in `--raw-dir` survive
  either way, so the next attempt resumes rather than starting over.
- **The services do not publish the same months.** The `--to` probe walks yellow, because yellow is the
  reference for the demo's Question. HVFHS can be a month ahead: on 2026-09-17 `fhvhv_tripdata_2026-06` was
  served and `yellow_tripdata_2026-06` was not. Within the window, a source missing a month is skipped with a
  line in the log, and the other sources still build.
- **A failed build changes nothing.** The database is written to `<out>.building` and renamed over `<out>` only
  once it is complete; a build that dies part-way deletes its own temporary file and leaves any previous
  `demo.duckdb` untouched.

The offline half of all of this — month parsing, the sampling rule, the CRZ validation, the provenance row shape
and `--verify` — is tested in `src/examples-build.test.ts`. Those tests make no network calls.

Sources, terms and attribution: [`../NOTICE.md`](../NOTICE.md).
