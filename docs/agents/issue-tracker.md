# Issue tracker

**aftergrid's own development** is tracked in **beads** (`br` CLI): `.beads/issues.jsonl`, committed with code. Prefix `ag`. Skills like `to-tickets` and `triage` read from and write to beads; see `.beads/README.md` for commands.

Triage roles map to beads labels with the same names: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`.

**GitHub Issues** on `patrickjmorris/aftergrid` are the public surface only: specs are mirrored there for outside readers, and external bug reports land there once the repo is public. GitHub is not the dev source of truth.

Do not confuse this with the *product's* intake: an Operator's Instance uses GitHub Issues with `ready-for-agent` to trigger background Analyses. That is a feature of the Engine, unrelated to how aftergrid itself is developed.

PRs as a request surface: off.
