# Instance layout

What `/setup-aftergrid` scaffolds inside an Operator's repository, by running `aftergrid setup`
(`docs/contracts/setup.md`, which also says what setup verifies and what it cannot). The Engine holds verbs; everything here is the Instance's nouns. Default root `analytics/`; the Engine reads the root from `analytics/aftergrid.yaml` when present at the repository root, otherwise from `--instance`.

```
analytics/
  aftergrid.yaml                  # connection profile reference, policy, trusted allowlist
  readers.md                      # named Reader profiles (docs/contracts/reader-profiles.md)
  definitions/
    <definition_id>.md            # one Metric definition or Diagnostic calculation per file
  findings/
    <yyyy-mm-dd>-<slug>/
      memo.md                     # canonical text (docs/contracts/memo-template.md)
      manifest.yaml               # canonical bindings (docs/contracts/finding-manifest.md)
      queries/<query_id>.sql
      checks/<check_id>.sql
      charts/<chart_id>.vl.json   # Vega-Lite spec, validated subset, no data
      results/<result_id>.json    # saved result set
      inputs/                     # retained inputs (DuckDB file or extracts) with hashes in the manifest
      render/                     # generated: chart SVG/PNG, finding.html. Never hand-edited; regenerated before publication
  decisions/
    <dec_id>.yaml                 # one Decision record per file (schema/decision-record.schema.json)
  decisions.md                    # generated index of the Decision log; never the source of truth
  golden/
    <question_id>.yaml            # golden Questions: expected answer or abstention, tolerances, evidence constraints
```

## `aftergrid.yaml`

```yaml
schema_version: 0.1.0
instance_root: analytics
connection:
  adapter: none | duckdb | postgres   # none is the default: the recorded path (ADR 0010, docs/contracts/record.md),
                                      # where the harness runs the SQL and `aftergrid record` writes it down.
                                      # With none, the duckdb/postgres blocks below are absent; `capture` refuses
                                      # with `recorded_path`; `execute` refuses with `recorded_path` on a Finding
                                      # with no retained inputs, and still runs on one that has them; `check
                                      # --mode rerun` answers `rerun_unavailable` for a recorded Finding, and
                                      # never reads this block; unattended intake stays refused.
                                      # `aftergrid setup --adapter …` PRINTS this block for an Instance that
                                      # already has an aftergrid.yaml; setup never overwrites this file.
  # secrets are referenced, never stored
  duckdb: { path: data/warehouse.duckdb, read_only: true, estimate_cap: 5000000 }
  postgres: { url_env: AFTERGRID_PG_URL, statement_timeout_ms: 30000, estimate_cap: 5000000 }
                                      # estimate_cap (both backends, optional, one default of 5000000 for either,
                                      # which `aftergrid setup` also writes into both blocks): the largest
                                      # planned scan any read may make. It bounds `capture` too, because a
                                      # whole-table copy is a scan of the whole table; a table over it is refused
                                      # with `admission` before anything is read or written, and the answer is the
                                      # windowed-Instance pattern (docs/contracts/adapters.md), never a narrower
                                      # capture. A value that is not a whole number of rows greater than zero is
                                      # refused with `invalid_artifact`, never coerced. `aftergrid capture
                                      # <finding-dir> --catalog` reports each table's scan rows, its bytes where
                                      # the source states them, and its admissibility without copying anything.
publication:
  repository: owner/repo               # where Finding PRs are opened
  trusted_approvers: [github-login]     # humans whose PR APPROVED review counts. Not editable by a Finding PR: CODEOWNERS or branch protection guards this file
  automation_login: aftergrid-bot       # distinct identity that authors PRs; never on trusted_approvers
export_defaults:
  recipient_scope: named_readers
  granularity: aggregate_only
owner:
  name: ...
  contact: ...@...
render:
  font: { preset: system }             # system (default) | geist (shipped, SIL OFL) | { family, files: [{ path, weight, style }], fallback }
```

`render.font` chooses the house font for the Reader HTML and chart PNGs. Files are resolved inside the Instance root and embedded into the HTML as data URIs, so the artifact stays self-contained; a `.ttf`/`.otf` among them also feeds the PNG rasterizer. See `docs/contracts/render.md`, "Fonts".

## Why one file per Decision record

The design assumed `decisions.md` as the log. `aftergrid decide` must be idempotent on retry, reject conflicting duplicates, and never lose a record under concurrent writes. One YAML file per record, named by the caller-supplied stable id, makes those properties achievable with plain git semantics; `decisions.md` becomes a generated index. The layout does not by itself guarantee them: atomic create-if-absent, conflict detection on differing duplicate input and concurrent-write behavior belong to `aftergrid decide` and are specified in `docs/contracts/decide.md`. Owner-confirmed 2026-09-15.

## Definition file

```markdown
---
id: retained_7d
version: 2
kind: metric              # metric | diagnostic
lifecycle: approved       # proposed | approved | deprecated (display only; approval is an attestation)
grain: user
population: users who completed signup
denominator: signup cohort
window: 7 days from signup, analytical timezone America/New_York
owner: ...
counter_metrics:                                    # optional; see below
  - id: deep_return_rate_7d
    version: 1                                      # optional; omitted means the definition's current version
    why: Pushing this metric with re-engagement nudges buys single one-tap opens, which count here and leave the share of users who came back on three or more days flat.
