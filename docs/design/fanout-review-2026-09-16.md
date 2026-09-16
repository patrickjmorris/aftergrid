# Fan-out review and fix record, 2026-09-16

Owner-requested parallel implementation of five beads by subagents (branches merged at 21e84ea), followed by an internal adversarial review (two lenses per bead, every finding sent to a refuter) and one fix round per bead in isolated worktrees with independent re-verification. CobaltSpring's bounded reviews remain separate.

- Raw findings: 78; refuted: 29; confirmed: 49.
- Fix branches: ag-evidence-negatives-422 7d1fe9e95 (fixed 6, declined 0, re-verified yes), ag-v0-spec-9an.1 2b694674a (fixed 11, declined 2, re-verified with one regression, fixed on main), ag-publication-binding-6r0 9862bfedc (fixed 5, declined 0, re-verified yes), ag-guardrail-hook-8jc 9234fd236 (fixed 11, declined 1, re-verified yes), ag-postgres-adapter-dna 819979709 (fixed 10, declined 0, re-verified yes)

## Confirmed findings and their resolution

### ag-evidence-negatives-422

| Severity | Finding | Location |
| --- | --- | --- |
| P2 | A duplicate row key or an undeclared null in any result file aborts the whole of validation, so the content digest is never checked in that run | `scripts/lib/validate-finding.mjs:275` |
| P2 | Decision-metric approval is self-asserted in the Finding's own manifest and `lifecycle` is never read, so "only an approved definition may carry a decision metric" is not enforced | `scripts/lib/validate-finding.mjs:252` |
| P3 | Claim-evidence errors are reported twice, the second time with an empty location | `scripts/lib/validate-finding.mjs:304` |
| P3 | A private-marker guard in the shared validator is a no-op with a fixture constant hardcoded into it | `scripts/lib/validate-finding.mjs:221` |
| P3 | Reference-resolution failures emit a second, duplicate error whose `location` is the empty string | `scripts/lib/validate-finding.mjs:304` |
| P3 | fixtures/negatives/README.md says `forged-attestation` reports `untrusted_attestation`; nothing reports it, and the test never checks that field | `fixtures/negatives/README.md:57` |

### ag-v0-spec-9an.1

| Severity | Finding | Location |
| --- | --- | --- |
| P1 | A Decision record file with no `id` key is silently dropped: invisible to `check`, erased from the generated index | `src/decisions.ts:46` |
| P2 | `decide` throws an uncaught ContractError after the record is written; the CLI prints a stack trace and never says what it recorded | `src/commands/decide.ts:273` |
| P2 | Errors from *other* records in the log are pushed after the write, flipping `evidence` to invalid and the exit code to 1 for a run that succeeded | `src/commands/decide.ts:284` |
| P2 | Timezone rule is not what the contract says: ICU is not the gate, valid IANA zones are rejected and fixed-offset zones are accepted | `src/commands/decide.ts:61` |
| P3 | `--dry-run` never checks for an id conflict, so it reports "would be created" for a write the real run refuses | `src/commands/decide.ts:241` |
| P3 | The concurrency test cannot exercise the index lock: the whole create-then-index sequence is synchronous in-process | `src/decide.test.ts:155` |
| P3 | "Concurrent append" test cannot interleave — the concurrency criterion is untested | `src/decide.test.ts:155` |
| P3 | CLI: a revisit schedule without --timezone always fails, but usage lists --timezone as optional and nothing tests decide's CLI | `src/cli.ts:107` |
| P3 | Report claims a malformed record was "excluded from the generated index" while the index includes it | `src/commands/decide.ts:276` |
| P3 | `evidence` is flipped to "invalid" by unrelated Decision-log errors, contradicting the contract | `src/commands/decide.ts:287` |
| P3 | Remedy names a `--instance` flag the CLI does not have; findingId/revision input is unreachable from the CLI | `src/commands/decide.ts:151` |

