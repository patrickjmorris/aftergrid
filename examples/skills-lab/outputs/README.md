# Forward-test analysis artifacts

All work used only supplied cases, skills and CSVs. All created artifacts are under this directory; inputs were opened read-only. No external sources, connectors, Engine, extra agents, human approvals or external actions were used. Scripts use Python's standard library and resolve inputs relative to their location, so they can be rerun from any working directory.

- `conversion/plan.md`, `conversion/calculate.py`, `conversion/stdout.json`, `conversion/answer.md`
- `revenue/plan.md`, `revenue/calculate.py`, `revenue/stdout.json`, `revenue/answer.md`
- `review/calculate.py`, `review/stdout.json`, `review/review.md`
- `learning/lessons/conversion-mix.md` (proposed lesson, saved first)
- `learning/plan.md` (saved before follow-up input inspection/execution)
- `learning/calculate.py`, `learning/stdout.json`, `learning/execution-log.md`, `learning/answer.md`
- `skill-usability.md`

Run each `calculate.py` with `python3`; JSON is written to stdout. Saved JSON files contain actual executed stdout. Diagnoses' plans were written after inspecting their tiny extracts and are explicitly not preregistration. The follow-up plan preceded inspecting that extract. The review was one agent's three serial passes.

Artifact handoff check: `verify_artifacts.py` and `verification-stdout.json` verify local Markdown links, script syntax, JSON parsing and that current CSV hashes equal those recorded when each calculation ran. This is an artifact check, not an independent statistical review or a comparison to an answer key. No calculation was rerun during this check.

`command-log.md` records executed calculation and verification commands, their observed results, and the scope of file inspection.
