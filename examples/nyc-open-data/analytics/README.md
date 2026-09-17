# The demo Instance

The public Instance for the New York City open-data walkthrough: the connection profile, the Reader profiles,
the metric definitions and the Golden Questions. Layout: `docs/contracts/instance-layout.md`. Everything here
was written by `aftergrid setup` or by hand on top of what setup wrote, and everything here is public.

**Status: the Instance is scaffolded and filled in. No Finding has been produced.** Nothing below describes
something that has been approved, reviewed or published, because nothing has.

## What is here

| | |
| --- | --- |
| `aftergrid.yaml` | Written by `aftergrid setup --adapter duckdb --duckdb-path demo.duckdb`. Connection, publication policy, owner. |
| `readers.md` | Two Reader profiles: `city_transport_analyst` and `bike_product_manager`. |
| `definitions/` | Eight definitions, **all `proposed`**, none approved. |
| `golden/` | Five Golden Questions with reference values computed from a built database on 2026-09-17. |
| `findings/` | Empty. |
| `decisions/`, `decisions.md` | Empty, and the generated index of an empty Decision log. |
| `provisional/` | Empty, with the scaffold's README. |
| `demo.duckdb` | **Not committed.** Gitignored; rebuilt from public sources by the build script, then `crz_daily` derived into it by [`../scripts/derive-question-tables.mjs`](../scripts/derive-question-tables.mjs). |

## The data this Instance reads

`connection.duckdb.path` is `demo.duckdb`, **inside this Instance root**. That is not a style choice:
`openInstanceAdapter` resolves the path through `safePath`, which refuses a `..` component and an absolute path,
so a warehouse one directory up in `examples/nyc-open-data/` cannot be configured. The build script's `--out`
has to name this directory.

The database was built in two runs on **2026-09-17**, into four months rather than a fourteen-month contiguous
window — the goldens need January 2024 and December 2024 through February 2025, and building the twelve months
between would have streamed roughly 12 GB for nothing:

```bash
node examples/nyc-open-data/scripts/build-data.mjs --from 2024-12 --to 2025-02 \
  --out examples/nyc-open-data/analytics/demo.duckdb                     # 202.2 s
node examples/nyc-open-data/scripts/build-data.mjs --from 2024-01 --to 2024-01 --append \
  --out examples/nyc-open-data/analytics/demo.duckdb                     # 87.0 s
```

`--append` is new and is documented in [`../scripts/README.md`](../scripts/README.md). The result is 135.8 MB
holding `build_meta.months = 2024-01,2024-12,2025-01,2025-02`: 5,390,695 rows in `trips_daily`, 93,739 in
`trips_sample`, 98 days in `weather_daily`, 484 rows in `citibike_daily`, 9,024 in `citibike_stations`, 265
taxi zones and 38 zone rows.

### Then derive the bounded per-Question table

One more step, and it is not optional for the headline Question: `trips_daily` is over the admission cap (below),
so the table a Finding can actually capture is derived from it, **outside aftergrid**, by a second script of the
Operator's:

```bash
node examples/nyc-open-data/scripts/derive-question-tables.mjs \
  --out examples/nyc-open-data/analytics/demo.duckdb                      # 0.3 s
```

It writes **`crz_daily`** — one row per pickup date × service × `in_crz`, with `trips`, `fare_sum`, `tip_sum` and
`distance_sum` summed from `trips_daily` in the same `DECIMAL(18,4)` — where `in_crz` is the `crz_trip` rule:
pickup zone **or** dropoff zone in `crz_zones`. At this window that is **484 rows** (121 days × 2 services × 2
values of `in_crz`) with content hash `4378907104719937971008`. It also writes one `build_provenance` row
(`source` `derived:crz_daily`, `fetch_mode` `derived`, `bytes` and `sha256` NULL because nothing was fetched and
there is no file to hash, `url` naming what was read) and one `build_meta` key `derived:crz_daily` holding the
derivation time.

It is idempotent: a rerun drops and rebuilds the table and replaces those two rows, and the derived table's
content hash does not move. `--verify` prints every table's row count and content hash under the Instance's own
limits, and the seven non-volatile tables hash identically before and after a derivation — the derivation adds a
table, it does not touch the data. No `crz_share_daily` is written: `crz_daily` carries both sides of the share,
so `sum(trips) filter (where in_crz) / sum(trips)` over the window the Analysis states belongs in the analysis
SQL, not in a stored column.

The derived table is **not a window**. It holds every date `trips_daily` holds; the analytical window stays in
the analysis SQL, which is what keeps an edge day a decision of the SQL rather than of how wide the table
happened to be. A Finding that captures it retains the derived table, not the TLC files, and must say so.

### Provenance, and the dates the numbers rest on

Every number in `golden/` was computed on **2026-09-17** from files fetched the same day. The TLC restates
published months, so a rebuild can legitimately disagree; `build_provenance` records what was read.

