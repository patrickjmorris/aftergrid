# Examples

Worked examples of aftergrid on public data. Each one is a self-contained Instance an Operator can clone,
build and run before pointing `aftergrid setup` at their own warehouse.

| Example | Data | What it shows |
| --- | --- | --- |
| [`nyc-open-data/`](nyc-open-data/) | NYC TLC trip records, NOAA GHCN-Daily, Citi Bike system data | Congestion pricing and trips into the Congestion Relief Zone, with weather as a Check |

The example is being built bead by bead; its own README says which steps exist today and which do not.

## Two rules that hold for every example

**Examples are not in the npm package.** `package.json` ships a `files` allowlist
(`docs/contracts/distribution.md`), `examples/` is not on it, and the tarball audit in `scripts/pack-smoke.mjs`
fails if any `examples/` path appears. An example is material for reading and running from a checkout, never
something an Operator installs.

**No example data is committed.** Each example carries its own `.gitignore` for whatever its build script
produces — databases, raw downloads, parquet, archives — and the build script fetches from the public source
instead. What *is* committed is the Instance: definitions, Reader profiles, golden Questions, Findings and the
provenance of the inputs. A Finding here is reviewed material; the bytes behind it are rebuilt, not shipped.
