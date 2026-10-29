# Examples

Worked examples of aftergrid skills, from small synthetic teaching cases to an Engine Instance on public
data. Start with the skills lab; it needs no warehouse, credentials or Engine setup.

| Example | Data | What it shows |
| --- | --- | --- |
| [`skills-lab/`](skills-lab/) | Tiny synthetic CSVs, committed for inspection | Mix shift, recurring-revenue decomposition, causal overclaim, and reuse of a scoped lesson |
| [`spotsports-youtube/`](spotsports-youtube/) | Spot Sports' YouTube catalog: aggregate results and public channel titles from private extracts (owner-approved) | Turning a raw metric into decisions for sports YouTube: sizing the 2026 view-counting change by sport, season, channel, and format, and naming what creators, clubs, leagues, and sponsors should report and price on. A 10-slide deck with a sport and channel appendix |
| [`nyc-open-data/`](nyc-open-data/) | NYC TLC trip records, NOAA GHCN-Daily, Citi Bike system data | Congestion pricing and trips into the Congestion Relief Zone, with weather as a Check |

Each README separates executable calculations, actual agent runs and publication status.

## Two rules that hold for every example

**Examples are not in the npm package.** `package.json` ships a `files` allowlist
(`docs/contracts/distribution.md`), `examples/` is not on it, and the tarball audit in `scripts/pack-smoke.mjs`
fails if any `examples/` path appears. An example is material for reading and running from a checkout, never
something an Operator installs.

**No private data or bulk source downloads are committed.** The Spot Sports example commits only aggregate results its owner approved for publication; its extract stays private. Public-source Instances carry a `.gitignore` for
databases, raw downloads, parquet and archives; their scripts fetch the source data. The skills lab instead
commits tiny, deliberately synthetic inputs so the entire exercise is inspectable offline. Neither teaching
data nor a saved agent analysis is evidence of human approval or a customer result.
