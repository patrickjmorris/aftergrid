# Code review and fixes — 2026-09-15

## Scope and result

Reviewed all implemented scripts, schemas, exemplar SQL, evidence files and reference HTML, including the original implementation and the corrections at `f7f58f4`. At this stage the repository contains fixture tooling, not a production CLI or application. The initial focused suite reproduced thirteen failures. All 33 regression tests pass and cover the fixes below and validates the intended examples and failure outcomes.

No external service was contacted by test SQL. Injection and file-access tests use disposable local fixtures and sentinel content. No human approval or Reader study was fabricated.

## Root causes and fixes

| Priority | Failure and underlying cause | Correction |
| --- | --- | --- |
| P1 | HTML values were interpolated without escaping, and the filler bypassed hash validation. An edited result or metadata field could produce false evidence or executable markup. | Validate first; escape values; URI-encode email links; constrain metadata fields; preserve the previous HTML on failure. Templates remain trusted code. |
| P1 | Files were addressed by unchecked joins. A syntactically relative path could follow a symlink outside the Finding; output paths could alias inputs. | Check path components, reject symlinks and traversal, and reject source/output path collisions before reading or writing. |
| P1 | Fixture SQL ran with unrestricted file access, and all retained inputs were available regardless of the execution's declared dependencies. | Materialize only declared inputs per execution; disable external access and extension loading; lock configuration; permit one SELECT; bind parser-reported parameters; bound execution time and resources. |
| P1 | Rebuilds automatically rewrote approval and review digests to match newly generated content. This silently transferred old approval to unseen content. | Preserve all existing approvals and reviews. Changed content produces stale evidence bindings that require a new review. Rendered drafts visibly identify stale reviews. |
| P1 | Schema-valid metadata was treated as sufficient evidence integrity. Duplicate IDs, mismatched result/execution identities, nonnumeric decimal strings and missing or wrongly typed cells could be accepted. | Add semantic identity, reciprocal execution binding, row shape, complete type, unique-key and definition-reference checks. Reject unsafe JSON integers. |
| P1 | Checks consumed only the first row and treated a missing `pass` column as intentional abstention. SQL errors on optional Checks could still leave evidence valid. | Require exactly one boolean-or-null `pass` row and optional text `detail`; distinguish engine errors from analytical outcomes; stage results until SQL completes. |
| P2 | Chart checking inspected only selected levels and direct encodings. Tooltip arrays and nested fields could bypass transformation and export restrictions. | Walk nested chart objects, validate field/export bindings, reject unsupported transforms, expressions, data sources and constant evidence. Apply export/provisional checks to prose and derived values too. |
| P2 | Separate arithmetic implementations converted decimal strings to binary floating point. For example, rounding `1.005` to two decimals produced an unreliable result. | Share exact rational arithmetic using BigInt, round once for display, validate units/arity, and preserve null and zero-denominator outcomes. |
| P2 | Missing files and malformed JSON escaped as stack traces; the wrapper could then crash parsing empty output. Quoted/encoded repository paths also broke SQL or file URLs. | Return structured validation failures; surface child-process errors; use fileURLToPath and SQL string quoting. |
| P2 | The generator tested a base cancellation time before adding a random offset. Seven cancellations fell after the declared snapshot capture time. Midnight UTC was also not the end of the stated New York reporting day. | Check the final event time, use the explicit 04:00 UTC capture cutoff, regenerate the snapshot and hashes, and test deterministic generation and timestamp bounds. |

The earlier product-contract corrections remain intact: generic Reader fallback, abstention requiring both minimums, correct cancellation cohorts, honest outcome wording, separate historical Check outcomes, compound Recheck eligibility, expanding-window semantics, and explicit digest rules.

## Validation

- `npm test`: 33 passing behavioural regression tests for corrupt/missing evidence, symlinks, result identity/type errors, HTML injection/export bypass, preserved approvals, malformed Checks, partial-build protection, SQL write/external-read restrictions, undeclared dependencies, named-parameter comments, cycles, exact decimals, nulls, overflow, deterministic generation and capture boundaries.
- `npm run validate:fixtures`: all four fixtures retain their intended outcomes; complete Findings are evidence-valid, the needs-input case remains incomplete, and publication readiness remains `not_ready`.
- Both main exemplars were rerun against retained inputs and rendered successfully. The answered example remains 217/624 versus 186/653; the insufficient-data example remains seven days, 67 eligible cancellations and 887 subscriptions active at the change.
- The insufficient-data method review is now correctly stale after the snapshot correction. Its recorded review was preserved, not silently rebound.
- The numeric Finding's existing Decision digest remains unchanged.

## Limits and remaining gate

These changes harden the existing fixture tools. They do not deliver the planned production adapter, publication approval verifier, full Vega-Lite renderer or operating-system sandbox. The SQL settings follow [DuckDB's security guidance](https://duckdb.org/docs/current/operations_manual/securing_duckdb/overview); their limits are explicit in the fixture README.

The exemplar bead still needs the agreed session with a real non-data Reader. Automated evidence checks and this code review do not close that gate.


## Follow-up: CLI, adapters and renderer

The review continued through `d7aeb4d`, covering the extracted validator, CLI, Decision records, DuckDB adapter, retained sessions, synthetic Golden Questions and new Markdown/chart renderer. Collaborator fixes were independently checked: 44, 53, 60, 63, 67 and then 71 passing tests as the implementation grew. The adapter corrections seal every connection path, isolate failed opens, serialize calls and close, preserve CSV NULL versus empty strings, format pre-epoch timestamps correctly, and bound source materialization as well as query execution. Decision validation now treats other revisions as unverified and rejects self/cyclic supersession. Golden Questions no longer claim immature cohorts or causal certainty unsupported by their saved data.

### Renderer corrections

Six new regression tests failed against `d7aeb4d`. The root causes were context-dependent escaping, output writes interleaved with path checks, and separately implemented validation/status reporting. The fixes:

- **P1 — HTML injection:** Claim text surrounding tokens and text-valued table cells were emitted raw. Both now receive HTML escaping. Resolved values are inserted after Markdown parsing, so text cannot create links, images or markup.
- **P1 — evidence destruction:** a validated SQL file at `render/finding.html` was overwritten by rendering. Generated output now has a reserved directory, including protection for pinned definitions and case variants of the directory name.
- **P2 — partial and stale exports:** an unsafe later SVG destination was discovered only after overwriting HTML. All destinations are now checked and staged first; recoverable replacement errors roll back. Successful renders remove obsolete chart files and PNG previews that otherwise could retain formerly exportable data. Authored templates remain untouched.
- **P2 — validation divergence:** render now uses the same artifact/Decision checks as `check`, so a broken Decision binding cannot pass through rendering.
- **P2 — misleading provenance:** mismatched renderer/style pins force a visibly labelled draft preview; review bindings remain unchanged. The draft banner reports unavailable publication verification and saved-evidence validation without denying recorded reviews or claiming SQL was rerun.
- **P2 — chart range and resource lifetime:** decimal-to-number overflow is rejected instead of producing an invalid chart. Vega views and WASM rasterizers/images are released on completion or error. Charts have a light background so their fixed dark text remains readable in dark mode.

Nine added regression tests cover these boundaries. The full suite passes **80 tests**, including both exemplar renders and private export sentinels. This is a code and behavior review; it does not constitute a visual accessibility audit or the outstanding human Reader session. Output replacement assumes one writer; it does not promise atomic recovery after process termination or hostile concurrent filesystem mutation.
