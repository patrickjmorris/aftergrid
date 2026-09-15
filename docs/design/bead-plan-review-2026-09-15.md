# Bead plan review — 2026-09-15

Reviewer: CobaltSpring. Requested by Patrick before implementation.

## Result

Reviewed and revised all **23 existing beads**, including the epic and deferred Revisit command. Added two tasks by separating requirements already in the plan: deterministic decision recording and external-release validation. There are now **25 beads: the epic, 22 v0 child tasks, and two follow-ons**.

The chosen scope remains: the full craft skill set, three-pass visual iteration, Variant selection, DuckDB and Postgres, GitHub intake, typed evidence, verified publication, synthetic reference Questions and the private real-data pilot. No implementation was performed, no task was marked complete, and no public activation was performed.

The plan is ready to start with **`ag-finding-exemplars-a2f`**. Its human review requirement must be completed by a real person; an agent can prepare the artifacts but cannot simulate that acceptance evidence.

## Why change the plan?

The previous graph could finish the milestone without publication binding or asynchronous intake. It could start chart iteration without a renderer and finish setup without its hook. Several important user outcomes appeared only in descriptions, without observable acceptance criteria. New CLI decisions were recorded in beads while the spec still described an older interface.

The revision fixes those execution gaps and strengthens the Reader experience: the Answer and material caveat appear together; denominator, baseline, population and window are inspectable; an inconclusive result is valid; a follow-up works without GitHub or a configured mail client; phone reading and keyboard access are part of acceptance.

This is a better specified plan, not proof of product demand. The early human studies deliberately remain capable of showing that the proposed experience needs revision.

## Build order

1. **Prove the proposed Finding experience.** Reviewed synthetic exemplars, canonical schema, profile format, reference grammar and static HTML reference.
2. **Make the evidence path work.** CLI drafts/checks, retained DuckDB execution, renderer, Recheck schema and deterministic synthetic cases. Renderer and reference-data work can proceed independently after their shared prerequisites.
3. **Try it manually on a real question.** Evidence-valid private readout and genuine Reader feedback before writer or question/analysis skills. Resolve contract gaps rather than automate them.
4. **Automate the tested workflow.** Writer and question/analysis procedures can develop independently. Visual revision uses the real renderer and publication binding; orchestration consumes these contracts once.
5. **Complete the operational paths.** Postgres capture/rerun and hook work can proceed after DuckDB. Setup integrates those paths and approval preflight. Intake depends on setup and orchestration. Decision recording is a separate deterministic command.
6. **Verify the whole internal v0.** Automated private readout, nightly and candidate-revision evaluation, complete package/install smoke and Reader evidence. Every retained v0 child is a blocking prerequisite of this milestone, directly or transitively.

External-release validation and v0.1 Revisit depend on the internal milestone. Neither blocks internal v0 completion, and neither is silently activated by it.

## Per-bead disposition

