# aftergrid

Open-source skills, Checks and a thin CLI for producing **Findings**: analysis memos a non-data Reader can understand, inspect and act on, with every number traced to its evidence. The Engine is public; each team's context lives in a private Instance. Vocabulary: `CONTEXT.md`. Decisions: `docs/adr/`. Spec: `docs/spec/`.

Pre-release. Nothing is published to npm yet, the repository is private, and the package is marked
`"private": true` on purpose: packaging is verified, publishing is a separate owner action
(`docs/contracts/distribution.md`).

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
node src/cli.ts plugin validate --json                 # the package agrees with itself (manifest, skills, docs)
pnpm test                 # fixture regressions + CLI tests
pnpm run validate:fixtures
pnpm run smoke:pack       # pack, audit the tarball, install it clean and run the whole CLI from it
```

## Install from a local tarball

```bash
pnpm pack                                              # -> aftergrid-0.0.0.tgz
npm install --ignore-scripts /path/to/aftergrid-0.0.0.tgz
npx aftergrid --help
```

The package ships TypeScript sources and has no build step: Node 22.18+/24+ run them, and the `aftergrid` bin
registers a load hook for the package's own `.ts` files because Node will not strip types under `node_modules`.
Supported platforms are exactly what CI runs — Ubuntu and macOS on Node 22.18 and 24; Windows is not tested.
`npm install --ignore-scripts` is also the evidence for the no-compile claim: DuckDB and the rasterizer load from
prebuilt artifacts with no compiler involved. Details, and the explicit list of what has *not* been done (no npm
publish, no visibility change, no marketplace listing): `docs/contracts/distribution.md`.

The Claude Code plugin manifest is `.claude-plugin/plugin.json`; buckets, the user-/model-invoked split and the
skills.sh layout are in `skills/README.md`, with a docs page per promoted skill under `docs/skills/`.

`setup` scaffolds the Instance (`docs/contracts/instance-layout.md`) and reports six separate facts: what it created or kept, which hard dependencies are present, what the configured source's capabilities actually are, whether the guardrail hook is installed **and** self-tests clean, whether the publication policy could ever produce a verified approval, and whether a throwaway Finding runs `new` -> `check` -> draft `render`. It never overwrites a file, never writes a credential (Postgres is named by environment variable), and records completed steps in `<instance>/.aftergrid-setup.json` so a rerun resumes. `--dry-run` writes nothing. Contract and the full list of what it cannot verify: `docs/contracts/setup.md`.

`check` reports separate facts: syntax, content completeness, evidence validity, whether SQL was executed, and publication readiness. It never reports readiness from the manifest alone. `check --mode rerun` re-executes the saved SQL and Checks on the retained inputs and reports any drift from the saved evidence.

`record` is the default data path: the Operator's harness runs the SQL with whatever tool it already has, and aftergrid writes down what it ran — the SQL, the parameters, the result, who ran it, and every hash. It executes nothing, so a recorded Finding guarantees `artifact_replay` and never `analysis_rerun`, Check outcomes on it are agent-reported (a reported `pass` needs the tool output it rests on), and `check --mode rerun` refuses it by name. `capture` and `execute` through an adapter are the **upgrade** the same Finding gains when an Instance configures one. Contract: `docs/contracts/record.md` (ADR 0010).

`intake` runs Issue requests in the background: it claims an Issue labelled `ready-for-agent` at a stable revision (`intake_<issue>_<hash>`), **refuses to dispatch** unless the guardrail hook is installed *and* self-tests clean, the Instance policy is present and the source's limits are declared — there is no bypass flag — hands the request to an analysis harness, runs `check` on what comes back, and opens **one** draft pull request per run. It pauses with `needs-info` instead of guessing, never removes a label, and never reports a Finding as approved: publication still needs a human APPROVED review. Duplicate triggers, restarts and edited Issues do not duplicate pull requests or lose work. Contract: `docs/contracts/intake.md`. The analysis harness itself is a stub until its own bead lands, and no test runs it; the GitHub path is exercised only through fakes, so treat the live API path as untested.

## Layout

- `schema/` canonical JSON Schemas (Finding manifest, Decision record, Reader profile)
- `docs/contracts/` the contracts those schemas cannot express
- `src/` the CLI (`setup`, `new finding`, `check`, `record`, `render`, `decide`, `hook`, `intake`, `plugin validate`), the adapters (DuckDB, Postgres) and the publication readiness check
- `scripts/` fixture tooling and the shared validation library (`scripts/lib/`)
- `hooks/claude-code/` the PreToolUse guardrail hook (`aftergrid hook install`; contract and non-coverage in `docs/contracts/hook.md`)
- `skills/` the Claude Code skills, each with an `agents/openai.yaml` beside it (`setup-aftergrid` is user-invoked); buckets and the invocation split: `skills/README.md`
- `.claude-plugin/plugin.json` the Claude Code plugin manifest; `bin/` the `aftergrid` launcher; `docs/skills/` a page per promoted skill
- `fixtures/instance/` a synthetic Instance with reviewed exemplar Findings (`fixtures/README.md`); `fixtures/negatives/` seam-1 failure cases, one defect each
- `hooks/claude-code/` the PreToolUse guard installed by `aftergrid hook install`

## Credits

The Engine's shape is adapted from [Matt Pocock's skills](https://github.com/mattpocock/skills) (MIT): the skill format and buckets, the user- versus model-invoked split, the CLAUDE.md conventions, and the `grilling` and `writing-for-agents` disciplines that `/grill-question` and every SKILL.md here depend on. Install `mattpocock-skills` alongside aftergrid; `aftergrid setup` checks for it. The full notice is in `LICENSE`.

Development is tracked in beads (`.beads/`, see `docs/agents/issue-tracker.md`).
