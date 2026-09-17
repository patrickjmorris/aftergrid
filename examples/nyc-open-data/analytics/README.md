# Instance root (not scaffolded yet)

This is where the demo Instance will live: `aftergrid.yaml`, `readers.md`, `definitions/`, `findings/`,
`decisions/`, `golden/`. The layout is `docs/contracts/instance-layout.md`.

**It is empty on purpose.** `aftergrid setup` has not been run here, and this file is the only thing in the
directory. Three reasons, all of which would otherwise put something untrue in the tree:

- `setup` writes `aftergrid.yaml` and **never overwrites it** (`docs/contracts/setup.md`). Committing an
  adapterless one now would mean the setup bead's own command — `setup --adapter duckdb --duckdb-path
  demo.duckdb` — could only *print* a connection block rather than configure the Instance.
- A publication policy needs a real repository, a real automation identity and real trusted approvers. Inventing
  them would put a trusted approver who has approved nothing, and a bot account that does not exist, into a
  public file — while the whole point of this demo is to carry one Finding through a real approval to `ready`.
- The scaffold ships `definitions/example_definition.md` and a generic Reader profile. Committed here they would
  read as the demo's definitions and the demo's Reader, which they are not.

## What lands here

Run `aftergrid setup` against this directory with the DuckDB adapter pointed at the `demo.duckdb` the data build
produces, then fill in:

- **Definitions** for the congestion Question and its companions: what counts as a trip into the Congestion
  Relief Zone (by taxi zone id), a comparable weather day, a taxi trip, a for-hire trip, tip rate, a member ride
  and an e-bike ride. Proposed first; approved by the owner, with the approval recorded.
- **Reader profiles** in `readers.md`: a non-data city transport reader, and a bike product reader.
- **Golden Questions** in `golden/`: the three in the example README, plus the cases the Citi Bike Finding
  needs. Their expected outcomes include `inconclusive` and `needs_reframing` deliberately.
- **Findings** in `findings/`: the congestion pricing Finding, taken through a real pull request to a verified
  approval, and the Citi Bike one.

Until then there is nothing here for `aftergrid check` to read, which is exactly what the `examples-check` CI job
reports.
