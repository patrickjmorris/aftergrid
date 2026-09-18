# Try aftergrid on New York City open data

A public demo Instance on three open datasets. Rebuild its data from the publishers in about five minutes, run
`/analyze` on it yourself, and read the two Findings that have already come out of it — before pointing
aftergrid at data you cannot share. Everything here is public: the data, the definitions, the golden Questions,
the Findings and the pull requests that carry them.

**Nothing here is approved.** Both Findings are merged on `main` through pull requests #2 and #3, all eight
definitions are `proposed`, no `publication_approval` attestation exists anywhere in this Instance, and neither
Finding is `ready`. That is the honest end of the demo, not a step somebody forgot.

## What you will see

Two Findings, each the output of a real headless `/analyze` run, committed as it came out.

**Trips into the Congestion Relief Zone, January 2025 against January 2024** — branch `demo/crz-trips-r2`, pull
request #2, revision 2, outcome **`inconclusive`**. Over the whole month the average weekday had 5.3% more
trips into the zone than a year earlier; among the five weekday pairs matched on day of week, non-holiday and
comparable weather, 5.4% *fewer*. The falsifier — pinned in `analysis.yaml` before any query of that revision
existed — said the whole-month direction was wrong if it did not hold among days that were alike. It recorded
`fail`, was not loosened, and the Finding says the Question is not settled.

**Member e-bike rides, January 2025 against January 2024** — branch `demo/citibike-ebike-r1`, pull request #3,
revision 1, outcome **`answered`** (descriptive). Members took 1,329,923 rides on e-bikes against 1,055,584 a
year earlier (+26.0%), and e-bikes were 69.2% of member rides against 62.8%. Its own falsifier — the count and
the share must move the same way — passed. The weather Check failed as designed, and that sits in the caveat
beside the Answer rather than in a footnote.

**The inconclusive one is the point.** New York began charging vehicles to enter the zone — Manhattan below
60th Street — on 5 January 2025, and the obvious before/after comparison is exactly what a pre-registered test
can catch. It did. A tool that answered either way would be no use here; what this shows is the machinery that
stops a month-on-month rise from being published as an effect.

The current congestion Finding on `main` is revision 2. The earlier revision-1 halt (`outcome: pending`,
`status: needs_attention`) is retained in its revision history and documented in the run log.

## The data

Three public sources, none of them committed here — the build script fetches them from the publishers:
per-trip [NYC TLC](https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page) yellow taxi and high-volume
for-hire records (pickup/dropoff zone and time, fare, tips), daily temperature and precipitation at Central
Park from [NOAA GHCN-Daily](https://www.ncei.noaa.gov/products/land-based-station/global-historical-climatology-network-daily)
(station `USW00094728`), and monthly [Citi Bike](https://citibikenyc.com/system-data) ride files (member or
casual, classic or electric). Terms, full attribution and the no-endorsement statements:
[`NOTICE.md`](NOTICE.md).

Weather is a **Check**, not a caveat in the discussion: January 2024 and January 2025 were not the same weather,
and a Check that compares the two periods either passes or makes the comparison say so.

## 1. Build the data

Node 22.18+ or 24+, and `pnpm install` at the repository root. Then, from the root, the two commands that
produced the database both Findings read:

```bash
node examples/nyc-open-data/scripts/build-data.mjs --from 2024-12 --to 2025-02 \
  --out examples/nyc-open-data/analytics/demo.duckdb
node examples/nyc-open-data/scripts/build-data.mjs --from 2024-01 --to 2024-01 --append \
  --out examples/nyc-open-data/analytics/demo.duckdb
```

Four months rather than a contiguous window, because the Questions need January 2024 and December 2024 through
February 2025, and the twelve months between would stream about 12 GB for nothing. `--append` is what allows
that; it refuses to append across a different source list, sample rate or builder version rather than leaving
one file holding two rules.

Measured on this machine on 2026-09-17 (macOS on Apple silicon, Node 26, residential connection): **202.2 s**
and **87.0 s**, so under five minutes together. About **3.8 GB is fetched**, of which roughly 3.5 GB is the
HVFHS and Citi Bike data streamed and never held on disk; about 250 MB of yellow parquet and the weather file
stay in `data/raw/`. The result is **135.8 MB** holding 5,390,695 rows in `trips_daily`, 98 days of weather and
38 zone rows. A single month costs 80–90 s. Options, tables, units and the sampling rule:
[`scripts/README.md`](scripts/README.md).

Then derive the bounded per-Question table — not optional for the headline Question — and check the result:

```bash
node examples/nyc-open-data/scripts/derive-question-tables.mjs \
  --out examples/nyc-open-data/analytics/demo.duckdb
node examples/nyc-open-data/scripts/build-data.mjs --verify \
  --out examples/nyc-open-data/analytics/demo.duckdb
```

The derivation takes **0.3 s and no network**. It writes `crz_daily` — one row per pickup date × service ×
`in_crz`, 484 rows at this window — plus a provenance row recording what it read. It exists because
`trips_daily` at four months is 5,390,695 rows against an admission cap of 5,000,000, so `aftergrid capture`
refuses it whole; `crz_daily` is what a Finding captures instead. `--verify` then prints every table's row count
and content hash under the Engine's own limits — 256 MB, 2 threads, 10 s a statement — so "an Instance can query
this" is checked rather than assumed ([`analytics/README.md`](analytics/README.md) has the counts, hashes and
catalog output).

