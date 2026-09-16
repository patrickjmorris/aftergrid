# aftergrid

Open-source skills, Checks and a thin CLI for producing **Findings**: analysis memos a non-data Reader can understand, inspect and act on, with every number traced to its evidence. The Engine is public; each team's context lives in a private Instance. Vocabulary: `CONTEXT.md`. Decisions: `docs/adr/`. Spec: `docs/spec/`.

Pre-release. Nothing is published to npm yet.

## Run the CLI from source

Requires Node 22.18 or newer, or Node 24 or newer (TypeScript type stripping is on by default from those versions), and pnpm. No native compiler: DuckDB ships prebuilt.

```bash
pnpm install
node src/cli.ts --help
node src/cli.ts setup --instance analytics --adapter duckdb --duckdb-path data/warehouse.duckdb \
  --owner-name "Your Name" --owner-contact you@example.com \
  --repository owner/repo --automation-login your-bot --trusted-approver your-login
node src/cli.ts new finding my-question --ask "Did the checklist help?" --instance fixtures/instance
node src/cli.ts check fixtures/instance/analytics/findings/2026-07-20-onboarding-checklist-retention
node src/cli.ts render <copy-of-a-finding-dir> --png   # writes render/finding.html and chart SVG/PNG
node src/cli.ts intake --repo owner/repo --once        # claim labelled Issues, dispatch, open one draft PR per run
pnpm test                 # fixture regressions + CLI tests
pnpm run validate:fixtures
```

`setup` scaffolds the Instance (`docs/contracts/instance-layout.md`) and reports six separate facts: what it created or kept, which hard dependencies are present, what the configured source's capabilities actually are, whether the guardrail hook is installed **and** self-tests clean, whether the publication policy could ever produce a verified approval, and whether a throwaway Finding runs `new` -> `check` -> draft `render`. It never overwrites a file, never writes a credential (Postgres is named by environment variable), and records completed steps in `<instance>/.aftergrid-setup.json` so a rerun resumes. `--dry-run` writes nothing. Contract and the full list of what it cannot verify: `docs/contracts/setup.md`.

`check` reports separate facts: syntax, content completeness, evidence validity, whether SQL was executed, and publication readiness. It never reports readiness from the manifest alone. `check --mode rerun` re-executes the saved SQL and Checks on the retained inputs and reports any drift from the saved evidence.

`intake` runs Issue requests in the background: it claims an Issue labelled `ready-for-agent` at a stable revision (`intake_<issue>_<hash>`), **refuses to dispatch** unless the guardrail hook is installed *and* self-tests clean, the Instance policy is present and the source's limits are declared — there is no bypass flag — hands the request to an analysis harness, runs `check` on what comes back, and opens **one** draft pull request per run. It pauses with `needs-info` instead of guessing, never removes a label, and never reports a Finding as approved: publication still needs a human APPROVED review. Duplicate triggers, restarts and edited Issues do not duplicate pull requests or lose work. Contract: `docs/contracts/intake.md`. The analysis harness itself is a stub until its own bead lands, and no test runs it; the GitHub path is exercised only through fakes, so treat the live API path as untested.

## Layout

- `schema/` canonical JSON Schemas (Finding manifest, Decision record, Reader profile)
- `docs/contracts/` the contracts those schemas cannot express
- `src/` the CLI (`setup`, `new finding`, `check`, `render`, `decide`, `hook`, `intake`), the adapters (DuckDB, Postgres) and the publication readiness check
- `scripts/` fixture tooling and the shared validation library (`scripts/lib/`)
- `hooks/claude-code/` the PreToolUse guardrail hook (`aftergrid hook install`; contract and non-coverage in `docs/contracts/hook.md`)
- `skills/` the Claude Code skills, each with an `openai.yaml` beside it (`setup-aftergrid` is user-invoked)
- `fixtures/instance/` a synthetic Instance with reviewed exemplar Findings (`fixtures/README.md`); `fixtures/negatives/` seam-1 failure cases, one defect each
- `hooks/claude-code/` the PreToolUse guard installed by `aftergrid hook install`

Development is tracked in beads (`.beads/`, see `docs/agents/issue-tracker.md`).