| Bead | Revision and user benefit |
| --- | --- |
| `ag-v0-spec-9an` | Rewrote the epic around the complete user workflow, explicit verification and separate release gates. Preserved chosen scope. |
| `ag-finding-exemplars-a2f` | Made numeric and inconclusive experiences, real Reader feedback, baseline understanding and accessible/mobile reference behavior explicit. Conditional schema cases no longer have to be artificially squeezed into one example. |
| `ag-skeleton-fixtures-6yk` | Distinguished an incomplete draft from a valid finished Finding. Added no-overwrite creation, useful error locations and truthful artifact-verification versus SQL-rerun reporting. |
| `ag-duckdb-execute-check-ypl` | Required real execution and capability evidence, stable typed results, cancellation/cleanup and read-only local data behavior. Unsupported role probing no longer implies a false failure or false assurance. |
| `ag-render-html-pjn` | Added phone and keyboard acceptance, descriptions and tables, consistent values across prose/charts, a visible contact fallback, nonnumeric outcomes and truthful draft/freshness copy. |
| `ag-revisit-schema-rb8` | Added concrete positive and negative policy/reference cases. It now depends on the CLI needed to run its validation acceptance, without implementing the deferred evaluator. |
| `ag-synthetic-golden-nightly-5vm` | Distinguished malformed evidence from semantic situations requiring review or abstention. Reference answers include independently inspectable reasoning and input/window constraints. |
| `ag-evidence-negatives-422` | Concentrated on evidence integrity; removed the unrelated decision-append implementation. Added useful failure categories and honest limits of mechanical lint. |
| `ag-manual-real-finding-db2` | Made the real Reader pilot a dependency of first skill work. Required a contrasting/inconclusive scenario, private handling of feedback and a truthful supervised draft path. |
| `ag-publication-binding-6r0` | Added the actual solo-author/approver workflow, trusted allowlist boundary, dismissed-review behavior, same-content checks and regeneration of tampered cached outputs. |
| `ag-write-finding-narrative-kpc` | Anchored writing in the manual pilot and shared Analysis inputs. Added named/generic profiles, nonnumeric outcomes and safeguards against inventing evidence to satisfy a template. |
| `ag-grill-checked-analysis-7qg` | Reduced unnecessary questioning, distinguished probing from final cuts, and reused internal clarification rather than calling another user-invoked skill. Missing information has an honest state. |
| `ag-iterate-visual-revise-kn3` | Added dependencies on working rendering/publication contracts, early-success and pass-limit cases, an actual Variant choice, conservative review invalidation and preserved old revisions. |
| `ag-review-analyze-golden-4ka` | Gave one orchestrator ownership of ordering, with resumable input/review failures. Agent review can finish a draft but cannot substitute for human publication approval. |
| `ag-guardrail-hook-8jc` | Reused tested adapter policy; distinguished protected source writes from legitimate local artifact creation. Added scoped/expiring approval evidence and provisional status through derived results. |
| `ag-postgres-adapter-dna` | Added explicit unavailable-runtime behavior, replay without Postgres, honest memory-capability reporting, cancellation and scoped restore behavior. |
| `ag-setup-aftergrid-78k` | Made setup depend on what it installs. Added preservation of existing work, credential references, resumability and publication identity preflight; incomplete external capabilities do not destroy local draft usefulness. |
| `ag-background-intake-ka3` | Added request/run identity, concurrent duplicate triggers, restart, edited requests, needs-input resume and enforcement preflight. Users get one comprehensible request-to-PR lifecycle. |
| `ag-first-real-finding-rdo` | Required genuine readiness and owner decision, controlled comparison with the manual readout, and an explanation of legitimate changes rather than forced answer agreement. |
| `ag-nightly-eval-0dv` | Distinguished analytical regressions from infrastructure failures, bounded runs, reduced duplicate reporting and added evaluation of the exact candidate revision. |
| `ag-distribution-dq4` | Made package acceptance cover setup, hook, decisions and intake. Local package verification no longer silently means publishing externally. |
| `ag-v0-milestone-91e` | Closed the full dependency chain and removed public visibility changes from internal completion. A scheduled study is not a passed release gate. |
| `ag-revisit-command-ogy` | Preserved v0.1 scope, but tied it to completed shared contracts. Added counterexamples to tolerance-only reasoning, non-comparable states and owner judgment. |
| **New: `ag-v0-spec-9an.1`** | Separated `aftergrid decide` from evidence validation. Tests explicit owner input, exact evidence references, retry/concurrent append and correction history. |
| **New: `ag-external-release-readiness-4zn`** | Tracks the already-agreed formative study and outside Operator use after internal v0. Preparing a release does not authorize public activation. |

## User-story coverage

The numbers below refer to the 48 stories in [the synchronized spec](../spec/v0-one-finding-end-to-end.md). Tests at the Finding and adapter boundaries do not replace workflow tests, model evaluations or human observations.