## 2. Load the skills from a copy outside the repository

```bash
rm -rf /tmp/aftergrid-plugin && cp -R . /tmp/aftergrid-plugin
claude --plugin-dir /tmp/aftergrid-plugin
```

The copy is not superstition. Claude Code treats every path inside a directory loaded with `--plugin-dir` as a
sensitive file, and this Instance lives inside the repository that carries the plugin — so loading the plugin in
place makes every write into the Finding directory fail as *"sensitive file"*, whatever allow rules are passed.
That cost run 1 an entire session before anyone understood it. A copy outside the tree, or
`--permission-mode bypassPermissions`, are the two ways round it; the copy is the less privileged one (probe
matrix: [`docs/run-log.md`](docs/run-log.md), [`../../docs/contracts/eval.md`](../../docs/contracts/eval.md)).
An Operator's own Instance never has the problem: it does not sit inside the Engine's checkout.

## 3. Ask the Question

The goldens in `analytics/golden/` are the answer key, so move that directory out of the Instance for the
duration of the run, as every run here did. Then, in the session from step 2, type the ask at the `/analyze`
prompt — or run it headless, which is how the Finding behind pull request #2 was made:

```bash
claude --plugin-dir /tmp/aftergrid-plugin --permission-mode acceptEdits \
  --allowedTools 'Bash(aftergrid:*)' 'Bash(node:*)' Read Write Edit Glob Grep \
  --max-budget-usd 40 \
  -p "/analyze Did trips into the Congestion Relief Zone change after congestion pricing started, compared with the same period a year earlier?"
```

(The run log abbreviates the `--allowedTools` list with an ellipsis; the tools above are the ones it names.)
`/analyze` is the only orchestrator: clarify → analysis → write → visual → narrative → review → `aftergrid
check` → `aftergrid review status`, with three halts it can stop on and resume from
([`../../docs/skills/analyze.md`](../../docs/skills/analyze.md)).

**Model and cost.** The Citi Bike runs passed `--model opus` at the owner's choice; the log records no `--model`
for the congestion runs. Every run here was on a claude.ai Max subscription (`apiKeySource: none`), so **the
dollar figures the CLI reports are estimates at API list price, not charges.** At those estimates the six runs
were 5 min 45 s / 37 turns and 7 min 53 s / 28 turns at about $5.70 each, 28 min / 171 turns and 30 min at about
$29 each, a 10 min resume at about $22, and a 3 min refusal at about $2. The log records turns and estimates,
not token counts; the long runs' volume was the plugin and contract context re-read every turn.

## 4. Read the Finding

```bash
git show demo/crz-trips-r2:examples/nyc-open-data/analytics/findings/2026-09-17-crz-trips-after-pricing/render/finding.html > /tmp/finding.html
open /tmp/finding.html
```

What to look at, in order:

- **The banner**, *"Draft. Publication approval has not been verified."*, then **the Answer** — one sentence,
  for a named Reader profile, here a non-data transport programme lead who is a composite and not a person.
- **The provenance popovers.** Every number in the prose opens the chain behind it: the calculation, the saved
  result file with its row, column and hash, the query with its SQL hash, the retained input it ran on, and the
  definition it uses with its lifecycle (`proposed`, on all of them). No number asks to be taken on trust.
- **The falsifier line**, in *How we checked*: the test quoted in full, "recorded fail; this Finding is
  inconclusive". A pre-registered falsifier that fires is an analytical fact, not an error — `aftergrid check`
  reports a `falsifier_failed` warning and renders the Finding anyway, because halting there would leave the
  honest Finding unwritten.
