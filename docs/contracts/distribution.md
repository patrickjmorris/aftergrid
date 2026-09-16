# Distribution

How aftergrid is packaged, what a clean install actually establishes, and — just as load-bearing — what it does
not. Contract for bead `ag-distribution-dq4` and spec story 48.

The package is **not published**. `package.json` keeps `"private": true` and the version is `0.0.0`. Everything
below is about a locally packed tarball and a locally installed plugin; publishing is the owner's action.

## What the package contains

`pnpm pack` produces `aftergrid-<version>.tgz` from the `files` whitelist in `package.json`:

| Path | Why it ships |
| --- | --- |
| `bin/` | The `aftergrid` launcher and the type-stripping load hook it registers. |
| `src/` | The CLI, adapters, renderer, publication and intake code — TypeScript, executed as-is. Test files are excluded by `!src/**/*.test.ts`. |
| `scripts/` | The shared validation library (`scripts/lib/`) and `scripts/fixture-safety.mjs`, which `src/` imports at runtime, plus the fixture tooling that comes with them. |
| `schema/` | The canonical JSON Schemas `check` validates against. |
| `hooks/` | The PreToolUse guard `aftergrid hook install` writes into Claude Code settings. |
| `skills/` | The promoted skills, each with `agents/openai.yaml`, and `skills/README.md`. |
| `.claude-plugin/` | The Claude Code plugin manifest. |
| `docs/contracts/`, `docs/skills/` | The contracts the schemas cannot express, and a page per promoted skill. |
| `README.md`, `LICENSE` | |

Deliberately **not** in the package: `fixtures/` (an Operator's data comes from their own Instance, and the
Engine holds no nouns), `tests/`, `.beads/`, `docs/design/`, `docs/spec/`, `docs/adr/`, `.github/`. The pack smoke
fails if any of them appears in the tarball.

## No build step, and the evidence for it

The package ships TypeScript sources and no build output. Node 22.18+ on the 22 line and Node 24+ strip types at
load, so `bin/aftergrid.mjs` — plain JavaScript, so that an unsupported Node reaches a message instead of a parse
error — checks the running version and then imports `src/cli.ts`. `engines.node` is `>=22.18`. There is no
`prepare`, `prepack` or `install` script in `package.json`.

### The node_modules exception, and how the bin gets past it

Node's built-in type stripping **does not apply to files under `node_modules`**: loading an installed package's
`.ts` file throws `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`, and no flag disables that (checked on Node 26
with no flag, with `--experimental-strip-types` and with `--no-experimental-detect-module` — all three throw). A
package of TypeScript sources is therefore *not* runnable as installed, which is the whole reason
`bin/strip-types.mjs` exists.

It registers a module load hook (`module.registerHooks` with `module.stripTypeScriptTypes`, both available on the
supported Node lines) that strips types for `.ts` files **under this package only** and defers everything else to
the default loader. Stripping is erasure (`mode: "strip"`), so line and column numbers survive into stack traces
and non-erasable TypeScript — enums, namespaces, parameter properties — fails here exactly as it would under
Node's own stripping. The Engine is written in erasable TypeScript, which is what makes this viable.

Two consequences an Operator can meet:

- **Through the `aftergrid` bin, nothing changes.** The launcher registers the hook and then imports the CLI.
- **Importing aftergrid's modules directly needs one extra line, and dynamic `import()`.** ESM links the whole
  graph before any module body runs, so a static import of a `.ts` module in the same file would be translated
  before the hook exists:

  ```js
  await import("aftergrid/bin/strip-types.mjs");            // side effect: registers the hook
  const { intake } = await import("aftergrid/src/commands/intake.ts");
  ```

`module.stripTypeScriptTypes` is flagged experimental by Node. The maintainer's alternative, if that API moves,
is a build step emitting JavaScript — which would end the no-build-step property, not the no-compile one.

Two separate claims live here, and only one of them is about aftergrid's own code:

1. **No compile step for the Engine.** Evidenced by the absence of a build script and by the CLI running from the
   installed tarball.
2. **No local compilation for the dependencies.** Evidenced by `scripts/pack-smoke.mjs` installing the tarball
   with `npm install --ignore-scripts` — which is what makes it evidence, since a package that needed to build
   would have no opportunity to — and then, from that install, importing `@duckdb/node-api` (running a real
   query) and `@resvg/resvg-wasm`. The smoke also fails if the install log mentions `node-gyp`, `gyp ERR` or
   `prebuild-install`. Prebuilt native runtimes are allowed; compiling them locally is not.

## Supported platform matrix

Only what CI actually runs is declared supported. The `pack-smoke` job in `.github/workflows/ci.yml` runs
`node scripts/pack-smoke.mjs` on:

| OS | Node |
| --- | --- |
| `ubuntu-latest` | 22.18, 24 |
| `macos-latest` | 22.18, 24 |

Nothing else is claimed. **Windows is not tested** and is not on the matrix. Node 23 is not tested either: type
stripping arrived in 23.6, so the launcher lets it run, and `aftergrid setup` reports the 23 line as `unknown`
rather than supported. Architectures are whatever those GitHub runner images provide; `@duckdb/node-api`
publishes prebuilt binaries per platform and an unlisted platform would fail at install, not at runtime.