Declined by the fixer:
- Finding 11, refuted half: "findingId + findingRevision are documented as input but the CLI only ever passes findingDir, so the unresolved_reference remedy at decide.ts:156 can never be reached through the CLI" — The verifier refuted this half itself: docs/contracts/decide.md scopes its Input table to the programmatic API (`decide(opts)` returns a `Report`), and the CLI 
- Finding 1, consequence (b): `check` prints "2 Decision record(s) cite this Finding" while 3 record files exist on disk — Out of owned paths. The count comes from `dc.records`, incremented in validateDecisionsFor only for records that parsed into the index, and the info line is bui

### ag-publication-binding-6r0

| Severity | Finding | Location |
| --- | --- | --- |
| P1 | A Finding pull request can ship its own aftergrid.yaml inside the Finding directory and become the trusted publication policy — `check` reports `ready` | `src/publication/policy.ts:51` |
| P1 | A Finding directory can ship its own aftergrid.yaml and supply the allowlist that judges it; check then reports readiness=ready with an attacker-chosen repository, approver and automation login | `src/publication/policy.ts:51` |
| P3 | A later CHANGES_REQUESTED / DISMISSED whose submitted_at is unparsable is silently ignored, so a superseded approval still reads `ready` | `src/publication/readiness.ts:161` |
| P3 | `check` lets publication readiness `unknown` override `not_ready` when evidence is invalid | `src/commands/check.ts:59` |
| P3 | A malformed pointer written by the Finding is reported as `unknown` (unreadable API) rather than a defect, letting a Finding steer its own verdict away from not_ready | `src/publication/readiness.ts:126` |
| P3 | verifyGeneratedOutputs strips the entire Instance from its staged copy when the Finding is a direct child of the Instance root, then blames the Finding with `tampered_output` | `src/publication/outputs.ts:58` |
| P3 | Evidence errors do not force not_ready when readiness is unknown, contradicting the contract's own wiring rule | `src/commands/check.ts:59` |
| P3 | The GitHub client silently defaults commit_id and submitted_at to "" despite its own promise of malformed_response, which can drop an objection from the supersession check | `src/publication/github.ts:120` |

### ag-guardrail-hook-8jc

| Severity | Finding | Location |
| --- | --- | --- |
| P1 | A shell redirection operand is parsed as the Postgres database, turning any blocked write into an allowed "other target" | `hooks/claude-code/aftergrid-guard.mjs:175` |
| P1 | Only the first -c / -f is inspected, although psql and duckdb execute every one | `hooks/claude-code/aftergrid-guard.mjs:355` |
| P1 | An unexpanded shell variable as the psql target is classified "other", so the write is allowed | `hooks/claude-code/aftergrid-guard.mjs:279` |
| P1 | Only the first -c/--command is inspected: a second -c carrying DDL is allowed and reported as a clean read | `/Users/patrickmorris/Sites/aftergrid/hooks/claude-code/aftergrid-guard.mjs:218` |
| P1 | Command substitution mixed with literal SQL escapes the uninspected_sql block | `/Users/patrickmorris/Sites/aftergrid/hooks/claude-code/aftergrid-guard.mjs:368` |
| P2 | hook install/uninstall/status throw an uncaught TypeError on settings that parse but are shaped differently | `src/commands/hook.ts:48` |
| P2 | SQL partly built by a command substitution is stripped and the remainder reported as a clean read | `hooks/claude-code/aftergrid-guard.mjs:368` |
| P2 | evaluateProvisional has no caller in shipping code, so no sign-off ever blocks a read | `/Users/patrickmorris/Sites/aftergrid/src/hook/provisional.ts:54` |
| P2 | `hook install` reports success while writing nothing when settings.hooks is a JSON array | `/Users/patrickmorris/Sites/aftergrid/src/commands/hook.ts:68` |
| P3 | status reports "installed" for a guard entry under a matcher that never matches Bash, and install then adds nothing | `src/commands/hook.ts:52` |
| P3 | The audit log records the id the sign-off file claims for itself, never checked against the requested id | `src/hook/provisional.ts:116` |
| P3 | Structurally odd but JSON-valid settings crash the command instead of reporting invalid_artifact | `/Users/patrickmorris/Sites/aftergrid/src/commands/hook.ts:48` |
| P3 | Shell parameter expansion is reported as an inspected read, and is absent from the not-covered list | `/Users/patrickmorris/Sites/aftergrid/hooks/claude-code/aftergrid-guard.mjs:385` |
| P3 | Inline shell/python snippets wrap a supported entry point out of scope, and the doc frames the gap as script files only | `/Users/patrickmorris/Sites/aftergrid/hooks/claude-code/aftergrid-guard.mjs:241` |

