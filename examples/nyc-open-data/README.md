# Try aftergrid on New York City open data

A public demo Instance built on three open datasets, so you can see what a Finding looks like — and produce one
yourself — before pointing aftergrid at data you cannot share. Everything here is public: the data, the
definitions, the golden Questions, and eventually the Findings and the pull request that approved one.

**Status: scaffold, plus the data build.** This directory holds the layout, the data terms, the plan, and now
`scripts/build-data.mjs`, which runs. The Instance and the Findings arrive in later beads, and every step below
says which. Nothing in this file describes something you can run unless it says you can.

## The headline Question

New York began charging vehicles to enter the Congestion Relief Zone — Manhattan below 60th Street — on
**5 January 2025**. The Question the demo takes through the whole chain:

> Did trips into the Congestion Relief Zone change after congestion pricing started, compared with the same
> period a year earlier?

Weather is a **Check**, not a caveat in the discussion: January 2024 and January 2025 were not the same weather,
and a Check that compares the two periods' conditions either passes or makes the comparison say so. The exact
taxi zone ids that make up the zone, and the definitions that use them, belong to the definitions bead below.

## The data

| Dataset | What it gives | Terms |
| --- | --- | --- |
| [NYC TLC trip records](https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page) | Per-trip yellow taxi and high-volume for-hire records: pickup/dropoff zone and time, fare, tips | [NYC Terms of Use](https://www.nyc.gov/home/terms-of-use.page) |
| [NOAA GHCN-Daily](https://www.ncei.noaa.gov/products/land-based-station/global-historical-climatology-network-daily) | Daily temperature and precipitation at station `USW00094728` (New York City, Central Park) | Public domain / CC0 |
| [Citi Bike system data](https://citibikenyc.com/system-data) | Monthly ride files: start/end station, member or casual, classic or electric | [Citi Bike Data Sharing Policy](https://citibikenyc.com/data-sharing-policy) |

Full attribution, the no-endorsement statements and the licence of the files in this directory:
[`NOTICE.md`](NOTICE.md).

Verified on 2026-09-16: this repository's DuckDB binding reads
`https://d37ci6vzurychx.cloudfront.net/trip-data/yellow_tripdata_2025-01.parquet` over HTTPS (3.48M rows). The
build script that turns those files into a bounded database now exists, and step 1 below runs it; what it has
been measured doing, and what is only extrapolated, is in [`scripts/README.md`](scripts/README.md).

## The walkthrough

In the order a new user will follow it. Steps marked *not yet available* are scaffolded here and delivered by a
later bead; do not expect them to run today.

1. **Build the data.** `node examples/nyc-open-data/scripts/build-data.mjs` fetches the three sources and writes
   a bounded `demo.duckdb` with a provenance table. — **this works today.** Start with one month
   (`--from 2025-01 --to 2025-01`, about 90 seconds and 45 MB) before building the whole window; options,
   tables, units, the sampling rule and the measured numbers are in [`scripts/README.md`](scripts/README.md).
2. **Set up the Instance.** `aftergrid setup` against `examples/nyc-open-data/analytics`, with the DuckDB
   adapter pointed at the file step 1 built, then the definitions, Reader profiles and golden Questions.
   — *not yet available* (see [`analytics/README.md`](analytics/README.md) for why the directory is empty).
3. **Load the skills.** From a checkout of this repository:

   ```bash
   claude --plugin-dir /path/to/aftergrid
   ```

   This works today — it loads the Engine's skills (`skills/README.md`). There is nothing demo-specific to ask
   it until steps 1 and 2 land.
4. **Ask the congestion Question.** `/grill-question` on the ask above, then `/analyze`. — *not yet available*:
   it needs the data and the Instance.
5. **Read the Finding.** Open the rendered HTML, follow a number to the query that produced it, see the weather
   Check and the publication readiness. — *not yet available*: no Finding is committed here yet.
6. **Point setup at your own data.** `aftergrid setup --instance analytics …` in your own repository. This works
   today and is independent of everything above; the contract is `docs/contracts/setup.md`, and `--adapter` is
   optional (`docs/contracts/record.md`).

## Planned golden Questions

Three reference cases, chosen so the demo shows an honest range of outcomes rather than three wins. None of them
is committed yet.

| Question | Expected outcome | Why |
| --- | --- | --- |
| Trips into the Congestion Relief Zone, January 2025 against January 2024 | answered | A defined population, a stated window, a baseline period, and a falsifier a Check can evaluate |
| Did the tip rate change after congestion pricing? | likely inconclusive | Tips move with fare, payment type and metered-fare rules at the same time; the data can describe the change and is unlikely to separate it |
| Did congestion pricing cause fewer taxi rides citywide? | needs_reframing | "Citywide" is the wrong denominator for a zone-boundary policy, and "cause" is not available from an observational before/after |

The expected outcome is the point. A demo where every Question is answerable would misrepresent what this tool
is for.

## Limitations

- **TLC restates months.** The published trip files are revised after the fact, so a rebuild can produce
  different numbers from the same script. The build records the source URL, byte count, `ETag` and fetch time of
  every file, plus a SHA-256 for the files it downloads whole — the two largest sources are streamed and never
  held, so they have a size and an `ETag` and no hash (`scripts/README.md`). Any Finding here states the fetch
  date its numbers rest on.
- **No user-level data.** These are trip records, not rider records. There is no identity, no repeat-rider link
  and no panel, so nothing here can say whether the *same* people changed behaviour — only whether the trips
  changed.
- **Weather is a Check, not a control.** The Analysis does not adjust for weather. It asserts, as a runnable
  Check, whether the two compared periods are comparable on weather, and reports the outcome. A passing Check
  does not make the comparison causal.
- **Public data, and only public data.** Everything used here is downloadable by anyone. Nothing about NYC
  operations, enforcement or revenue that is not in these three files enters the demo.