| Stories | Primary ownership and acceptance evidence |
| --- | --- |
| 1–4 | Setup, hook and both adapters; fresh/repeated installation, credential/capability handling and exercised enforcement. |
| 5–7 | Clarification/checked-analysis plus orchestration; recorded raw/clarified/needs-input paths and preserved assumptions. |
| 8 | Intake; Issue-to-PR workflow with repeat/concurrent dispatch and resume. |
| 9–13 | Orchestration, checked-analysis, adapters and evidence rules; actual execution, insufficient-data outcomes and blocked-gate behavior. |
| 14–17 | Exemplars, writer, evidence rules and renderer; schema/value correctness plus narrative/method review. |
| 18–23 | Visual revision, writer/narrative and analysis review; recorded bounded loops, profile selection, Variant choice and invalidation. |
| 24–26 | Evidence rules and publication binding; exact-content validity, independent approval and truthful draft/readiness. |
| 27–28 | Dedicated decide command, renderer contact path and intake; explicit owner decision and ids-only follow-up. |
| 29–34 | Exemplars, renderer, manual pilot and automated real readout; phone/keyboard interaction, comprehension, limitations and follow-up. |
| 35–37 | Intake, setup, hook and adapter contracts; needs-input, enforced dispatch and provisional-source propagation. |
| 38–39 | Recheck schema and decide; declared policies and exact Claim/Decision references. |
| 40–42 | Deferred Revisit command; no v0 evaluator/board masquerading as schema validation. |
| 43–44 | Synthetic reference data and separate nightly evaluation; versioned answers/abstention and actionable regressions. |
| 45–47 | Finding seam, both adapter suites and internal milestone; all declared capabilities supported by evidence. |
| 48 | Complete distribution/install smoke; actual promoted skills and commands rather than an incomplete package scaffold. |

## Important contract refinements

### Completion is not one boolean

An incomplete draft, valid inconclusive Finding, failed execution, unavailable historical rerun, unknown external approval and ready publication are different states. Commands and reports must tell the Operator what happened and what to do next. `check` can verify a saved artifact without claiming SQL has just rerun. Human studies must not be satisfied by a simulated Reader or an invented favorable result.

### Approval must work in the solo pilot

GitHub does not allow a PR author to approve their own PR. The chosen v0 authority therefore needs a distinct automation author and a human reviewer, plus tested credential separation and a trusted allowlist. The publication and setup beads now include that round trip and report unavailable publication if it cannot be established. [GitHub review documentation](https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/approving-a-pull-request-with-required-reviews).

### Backend limits need accurate names

LIMIT does not bound source work. Postgres planner estimates are not monetary prices, and `work_mem` is not a total query memory ceiling. The adapter records what the selected runtime actually enforces and uses explicit unsupported/unknown states. [Postgres EXPLAIN](https://www.postgresql.org/docs/current/sql-explain.html), [Postgres resource configuration](https://www.postgresql.org/docs/16/runtime-config-resource.html).

### Publishing source is separate from proving product readiness

Internal v0 remains attainable with its agreed smoke evidence. The formative study and outside-team adoption evidence are follow-on release work. Public source publication, npm publishing and user-facing release must each be explicit owner actions; they are not performed by checking off internal milestone evidence.

## Verification of this planning pass

- All 23 original ids preserved; original task statuses unchanged.
- Two new tasks have concrete descriptions and acceptance criteria.
- Every bead has acceptance criteria.
- All 22 v0 child tasks are in the internal milestone's blocking prerequisite closure, including the milestone itself.
- The external-release and v0.1 tasks are outside that closure.
- Dependency cycle check is clean.
- The sole currently executable frontier is the exemplar/Reader-review bead.
- Spec, design and glossary are synchronized with the commands, draft/readiness states, invocation model and release boundaries.
- No implementation tests were claimed; verification here is schema/document consistency and task-graph inspection.
