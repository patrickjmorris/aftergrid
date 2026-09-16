# `aftergrid decide`

Records one owner Decision against a reviewed Finding revision. Schema: `schema/decision-record.schema.json`. Layout: `docs/contracts/instance-layout.md`. Implementation: `src/commands/decide.ts`; record validation is shared with `check` through `src/decisions.ts`, and the cited Finding is validated by the shared validator (`scripts/lib/validate-finding.mjs`), never by a second validator here.

A Decision record is the only place an owner's decision exists. Merging a Finding, rendering it, running `check` or running a Revisit never creates, closes or changes one. `decide` writes exactly what the caller supplies and nothing else: it has no defaults for owner, action, rationale, date or revisit condition, and it does not derive a decision from a Finding's outcome.

## Input

Every field is explicit. `decide(opts)` returns a `Report` (`src/report.ts`) with `command: "decide"`.

| Input | Meaning |
| --- | --- |
| `owner` | The person who decided. Never an agent, never inferred from git. |
| `decidedOn` | `yyyy-mm-dd`, a real calendar date. |
| `findingDir`, or `findingId` + `findingRevision` | Which Finding revision is cited. An id resolves by scanning `<instance>/findings/*/manifest.yaml`. |
| `restsOnClaims` | Claim ids of that revision, at least one. |
| `action` | `kind: action \| deliberate_inaction` and a description. Deliberate inaction is a decision and is recorded as one. |
| `rationale` | Why, in the owner's words. |
| `revisitWhen` | A `schedule` (`on_date` + `date`, or `every` + `every_days`; always an IANA `timezone`), a `falsifier` (`finding_id`, `check_id`, optional `revision`), or both. At least one. |
| `outcome` | Optional. Absent means `{ state: pending }`. `recorded` requires a description and `recorded_on`. |
| `supersedes` | Optional id of the record this one corrects. |
| `id` | Optional `dec_` id. Supplying it makes a retry idempotent; omitting it mints one (`mintDecisionId`). |
| `dryRun` | Show the record that would be written, write nothing. |

## What is verified before anything is written

1. **The cited evidence verifies.** The Finding directory is validated with the shared validator. Any error refuses the whole command: a Decision cites evidence, so the evidence must resolve first. A Finding that is `draft` or `needs_input` may still be decided on; the report warns and the record pins that exact revision and digest, claiming nothing more.
2. **Shape.** The record is validated against `schema/decision-record.schema.json` through `decisionSchemaErrors`, the same function `check` uses.
3. **Dates.** `decided_on`, `outcome.recorded_on` and `schedule.date` must be real calendar dates. `2026-02-30` matches the schema pattern and is still refused (`schema`).
4. **Timezone.** `schedule.timezone` must be a zone name the running ICU accepts (`Intl.DateTimeFormat`), such as `America/New_York` or `UTC`. A fixed offset like `+05:00` is refused (`value_type`): a schedule names a place so that a date means one instant.
5. **Bindings.** Every id in `rests_on_claims` must exist in the cited revision, and the falsifier `check_id` must be a `kind: falsifier` Check of the referenced Finding revision (resolved inside the Instance when it is not the cited one). Neither is recorded unverified (`decision_binding`).
6. **Correction chain.** `supersedes` must name a different, existing record (`decision_binding`).

The record binds `finding.id`, `finding.revision` and `finding.content_digest` from the manifest, so a later content change at the same revision is detectable by `check` and is reported as a `decision_binding` error there, never fixed by editing the record.

## Writing

- One file per record: `<instance>/decisions/<dec_id>.yaml`, named by the record's own id.
- Create-if-absent, atomically: the content is written to a temp file in the same directory and hard-linked into place. The link fails if the name is taken, so two concurrent writers cannot overwrite one another and no partially written record is ever visible.
- **Idempotent retry.** If the file exists and its content is identical, the command succeeds and writes nothing. Identity excludes `recorded_at` (the timestamp `decide` itself stamps); everything else must match byte-for-byte after parsing.
- **Conflict.** If the file exists with different content, the command fails with `decision_conflict` and changes nothing — no partial append, no rewritten record, no index change. Records are immutable: retry identically, use a new id, or append a correction with `supersedes`.
- A superseded record is never read-modified-written. The correction is a new file; the original keeps its bytes.

## `decisions.md`

Regenerated from the directory after every successful write, and never the source of truth. Rows are ordered by `decided_on`, then by id, so the file is a deterministic function of the records present. Cells collapse whitespace and escape `|`; the Action cell shows the first clause of the description (the record keeps the full text); the Revisit cell reads `<date>`, `every <n> days`, `when <check_id> fails`, or a schedule and falsifier joined by `, or `; a superseded record's Record cell names the record(s) superseding it.

Index regeneration takes a lock (`decisions/.index.lock`) around read-directory-then-write, and every record file is created before its writer takes that lock, so the last writer sees every record. If the lock cannot be taken within five seconds the index is rebuilt without it and the report warns that it may lag a concurrent record.

## Report

`errors`, `warnings` and `info` in the standard shape. On success `info` says what was recorded (id, action kind, owner, date, Claims, Finding revision), the absolute path of the record, and that the index was regenerated. `finding`, `state` and `outcome` describe the cited Finding; `evidence` reflects the shared validator; `readiness` is the Finding's publication readiness, which `decide` neither needs nor changes. New categories: `decision_conflict` (a different record already holds this id). Existing categories reused: `decision_binding`, `schema`, `value_type`, `unresolved_reference`, `missing_file`, `syntax`, `invalid_artifact`, `unsafe_path`.

## Not enforced

- **Revisit conditions are never evaluated.** The schedule and the falsifier are stored as data. Nothing here runs a Check, compares a date against today, or reports whether a decision still holds; that is `aftergrid revisit` (v0.1) and, ultimately, the owner's judgement.
- **The outcome is never inferred.** A missing outcome stays `pending` forever until someone records one. `decide` does not append an outcome to an existing record — a follow-up is a superseding record.
- **No identity check on `owner`.** The string is recorded as given; it is not verified against git, GitHub or the Instance's allowlist, and it is not an approval or an attestation.
- **No judgement of the decision.** `decide` does not check that the Claims support the action, that the rationale matches the evidence, or that the action is wise.
- **Publication readiness is not required.** A Finding with no verified publication approval can still be decided on; the report says what the Finding's readiness was.
- **Cross-process atomicity stops at the record file.** Record creation is atomic and lossless under concurrency. The generated index is best effort under a lock and can be regenerated at any time from the records.
- **Nothing outside `decisions/` is touched.** The Finding directory, its manifest, its attestations and any superseded record are read-only to this command.