Declined by the fixer:
- 8 [P2] evaluateProvisional has no caller in shipping code — the missing enforcement entry point itself (a `aftergrid hook provisional <id> --source <s>` subcommand, or an adapter-side gate that consults a record before a read and sets results[].provisional) — out of owned paths. Registering a new action requires editing src/cli.ts (argument parsing and dispatch at the `hook` branch, plus the HELP text) and, for the r

### ag-postgres-adapter-dna

| Severity | Finding | Location |
| --- | --- | --- |
| P2 | Denied-function denylist is bypassed by double-quoting, defeating the statement guard AND the admission cap | `src/adapters/postgres.ts:149` |
| P2 | pg Client has no 'error' listener: a dropped connection crashes the process and leaks the disposable Postgres | `src/adapters/postgres.ts:206` |
| P2 | privilege_probe reports can_write:false for a role that can write the source through a view | `src/adapters/postgres.ts:386` |
| P2 | capture records column types and names that openRetained can never restore; failure surfaces only at rerun with a wrong-noun error | `src/adapters/postgres.ts:616` |
| P2 | capture's `order by 1..n` fails outright on any column type with no ordering operator | `src/adapters/postgres.ts:467` |
| P2 | `check --mode rerun` always uses the DuckDB retained session, so the Postgres open_retained path is unreachable from the CLI | `src/commands/check.ts:17` |
| P2 | An unsupported column type is recorded green at capture and fails at rerun as a bare `sql_error`, not an actionable state | `src/adapters/postgres.ts:617` |
| P3 | memory_limit is silently dropped when it misses a narrow regex, yet is still recorded as an enforced admission limit | `src/adapters/postgres.ts:217` |
| P3 | The single_transaction consistency claim is never exercised: no test mutates the source during a multi-table capture | `src/adapters/postgres.test.ts:242` |
| P3 | `consistency: single_transaction` is stamped on every extract but only ever tested with a single-table capture | `src/adapters/postgres.test.ts:246` |

### ag-nightly-eval-0dv

Implemented in a worktree (merge 79268b2), reviewed with the same two lenses, fixed in a second worktree (merge af70e3d), re-verified independently against the reviewer's own repros, then two CI-only fixes (2f97c5d) and the re-verifier's new findings (this commit).

Confirmed and fixed:

- P1 A crashed or absent command analyzer was scored as a wrong Analysis: `new finding` writes a draft manifest before the analyzer runs, so "a manifest exists" was always true. Now exit code and a changed manifest are both required; otherwise `error` / `infrastructure` with a cause, zero assertions, no issue.
- P1 The workflow printed "model in the loop: exercised" on the presence of the secret, installed no `claude`, and pointed `/analyze` at a temp Instance with no plugin. Now `eval summary` gates the heading on run.json evidence, the command branch installs the CLI and passes `--plugin-dir`; the path stays recorded as unexercised until a real run happens.
- P2 A model id was recorded when no case ran; the scheduled run could never file issues (`inputs` is null on `schedule`); the CI golden step was a merge gate; `compare` classed pass→not_run as unchanged; the issue sink read one page of 100; redaction missed `--api-key=…`, vendor-prefixed flag names and keys with underscores.
- P3 Template recorded for the fixture analyzer; `budget_minutes` evaluated as bash arithmetic; `--sha ../x` escaped `--out` on plain `eval`; `compare` crashed on a record without assertions; baseline could be a cancelled or off-branch run; cost never parsed.
- Re-verification (all 12 held) found three more: the rendered argv and the analyzer's stderr tail reached case records unredacted; a grandchild of a timed-out analyzer survived. Fixed with shared redaction and process-group kill, each with a test that runs a real analyzer script.
- CI: the per-case timeout timer was unref'd, so a stalled analyzer with no handle drained the loop on macOS Node 22.18; `fonts/` was missing from the package `files` after renderer 0.2.0.

