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