| Source | Period | Bytes | Mode | `Last-Modified` |
| --- | --- | --- | --- | --- |
| `tlc_yellow` | 2024-01 | 49,961,641 | downloaded, sha256 `c4d59da7bbc8…` | Thu, 21 Mar 2024 15:35:44 GMT |
| `tlc_yellow` | 2024-12 | 61,524,085 | downloaded, sha256 `41ebf7db80be…` | Fri, 21 Feb 2025 21:29:11 GMT |
| `tlc_yellow` | 2025-01 | 59,158,238 | downloaded, sha256 `9af277e4c0d3…` | Wed, 23 Apr 2025 16:31:58 GMT |
| `tlc_yellow` | 2025-02 | 60,343,086 | downloaded, sha256 `037cba555a73…` | Wed, 23 Apr 2025 16:16:58 GMT |
| `tlc_hvfhs` | 2024-01, 2024-12, 2025-01, 2025-02 | 472.8 / 507.5 / 491.1 / 461.6 MB | streamed, **never hashed** | Mar 2024 – Apr 2025 |
| `tlc_zones` | static | 12,331 | downloaded, sha256 `1a99e1050922…` | Thu, 22 Feb 2024 21:33:00 GMT |
| `ghcn` | station history | 16,003,495 | downloaded, sha256 `7e75c1ba4031…` | Sun, 09 Feb 2025 07:54:31 GMT |
| `citibike` | 2024-01, 2024-12, 2025-01, 2025-02 | 369.0 / 450.8 / 414.2 / 396.0 MB | streamed, **never hashed** | Jul 2025 |

Two things that table says plainly. **Weather stops before the trips do**: the GHCN station export was last
modified 9 February 2025 and its last observation is 5 February 2025, so `weather_daily` holds 98 days — all of
January 2024, all of December 2024 and January 2025, and 1–5 February 2025. The headline comparison is inside
that coverage. And **a streamed file has no hash**, because the build never holds its bytes; its size, `ETag`
and `Last-Modified` are what identify it.

### `trips_daily` is over the admission cap at this window; `crz_daily` is what a Finding captures

`aftergrid capture <finding-dir> --catalog --instance examples/nyc-open-data/analytics` against this Instance on
2026-09-17, after the derivation above (the run reads the catalog and writes nothing at all):

```
build_meta                10 scan rows  admissible (estimate_under_cap)
build_provenance          16 scan rows  admissible (estimate_under_cap)
citibike_daily           484 scan rows  admissible (estimate_under_cap)
citibike_stations      9,024 scan rows  admissible (estimate_under_cap)
crz_daily                484 scan rows  admissible (estimate_under_cap)
crz_zones                 38 scan rows  admissible (estimate_under_cap)
taxi_zones               265 scan rows  admissible (estimate_under_cap)
trips_daily        5,390,695 scan rows  NOT admissible: exceeds the cap of 5,000,000
trips_sample          93,739 scan rows  admissible (estimate_under_cap)
weather_daily             98 scan rows  admissible (estimate_under_cap)
```

`build_meta` and `build_provenance` are one row larger than they were before the derivation, and `crz_daily` is
the new line. Everything except `trips_daily` is admissible; the headline Question's plan is therefore
`--tables crz_daily,crz_zones,weather_daily,build_provenance`.

One month of `trips_daily` is about 1.3 million rows and is comfortably admissible; **four months are not.** The
default `estimate_cap` is 5,000,000 and `capture` copies whole tables, so the whole-table read of `trips_daily`
is refused with `admission` before a byte is written. This is the designed behaviour
(`docs/contracts/setup.md`, `docs/contracts/adapters.md`, "Large sources: the windowed Instance pattern"), not a
defect, and the cap has deliberately **not** been raised here to make the number go away.

That decision has now been taken, and it is the one the contract names: a bounded per-Question table, built
outside aftergrid and captured whole. `derive-question-tables.mjs` writes `crz_daily` beside `trips_daily`
rather than a narrower database, so the demo keeps four months of source data, keeps the refusal visible, and
still has something a Finding can retain. It is a separate script from `build-data.mjs` on purpose: deriving a
Question's table takes no network and a fraction of a second, and must not mean refetching 4 GB.

## Reader profiles

Both are **composites, not people**, and neither has sat for a Reader session. `readers.md` says so in the file.

- **`city_transport_analyst`** — a non-data transport programme lead who decides what to report upward about
  how the charge is going. Wants trips into the zone, the same month a year earlier, and whether the two periods
  were alike enough to compare. Will misread a before/after difference as an effect, and a zone change as a
  citywide one.
- **`bike_product_manager`** — owns a bike share product area; reads dashboards but never writes a query. Wants
  the member/casual mix and e-bike use. Will misread a rising share on a falling total, and ride counts as
  people.