approval:
  source: { type: github_pr_review, repository: ..., pull_request: 12, review_id: 345, commit_sha: ... }
  approver: ...
  date: 2026-08-01
  content_hash: { algorithm: sha256, value: ... }   # definition content hash at approval time, see below
---
Plain-language meaning.

## SQL (duckdb)
```sql
...
```

## SQL (postgres)
```sql
...
```
```

**Definition content hash.** SHA-256 of the UTF-8 bytes of: the canonical JSON (sorted keys, no whitespace) of the front matter with the `approval` key removed, then a newline, then the body below the closing `---`. The approval block is excluded so an approval can carry the hash of what it approved; the rest of the front matter (id, version, kind, grain, population, denominator, window, owner, `counter_metrics`, `counter_metrics_none_because`) is included because changing any of it changes the definition's meaning. Reference implementation: `definitionHash` in `scripts/lib/validate-finding.mjs`.

## Counter-metrics

A metric that becomes a target stops measuring the thing it stood for. The Engine cannot notice that on its own, so a definition says out loud what pushing it would damage, and a Finding that publishes it as its decision metric has to report that thing beside it.

```yaml
counter_metrics:
  - id: <another definition in this Instance>
    version: 2            # optional
    why: One plain sentence.
counter_metrics_none_because: One plain sentence.   # optional, and only when counter_metrics is absent
```

- **Shape.** `counter_metrics` is a list of `{ id, version?, why }`. `id` uses the definition charset `^[a-z][a-z0-9_]{0,63}$` and names **another definition file in the same Instance** — `definitions/<id>.md` must exist, and a definition may not name itself. `version`, when present, pins that definition's version; when absent the counter-metric is whatever version the Instance currently carries. Ids are unique within the list. Nothing requires a counter-metric to be approved: it is not the published decision metric, and a proposed counter-metric named honestly is worth more than an approved one nobody wrote down.
- **`why` is one sentence**, and it says what gaming the primary metric would do to this one — the mechanism, not the sentiment. "Support load could rise" is not it; "holding cancellations down by making canceling hard pushes the work onto support contacts, which this counts" is.
- **Optional, and omitted when empty.** A definition with no counter-metrics carries **no** `counter_metrics` key — never `counter_metrics: []`. That is what keeps every already-approved definition's content hash byte-identical: the field's absence is its default, so no definition approved before this existed has changed.
- **"None" is a recorded decision, not an omission.** Because the field is omitted when empty, an explicit "none, because …" has nowhere to live, and an Operator who thought about it would look exactly like one who never did. `counter_metrics_none_because` is that place: one sentence saying why nothing could be named. It is refused alongside a non-empty `counter_metrics` — a definition either names counter-metrics or says why it names none, never both. `/grill-question` records the answer there (`docs/skills/grill-question.md`).
- **Hash consequence.** `counter_metrics` and `counter_metrics_none_because` are front matter, so they are inside the definition content hash. Adding either to an **approved** definition changes its hash, and what `check` enforces is a new Operator approval bound to the new content; the convention, not enforced, is a new version — re-signing the same version passes. Not a clerical cost but the correct one: what a metric would damage if it were pushed is part of what the metric means, so an Operator approves that sentence the way they approve the population and the denominator. A **proposed** definition is still being proposed; adding the field there needs no version bump, only a re-pin wherever its hash is cited.
- **Publication consequence.** When a definition that lists counter-metrics is a Finding's published decision metric, the Finding must report each one: `counter_metric_missing` in `docs/contracts/finding-manifest.md`.

The Engine never contains a definition, a table name, a reader or a credential. Synthetic fixtures in the Engine mirror this layout under `fixtures/instance/`.

## Where definition front matter is validated

There is no JSON Schema file for a definition. Front matter is validated in code, in two places, and both are the contract:

- `renderProposedDefinition` / `proposeDefinition` in `src/analysis/definitions.ts` write the canonical bytes (key order included) and refuse to touch an approved file.
- `validateFinding` in `scripts/lib/validate-finding.mjs` reads the file of every definition a Finding pins and checks id, version, lifecycle, the approval binding and the `counter_metrics` shape. A malformed `counter_metrics` block is reported as `schema` at `manifest.yaml#/definitions/<i>`, because the Finding cannot be evaluated against a definition whose own front matter cannot be read.
