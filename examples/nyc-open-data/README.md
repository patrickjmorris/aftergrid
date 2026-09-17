# Try aftergrid on New York City open data

A public demo Instance built on three open datasets, so you can see what a Finding looks like — and produce one
yourself — before pointing aftergrid at data you cannot share. Everything here is public: the data, the
definitions, the golden Questions, and eventually the Findings and the pull request that approved one.

**Status: the data build and the Instance are done; no Finding exists.** This directory holds the layout, the
data terms, `scripts/build-data.mjs` and `scripts/derive-question-tables.mjs`, which both run, and
`analytics/`, which is a filled-in Instance — connection,
Reader profiles, definitions and golden Questions. Nothing in it is approved. The Findings arrive in a later
bead, and every step below says which. Nothing in this file describes something you can run unless it says you
can.

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

   Then **derive the per-Question table**: `node examples/nyc-open-data/scripts/derive-question-tables.mjs`
   writes `crz_daily` into that same database in a fraction of a second, with no network — one row per pickup
   date × service × in-zone flag, plus a `build_provenance` row recording the derivation. — **this works
   today.** It is a separate step because `trips_daily` at the demo's four-month window is 5,390,695 rows
   against an admission cap of 5,000,000, so `aftergrid capture` refuses it whole; the bounded table beside it
   is what a Finding captures (`docs/contracts/adapters.md`, "Large sources: the windowed Instance pattern").
   [`analytics/README.md`](analytics/README.md) has the row counts, the hashes and the catalog output.
2. **Set up the Instance.** — **this is done, and committed.**
   [`analytics/`](analytics/README.md) holds `aftergrid.yaml` (DuckDB adapter, `path: demo.duckdb`, **inside**
   the Instance root — `safePath` refuses a `..`, so the build's `--out` has to name that directory), two Reader
   profiles, eight `proposed` definitions and five golden Questions whose reference values were computed from a
   real build on 2026-09-17. Nothing there is approved and no Finding exists yet;
   [`analytics/README.md`](analytics/README.md) lists what is and is not there, and the numbers behind each
   golden.
3. **Load the skills.** From a checkout of this repository:

   ```bash
   claude --plugin-dir /path/to/aftergrid
   ```

   This works today — it loads the Engine's skills (`skills/README.md`). With steps 1 and 2 done there is now
   something demo-specific to ask it, but step 4 below is still the first thing nobody has run.
4. **Ask the congestion Question.** `/grill-question` on the ask above, then `/analyze`. — *not yet available*:
   it needs the data and the Instance.
5. **Read the Finding.** Open the rendered HTML, follow a number to the query that produced it, see the weather
   Check and the publication readiness. — *not yet available*: no Finding is committed here yet.
6. **Point setup at your own data.** `aftergrid setup --instance analytics …` in your own repository. This works
   today and is independent of everything above; the contract is `docs/contracts/setup.md`, and `--adapter` is
   optional (`docs/contracts/record.md`).

## The golden Questions

Five reference cases, chosen so the demo shows an honest range of outcomes rather than five wins. All five are
committed in [`analytics/golden/`](analytics/README.md), with reference values computed from a real build on
2026-09-17.

| Question | Expected outcome | Why |
| --- | --- | --- |
| Trips into the Congestion Relief Zone, January 2025 against January 2024 | answered (associational) | A defined population, a stated window, a baseline period, and a falsifier a Check can evaluate. Zone trips rose 2.7%, all trips rose 5.5%, so the zone's *share* fell |
| Did the tip rate change after congestion pricing? | inconclusive | The rate moved — and the move at the policy date is smaller than the very next month-on-month move, which no policy explains |
| Did congestion pricing cause fewer taxi rides citywide? | needs_reframing | "Citywide" is the wrong denominator for a zone-boundary policy, "cause" is not available from an observational before/after, and the premise is false: citywide rides rose |
| Are Citi Bike members riding e-bikes more than a year ago? | answered (descriptive) | Share and total both rose. The Question deliberately asserts no fee change: no source here carries one |
| Comparing only days when the weather was similar, did zone trips change? | inconclusive | The comparability Check fails on 21 of 31 aligned day pairs, and the 10 that survive are not a month |

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
