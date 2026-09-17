# Data build (spec — not implemented yet)

This directory will hold `build-data.mjs`, the one command that turns three public sources into the bounded
`demo.duckdb` the Instance reads. It does not exist yet; this file is its specification, so the data bead has
something to build against.

```bash
node examples/nyc-open-data/scripts/build-data.mjs            # full build
node examples/nyc-open-data/scripts/build-data.mjs --from 2024-01 --to 2025-06
```

Output: `examples/nyc-open-data/demo.duckdb`, gitignored. Raw downloads land in `data/raw/`, also gitignored.
Nothing the script writes is ever committed.

## What it builds

The sources are far larger than an Instance should hold — a single TLC month is millions of rows — so the script
writes **bounded, aggregated tables**, not copies. Windowing happens here, outside aftergrid, and the Instance
reads the result.

| Table | Grain | From |
| --- | --- | --- |
| `trips_daily` | pickup date × pickup zone × dropoff zone × service type | TLC yellow + high-volume for-hire, 2024-01 onward: trip count, fare sum, tip sum, distance sum |
| `trips_sample` | one row per sampled trip, per month | TLC, a stated deterministic sampling rule (a fixed hash of the trip's own fields, not a random draw), for distribution questions the daily table cannot answer |
| `weather_daily` | date | GHCN-Daily station `USW00094728`, 2024 onward: TMAX, TMIN, PRCP, SNOW |
| `citibike_daily` | date × member type × rideable type | Citi Bike monthly files, 2024 onward: ride count, duration sum |
| `citibike_stations` | station × month | Citi Bike monthly files: station id, name, latitude, longitude, first and last seen |
| `build_provenance` | one row per fetched source file | see below |

## Provenance table

Every fetched file gets a row, and the table is queryable from any Finding, so a number can be traced past the
Instance to the byte range it came from.

| Column | Meaning |
| --- | --- |
| `source` | `tlc_yellow`, `tlc_hvfhs`, `ghcn`, `citibike` |
| `url` | The exact URL fetched |
| `period` | The month or year the file covers |
| `bytes` | Size as downloaded |
| `sha256` | Hash of the downloaded bytes |
| `fetched_at` | UTC timestamp of the fetch |
| `builder_version` | Version string of `build-data.mjs` that wrote the row |

## Size budget

Under **1 GB** for `demo.duckdb`, so a new user can build it on a laptop and a prebuilt copy could plausibly be
a release asset later. `trips_sample` is the row that grows; its sampling rate is a constant in the script,
stated in this README when it lands, and chosen to hold the budget as months accumulate.

## Determinism, and where it stops

Two runs against the same fetched bytes must produce identical table hashes — that is the acceptance criterion.
Determinism stops at the network: **the TLC restates published months**, so a rebuild weeks later can legitimately
fetch different bytes for the same month and produce different numbers. The script does not hide that. It records
the hash and fetch time of every file, and a rebuild whose hashes differ from a previous one is reported as a
changed source rather than a failed build. Any Finding built on this data states the fetch date behind its
numbers.

Sources, terms and attribution: [`../NOTICE.md`](../NOTICE.md).
