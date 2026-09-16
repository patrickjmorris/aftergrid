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
                                      # With none, the duckdb/postgres blocks below are absent, `capture` and
                                      # `execute` refuse with `recorded_path`, and unattended intake stays refused.
  # secrets are referenced, never stored
  duckdb: { path: data/warehouse.duckdb, read_only: true }
  postgres: { url_env: AFTERGRID_PG_URL, statement_timeout_ms: 30000, estimate_cap: 1000000 }
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

The design assumed `decisions.md` as the log. `aftergrid decide` must be idempotent on retry, reject conflicting duplicates, and never lose a record under concurrent writes. One YAML file per record, named by the caller-supplied stable id, makes those properties achievable with plain git semantics; `decisions.md` becomes a generated index. The layout does not by itself guarantee them: atomic create-if-absent, conflict detection on differing duplicate input and concurrent-write behaviour belong to `aftergrid decide` and are specified in `docs/contracts/decide.md`. Owner-confirmed 2026-09-15.

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

**Definition content hash.** SHA-256 of the UTF-8 bytes of: the canonical JSON (sorted keys, no whitespace) of the front matter with the `approval` key removed, then a newline, then the body below the closing `---`. The approval block is excluded so an approval can carry the hash of what it approved; the rest of the front matter (id, version, kind, grain, population, denominator, window, owner) is included because changing any of it changes the definition's meaning. Reference implementation: `definitionHash` in `scripts/fixture-tool.mjs`.

The Engine never contains a definition, a table name, a reader or a credential. Synthetic fixtures in the Engine mirror this layout under `fixtures/instance/`.