## Installing from a local tarball

```bash
pnpm pack                                   # -> aftergrid-0.0.0.tgz
mkdir /tmp/try && cd /tmp/try && npm init -y
npm install --ignore-scripts /path/to/aftergrid-0.0.0.tgz
npx aftergrid --help
npx aftergrid plugin validate --json        # the installed copy checks itself
```

**As a Claude Code plugin**, from a checkout or an unpacked tarball: the manifest is `.claude-plugin/plugin.json`
at the package root and the skills are the paths it lists. There is no marketplace entry, so installation is from
a local path. **With skills.sh**: point it at a skill directory under `skills/`; `package.json#skills` carries the
same list as the manifest, mirroring `mattpocock-skills`. Neither installer is run by CI — `aftergrid plugin
validate` checks the layout, and a layout that validates is not the same as an install that succeeded.

## `aftergrid plugin validate`

Checks that the shipped package agrees with itself:

- `.claude-plugin/plugin.json` parses, carries `name`, `description` and `version`, and every skill path it names
  exists with a `SKILL.md` and is not in a non-shipped bucket.
- `package.json#skills`, when present, lists exactly the same paths.
- Every promoted skill (`skills/<name>/`, excluding the `in-progress`, `deprecated` and `misc` buckets) is named
  in the manifest, and its frontmatter carries `name` (matching the directory) and `description`.
- Every promoted skill states its invocation policy **explicitly and in both places**: `SKILL.md` frontmatter
  carries `disable-model-invocation: true` (user-invoked) or `user-invocable: false` (model-invoked), and
  `agents/openai.yaml` carries a matching `policy.allow_implicit_invocation` (`false` or `true`). A skill that
  states neither, states both, or whose two files disagree is an error with the file and key in the location.
- Each promoted skill has a non-empty docs page at `docs/skills/<name>.md`.

It runs no installer and asserts nothing about skill quality.

## The pack smoke

`pnpm run smoke:pack` (`node scripts/pack-smoke.mjs`) packs the repository and, from a fresh temporary project
with the tarball installed, runs the whole product through its installed bin:

| Step | What it establishes |
| --- | --- |
| `pack` | A tarball is produced. |
| `tarball-audit` | No `fixtures/`, `tests/`, `.beads/`, `docs/design`, `docs/spec`, `docs/adr` or `.github`; no test files; every required file present; no credential pattern (a GitHub token prefix, a Postgres URL carrying an inline password, an AWS access key id) and no private fixture sentinel (`PRIVATE_FIXTURE_MARKER_…`) in any shipped file except the two that search for it; `LICENSE` present with the MIT notice intact; runtime dependencies are `dependencies`, not `devDependencies`; `"private": true` still set. |
| `clean-install` | `npm install --ignore-scripts <tgz>` into an empty project succeeds and the log shows no native build. |
| `native-runtime` | `@duckdb/node-api` answers a query and `@resvg/resvg-wasm` loads, from that install. |
| `cli-help`, `plugin-validate` | The installed bin runs, and validates its own installed copy. |
| `setup` | Scaffolds a fresh Instance from CSV inputs; the guardrail hook installs **and** self-tests (a write blocked, a read allowed); publication is reported `unknown` with the runbook remedy because no token is set; a missing `mattpocock-skills` is reported with its install line; the throwaway smoke Finding does not leak into the Instance. |
| `new-finding`, `check` | A fresh draft is created and reported incomplete with valid evidence and no SQL executed. |
| `render-draft` | A copied reviewed exemplar renders to HTML plus SVG charts, carries the draft label, and contains no fixture marker. |
| `decide` | `--dry-run` writes nothing; the real run appends one immutable Decision record and indexes it. |
| `intake-fixture` | `intake()` from the installed package pauses `needs_input` (labels the Issue, opens nothing), then `--resume --provided` completes and opens exactly one draft pull request keyed to the run id. |

The Instance material (CSV inputs, the reviewed exemplar) is supplied from this checkout's `fixtures/`, from
outside the package, because that is where an Operator's data comes from.

`--quick` runs `pack` and `tarball-audit` only; that is the mode the unit suite uses. The summary is JSON on
stdout and the exit code is non-zero if any step failed.

`bin/strip-types.mjs` is exercised twice over: every CLI step above goes through it, and the intake step imports
it explicitly before deep-importing the package's modules.

The intake step drives the exported `intake()` function with the fakes in `src/intake/*` rather than the CLI,
because the `intake` command talks to GitHub and has no fake-source flag. Adding one would put a test hook in a
product surface; nothing in the shipped CLI was changed for the smoke.

## Not done here

None of the following is part of this bead, and none of it has happened:

- **No `npm publish`.** The package is `"private": true` and version `0.0.0`.
- **No repository visibility change.** The repository stays as the owner set it.
- **No public activation** of any kind: no announcement, no install instructions published anywhere.
- **No marketplace listing.** There is no `.claude-plugin/marketplace.json` and no submission.
- **No installer run.** Neither Claude Code's plugin installer nor skills.sh has installed this package; the
  layout is validated, not exercised.
- **No live GitHub path.** Intake is exercised through fakes only.

The follow-on external-release gate is `ag-external-release-readiness-4zn`.