## Definitions: all eight are drafts

Every file in `definitions/` carries `lifecycle: proposed` and **no `approval:` block**. That is the contract's
word for "not approved" (`docs/contracts/instance-layout.md`; `draft` is not a value the layout defines). None
of them may headline a published decision metric until the owner approves it through the approval flow and the
approval is recorded against the definition's own content hash. Nobody has approved anything here.

| Definition | Kind | What it pins down |
| --- | --- | --- |
| `crz_trip` | metric | A trip **into** the zone is one whose pickup **or** dropoff zone is in `crz_zones`. Pickups-only is a different metric; a trip with both ends inside is counted once; it is not "trips that paid the fee". Computed from `crz_daily`, where that rule is the `in_crz` column. |
| `taxi_trip` | metric | Yellow medallion only. Green taxis are not in this build at all; `fare_sum` is the metered fare, not what the passenger paid. |
| `fhv_trip` | metric | **High-volume** for-hire only. The TLC's separate non-high-volume `fhv_tripdata` is not fetched, so the id is wider than the population, and the file says so. |
| `comparable_weather_day` | diagnostic | TMAX within ±5 °C and the same wet/dry class (under 1 mm / 1 mm or more), on aligned days. Units from `weather_daily`: °C and mm. A missing observation is `unknown`, never a match or a mismatch. Version 1 does **not** test snow. |
| `tip_rate` | metric | `tip_sum / fare_sum`, **yellow only**. HVFHS tips exist in the data but their denominator is `base_passenger_fare`, a different quantity, so no cross-service rate is available. Cash trips record a zero tip and cannot be separated at this grain — `payment_type` is kept only in the 1-in-1000 sample. |
| `member_ride` | metric | A ride taken under a membership. A ride, **not a rider**: the files carry no identity and no repeat-rider link. NYC archives only. |
| `ebike_ride` | metric | `rideable_type = 'electric_bike'`. States that no fee schedule, amount or date exists in any source this Instance reads. |
| `weekday_share` | diagnostic | Share of trips on Mon–Fri, to catch a comparison that is really a calendar difference. Public holidays are **not** excluded, and New Year's Day is in every January window here. |

Each was run against the built database READ_ONLY under the Engine's own `DEFAULT_LIMITS`
(`scripts/lib/sql-runner.mjs`: 256 MB, 2 threads), 2026-09-17:

```
comparable_weather_day    31 rows   16ms      member_ride      62 rows    2ms
crz_trip                  62 rows   31ms      taxi_trip        31 rows    6ms
ebike_ride                62 rows    2ms      tip_rate          3 rows   21ms
fhv_trip                  31 rows   19ms      weekday_share     2 rows   21ms
```

`crz_trip` was re-run the same day after its SQL moved to `crz_daily`, under the same limits and over the same
January window: **62 rows, 3 ms** — the same 62 rows (31 days × 2 services) and the same trip total, off a
484-row table instead of a 5.4-million-row one. (The total itself is in `golden/README.md`, not here.)

## Golden Questions

Five reference cases live in `golden/`, with the numbers they expect and the SQL that produced them in
`golden/README.md`. **They are the answer key.** An analysis run against this Instance must not read `golden/`
(the demo's own `/analyze` runs hold that directory out of the Instance for the duration), and this file carries none
of those numbers so that reading it does not leak them.

## What is **not** here

- **No Finding.** `findings/` is empty. The `examples-check` CI job reports that there is nothing to check, which
  is the truth.
- **No approved definition.** All eight are `proposed` and carry no approval block. Approval is an attestation
  the owner gives later, verified against GitHub; nothing here synthesises one.
- **No Decision record**, and no review of any kind.
- **No committed data.** `demo.duckdb` and `data/raw/` are gitignored. Rebuild them.
- **The guardrail hook is not installed.** Setup was run with `--skip-hook`, because the hook writes into a
  Claude Code `settings.json` on one machine — it is per-machine local configuration, not a shared artifact, so
  committing it would be committing somebody else's setup. Install it yourself with `aftergrid hook install`
  before running unattended intake here.
- **The publication policy is unverified.** Setup's preflight found the policy self-consistent —
  `github-actions[bot]` opens the pull requests, `patrickjmorris` is the only trusted approver, and the two are
  not the same account, which GitHub requires — but with no `GITHUB_TOKEN` it could not confirm against the API
  that the repository exists or that those logins resolve to distinct accounts. That is `unknown`, and setup
  reports the whole run as `incomplete` because of it. **No approval has been recorded here and none will ever
  be synthesised**: a `publication_approval` attestation in this Instance can only come from a real APPROVED
  review by `patrickjmorris` on a real pull request at a real commit.
- **`trips_daily` cannot be captured** at this window, and is not meant to be: `crz_daily` is the table a
  Finding on the headline Question captures, and it exists only after the derive step. See above.