- **Review status.** Three agent reviews at the current content digest, no blocking findings, and *"Publication
  approval: None verified. This is a draft."* An agent review is not an approval and the page says so. The Citi
  Bike page also quotes three earlier reviews from before a sign fix, labelled as being for older content.

## 5. The approval round trip

Publication readiness is one fact only: **a human on the Instance's allowlist approved this exact content**
([`../../docs/contracts/publication.md`](../../docs/contracts/publication.md)). GitHub will not let the author
of a pull request approve it, so the owner cannot both push a Finding and approve it. The
[`examples-pr`](../../.github/workflows/examples-pr.yml) workflow is the way out: it runs with `GITHUB_TOKEN`,
so the draft pull request's author is `github-actions[bot]` — which is what `analytics/aftergrid.yaml` names as
`publication.automation_login`, against `patrickjmorris` as the only trusted approver.

```bash
gh workflow run examples-pr -f branch=demo/crz-trips-r2 \
  -f finding=examples/nyc-open-data/analytics/findings/2026-09-17-crz-trips-after-pricing
```

That needs one repository setting: **Settings → Actions → General → Workflow permissions → "Allow GitHub Actions
to create and approve pull requests."** Without it GitHub refuses a pull request created by `GITHUB_TOKEN`. Pull
requests #2 and #3 exist and are authored by `github-actions[bot]`, so it is on here.

From there the trusted human submits an **Approve** review at the head commit; the Finding records a
`publication_approval` attestation naming that repository, pull request, review id and commit sha; and
`aftergrid check` with a read-only `GITHUB_TOKEN` re-verifies the whole chain through the API before it will say
`ready`. Push anything afterwards and the approval no longer sits at the head, so readiness drops back.

**Nothing here is `ready`.** Both pull requests are open **drafts**, both carry **zero reviews**, both manifests
record `attestations: []`, and the workflow writes no review of its own — it opens a draft and stops. Approval
is a human's click and nothing in this repository stands in for it.

## 6. Then your own data

Independent of everything above, and the reason the demo exists:

```bash
aftergrid setup --instance analytics \
  --owner-name "Your Name" --owner-contact you@example.com \
  --repository owner/repo --automation-login your-bot --trusted-approver your-login
```

That is the whole command. **`--adapter` is optional**: with none, the Instance is written for the recorded
path, where your own harness runs the SQL and `aftergrid record` writes down what it ran. An adapter is the
upgrade the same Instance takes later — `aftergrid setup --adapter duckdb --duckdb-path data/warehouse.duckdb`,
which is what this demo uses. Setup never overwrites a file, never writes a credential, resumes on a rerun, and
reports what it could *not* verify rather than rounding it up:
[`../../docs/contracts/setup.md`](../../docs/contracts/setup.md).

## What the runs taught, and what this cannot promise

- **The timings above were measured on one machine**: the two builds (202.2 s, 87.0 s), the derivation (0.3 s)
  and the per-month figures in [`scripts/README.md`](scripts/README.md). **The `/analyze` run's duration is not
  one of them** — it depends on the model, and the six recorded runs ranged from 3 to 30 minutes. "A fresh
  machine follows this in under 30 minutes" has not been tested here and is not claimed.
- **A range, not five wins.** The five golden Questions in `analytics/golden/` expect `answered` twice,
  `inconclusive` twice and `needs_reframing` once, and the congestion case accepts either `answered` or
  `inconclusive` because which is honest depends on the falsifier the Analysis pre-registers — a rule run 2 put
  there by writing a stricter falsifier than the golden's own reasoning.
- **TLC restates months**, so a rebuild weeks later can legitimately produce different numbers. Every Finding
  names the fetch date its numbers rest on; `build_provenance` records the URL, size, `ETag` and hash of
  everything read, or the absence of a hash for a file streamed and never held.
- **No user-level data**: trip and ride records, not rider records, so nothing here can say whether the *same*
  people changed behaviour. And **weather is a Check, not a control** — a passing Check does not make a
  comparison causal.
- **The middle of every run is written down** — the permission wall, a capture that ran before the
  clarification it was meant to follow, a percent-change operand order the arithmetic could not catch and a
  reviewer did, a run that correctly refused its own instruction. Each gap became a change to the Engine, and
  [`docs/run-log.md`](docs/run-log.md) says which.

A proposed landing-page section, for the site owner to lift: [`docs/site-copy.md`](docs/site-copy.md).