Not established: the headless `claude -p /analyze --plugin-dir …` invocation has never run; the first scheduled run with the secret is the test. The nightly issue label `aftergrid-eval` must exist before `report_issues` is useful.

### ag-3cp (record) and ag-olp (skills on the recorded path)

ADR 0010 work, same process: worktree implementation (80bf549; olp 8aa9195), adversarial review, fix round (62b4ee7), independent re-verification.

Confirmed and fixed on `record`:

- P1 `--sql` fell back to inline text when the path did not exist, so a typo overwrote the real query file with the path string, re-pinned every hash and the digest, and `check` reported evidence valid. Now a path-shaped argument to nothing is refused, and inline text without a SQL keyword is refused; nothing written.
- P1 The rendered Data fact keyed off `guarantees` and told the Reader "Retained inputs are kept" with a green mark on a Finding with no retained inputs. Now keyed off `snapshot.inputs`; the recorded state says no copy of the data was kept and the queries cannot be rerun here.
- P2 The pre-record manifest state `/checked-analysis` writes was schema-invalid, so the "declared but not recorded" warning was unreachable; a harness-recorded execution could still carry an adapter and retained inputs and render as adapter-verified; CSV integer cells were coerced by `Number()` (`7.0`, `1e3`, `0x10`) where the adapter route refuses.
- P3 Quoted empty CSV strings became NULL, CR stripped mid-field, all-empty trailing row dropped; re-recording a Check left the old evidence file outside the digest; `--executed-at` undocumented and unvalidated; info notes printed on refused runs; exit-code paragraph promised 2 where the code exits 1; the generated exemplar carried two contradictory header comments.

Skills (olp): steps 3 and 6 of `/checked-analysis` now open on the recorded path (harness runs the SQL, `aftergrid record` pins it, Checks are agent-reported with evidence, readiness never ready), the adapter path follows as the upgrade; `/analyze` no longer lists a missing adapter as a halt; three content tests pin the wording to the CLI's actual flags. Left for ag-ag-recorded-path-followups-q2l: setup still requires an adapter; write-finding and revise-finding still read coverage and re-runs from retained inputs.

### ag-3ce (probes) and ag-ag-recorded-path-followups-q2l (adapterless setup)

Same process, bounded reviews. Probes (ef73e4b, closing fixes 3e95ade): `at` and `kind` required on every probe, reframe needs `changed_plan`, out-of-order times warn; review found only Low items (duplicate if/then error, warning remedies not printed, migration rule unstated, a test aimed at the wrong step), all fixed.

Adapterless setup (e08b5fa, fixes 68809d6): `setup` defaults to `adapter: none`; capture refuses `recorded_path`; execute refuses only on a Finding with no retained inputs. Review found one High: every remedy told the Operator to rerun `setup --adapter …`, which never overwrites an existing aftergrid.yaml, so the upgrade route was a no-op that reported the connection step completed and pointed back at itself. Setup now prints the connection block when the file is kept and every remedy says to set `connection.adapter` in the file. Also fixed: unconditional "execute and rerun unavailable" wording (both run on retained inputs), the DuckDB-binding warning claiming no SQL runs on this route, rerun remedies naming a `capture` that refuses, source flags without `--adapter` silently dropped, the `new finding` coverage sentinel (1970-01-01) passing `check` as complete, and "approval" where `record` refuses any attestation. pack-smoke gained an adapterless step through the packed binary.

## Not covered by this record

- The human Reader session (a2f) and the manual real Finding (db2) are owner gates and were not touched.
- The real GitHub approval round trip and the live intake path are unverified (fakes only).
- Full finding texts and verifier reasoning: session scratch files `findings-<bead>.md`; per-agent transcripts in the session directory.
