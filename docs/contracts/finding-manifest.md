# Finding manifest contract

`manifest.yaml` is the machine half of a Finding; `memo.md` is the human half. Schema: `schema/finding-manifest.schema.json` (draft 2020-12, `schema_version: 0.1.0`). Vocabulary: `CONTEXT.md`. This page explains what the schema cannot say by itself: states, the digest envelope, what `check` reports, and which fields the Reader render shows.

## States are separate axes

| Axis | Field | Values | Meaning |
| --- | --- | --- | --- |
| Authoring state | `finding.state` | `draft`, `needs_input`, `complete` | How far the Finding directory is. `new finding` creates `draft`. `needs_input` names who owns the missing piece. `complete` means every required Claim, section and reference is present. |
| Outcome | `finding.outcome` | `pending`, `answered`, `inconclusive`, `insufficient_data`, `needs_reframing` | What the Analysis concluded. `pending` only while not complete. The other three non-answers are valid complete outcomes and pass the template. |
| Question state | `question.state` | `resolved`, `unresolved`, `not_answerable` | A resolved Question carries an executable falsifier. An unresolved or not-answerable one lists what is missing and never invents a falsifier. |
| Evidence validity | `check` report | `valid`, `invalid`, `incomplete` | References resolve, hashes match, required Checks passed, definitions pinned. Not a field: computed. |
| Execution availability | `check` report | `rerun`, `artifact_only` | Whether SQL Checks were re-executed against retained inputs or only saved evidence was verified. Never reported as a fresh pass when not run. |
| Publication readiness | `check` report | `ready`, `not_ready`, `unknown` | A current `publication_approval` attestation whose source verifies at the analyzed commit against the trusted allowlist. `unknown` when the source cannot be reached. Never a field an author sets. |

A complete, evidence-valid `insufficient_data` Finding is a normal, good result. A `draft` can be rendered with a draft label. Nothing in the manifest lets an author claim readiness.

## Identity

- `finding.id` is `fnd_` plus 12 lowercase base-36 characters, minted once by `new finding`. `revision` is an integer; any content change after attestation is a new revision. A refresh or Revisit is always a new revision.
- Every other id (`question`, `snapshot.inputs[]`, `definitions[]`, `queries[]`, `executions[]`, `results[]`, `derived[]`, `external_sources[]`, `claims[]`, `charts[]`, `tables[]`, `checks[]`) uses the restricted charset `^[a-z][a-z0-9_]{0,63}$` and is unique within its list.
- A filename never identifies an execution or result. `executions[].id` binds SQL hash, parameters, input ids and hashes, definition versions and the result hash; `results[].id` binds a file by hash. Renaming a file without updating the manifest is a `hash_mismatch`.

## The evidence chain

```
snapshot.inputs[]  --hash-->  executions[]  --result_hash-->  results[]  --ref-->  claims[].evidence
definitions[]      --version+hash-->  executions[].definition_refs, results[].columns[].definition_ref
external_sources[] --ext-->  claims[].evidence / derived[].operands
derived[]          --operands-->  results / ext / other derived (acyclic)
claims[]           --chart_ids/table_ids-->  charts[] / tables[]  --result_id-->  results[]
checks[]           --path+hash-->  checks/*.sql ; question.falsifier.check_id --> checks[]
```

`check` walks this graph. Every data-bearing displayed value must end at a `results[]` cell, a `derived[]` value or an `external_sources[]` entry. A `claims[].numeric: true` Claim needs at least one evidence reference and at least one chart or table.

## Claims

Each Claim declares: `type` (descriptive, associational, causal), one `sentence`, `population` (who is counted), `comparison` (compared with what, and whether it was pre-registered), `window`, `exclusions`, `limitations`, and a `recheck` policy. Associational and causal Claims cannot have `comparison.kind: none`. The Claim(s) marked `answer_bearing` carry a `material_caveat`, which the memo and render place next to the Answer.

A Claim with `numeric: false` is representable: `evidence` may be empty and no chart or table is needed. This is how an insufficient-data Finding states what is missing without inventing a number.

## Recheck policy (v0 schema only)

`recheck.mode: automatic` requires a `predicate` (subject, operator, threshold, unit; `within`/`outside` also need `tolerance` and `baseline`), a `method` (built-in name or versioned reference), the `evidence` it reads, `minimum_data`, and a `window_policy` (`fixed_window` or `advancing_window`). `recheck.mode: not_automatically_evaluable` requires a `reason` and an `owner`. Neither is a boolean, and neither is the Question's falsifier: the falsifier is a Check file with an expected outcome; a Recheck policy is a per-Claim proposition. `check` validates shape and references in v0; evaluation is v0.1.

## Digest envelope

`content_digest` is SHA-256 over a canonical serialisation (JSON, sorted keys, no whitespace, UTF-8) of:

1. The manifest with these removed: `content_digest`, `attestations`, `reviews`, `finding.generated_at`, `executions[].executed_at`, `checks[].executed_at`, `snapshot.drift_fingerprints`.
2. The bytes of `memo.md`, every `queries[].path`, `checks[].path`, `charts[].spec_path`, `results[].path`, each keyed by its manifest id.
3. `renderer.version` and `renderer.house_style_version` (already inside the manifest; listed here because a house-style change is a content change).

Excluded on purpose: the digest itself, attestations and reviews (they bind to the digest), generated outputs (`render/`, chart SVG/PNG, which are regenerated from validated source before publication), volatile timestamps and drift fingerprints (they change without changing meaning).

Consequences: editing one Claim's `type` or an exclusion changes the digest and invalidates the Finding's attestations. It does not touch a definition's approval, which binds the definition's own `content_hash`. Retained input files are not in the envelope directly; their hashes are, through `snapshot.inputs[].content_hash`.

## Attestations and trust

`attestations[]` records who approved what, bound to a digest. The only v0 source that counts toward readiness is `github_pr_review`: a current, non-dismissed APPROVED review at the exact `commit_sha`, by a login on the Instance's trusted allowlist, verified through the API. The allowlist lives in the Instance policy file, not in this manifest, so a Finding cannot approve itself. `unverified_note` exists so an informal "looks good" can be recorded and is visibly not an approval. Definition approvals use the same source types and bind the definition content hash.

## Export policy and the Reader render

`export_policy.allowed_fields` lists the result columns that may reach the Reader payload, including data embedded for charts and tables. Everything else is projected out of HTML, SVG and any embedded JSON. `private_marker` is a sentinel string the render test asserts is absent. `granularity: row_level` is refused in v0.

The render shows, as separate facts: Checks passed (with names), definitions used with lifecycle and approval state, method and Reader reviews with reviewer and date, publication approval or a draft label, limitations, Snapshot guarantees, coverage, generated-at, revision, owner contact (as a `mailto:` prefilled with Finding and Claim ids only, and as copyable text), and `canonical_location` for newer revisions. A downloaded file cannot know it was superseded; it says so.

## Instance-relative paths

`definitions[].path` is relative to the Instance root; everything else is relative to the Finding directory. See `docs/contracts/instance-layout.md`.
