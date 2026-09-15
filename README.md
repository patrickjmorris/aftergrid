# aftergrid

Open-source skills, Checks and a thin CLI for producing **Findings**: analysis memos a non-data Reader can understand, inspect and act on, with every number traced to its evidence. The Engine is public; each team's context lives in a private Instance. Vocabulary: `CONTEXT.md`. Decisions: `docs/adr/`. Spec: `docs/spec/`.

Pre-release. Nothing is published to npm yet.

## Run the CLI from source

Requires Node 22.18 or newer, or Node 24 or newer (TypeScript type stripping is on by default from those versions), and pnpm. No native compiler: DuckDB ships prebuilt.

```bash
pnpm install
node src/cli.ts --help
node src/cli.ts new finding my-question --ask "Did the checklist help?" --instance fixtures/instance
node src/cli.ts check fixtures/instance/analytics/findings/2026-07-20-onboarding-checklist-retention
pnpm test                 # fixture regressions + CLI tests
pnpm run validate:fixtures
```

`check` reports separate facts: syntax, content completeness, evidence validity, whether SQL was executed, and publication readiness. It never reports readiness from the manifest alone.

## Layout

- `schema/` canonical JSON Schemas (Finding manifest, Decision record, Reader profile)
- `docs/contracts/` the contracts those schemas cannot express
- `src/` the CLI (`new finding`, `check`; `render`, `decide`, `intake` follow in their beads)
- `scripts/` fixture tooling and the shared validation library (`scripts/lib/`)
- `fixtures/instance/` a synthetic Instance with reviewed exemplar Findings (`fixtures/README.md`)

Development is tracked in beads (`.beads/`, see `docs/agents/issue-tracker.md`).
