# Spec: aftergrid v0 — one Finding end to end

Source: `docs/design/v0-design-2026-09-15.md` (decisions), `CONTEXT.md` (vocabulary), `docs/adr/0001–0008`, `docs/design/reconciliation-2026-09-15.md`. This spec synthesises those; where they disagree, the design doc wins.

## Problem Statement

A data-savvy Operator (a solo founder, or the one data person on a small product team) owes a Reader (a non-data decision maker) an answer to a recurring product question. Today the answer is a hand-built readout: numbers copied from queries into a doc, charts pasted in, no record of which definition or which state of the data produced them, and no way for the Reader to inspect a denominator or ask a follow-up without pinging the Operator. Our working hypothesis, from the published accounts of Ramp, Anthropic and Snap's internal systems and OpenAI's closed Data agent, is that none offers an open, portable, inspectable decision record; the positioning is tested, not assumed. Silent plausible-wrong numbers are the failure nobody catches.

## Solution

An open-source Engine (skills + Checks + adapters + a thin CLI) that a coding agent uses, inside the Operator's private Instance, to turn a raw ask into a **Finding**: a markdown memo with typed evidence, static charts, and Claims a Reader can understand, inspect and follow up on without SQL. Every displayed number resolves from a saved result; Checks, definition approval and method review are shown as separate facts; the Finding is reviewed as a pull request and rendered to a single reader-safe HTML file. v0 proves this on one real Spot Sports Question (the podcast/video success readout) and on a synthetic dataset with golden Questions in CI.

## User Stories

**Operator: setup**
1. As an Operator, I want to run one setup skill in my repo, so that the Instance layout (metric definitions, readers, findings, decision log, golden Questions) is scaffolded and the Engine knows where things live.
2. As an Operator, I want setup to detect that `mattpocock-skills` is installed and tell me the exact install line if it is not, so that `/grill-question` can rely on `grilling` and `writing-for-agents`.
3. As an Operator, I want setup to write a warehouse connection profile and refuse a connection whose role's probed privileges include write or DDL, so that the safety floor is set before any real-data query runs.
4. As an Operator, I want setup to install the guardrail hook into my agent harness, so that DDL, writes, unbounded scans and over-budget queries are blocked in code, not prose.

**Operator: asking**
5. As an Operator, I want to give the agent a raw ask in plain words, so that I am not required to already know the metric, population, window or falsifier.
6. As an Operator, I want `/grill-question` to interview me until the ask is a Question (decision, metric, population, window, falsifier, Reader), so that the Analysis has a pre-registered primary comparison before any cuts are explored.
7. As an Operator, I want `/grill-question` to challenge my words against the glossary and propose or update Metric definitions as `proposed`, so that vocabulary drift is caught at intake.
8. As an Operator, I want to file an Issue and label it `ready-for-agent`, so that the Analysis runs in the background and returns as a pull request I can review later.

**Operator: analysis**
9. As an Operator, I want `/analyze` to run the whole chain (checked analysis, writing, review) and stop with a clear reason when any gate fails, so that I never receive a half-done Finding presented as done.
10. As an Operator, I want `/checked-analysis` to write the Checks (invariants, reconciliation against canonical definition SQL, evidence integrity) before the analysis query, so that the result is trusted only for stated properties.
11. As an Operator, I want every Analysis to run against a Snapshot of retained inputs with recorded hashes, so that I can replay the artifact and rerun the SQL later and know which guarantee I have.
12. As an Operator, I want Diagnostic calculations to be allowed inside an Analysis with explicit status, so that exploration is not blocked on approving every intermediate count.
13. As an Operator, I want an Analysis that finds insufficient data or a question that needs reframing to produce a valid Finding saying so, so that "no answer" is a first-class outcome, not a failed run.

**Operator: the Finding**
14. As an Operator, I want `/write-finding` to produce the fixed sections (Answer, Decision, Evidence, How we checked, What would change our mind, Appendix), so that every Finding reads the same way to a Reader.
15. As an Operator, I want each Claim to carry its type (descriptive, associational, causal), comparison, population, window, exclusions and limitations, so that a correct correlation is never rendered as a cause.
16. As an Operator, I want every data-bearing value in prose, tables and charts to resolve through a supported evidence reference, including typed external sources for targets and assumptions, so that no unresolved value reaches a Reader.
17. As an Operator, I want charts specified as Vega-Lite in a validated subset bound to saved results, so that the chart cannot compute a number the evidence does not contain.
18. As an Operator, I want `/iterate-visual` to render each chart, look at it, score it against the *Storytelling with Data* rubric and revise up to three times, and hand a still-failing chart back to me, so that charts are readable without my taste being the bottleneck.
19. As an Operator, I want `/shape-narrative` to enforce answer-first ordering and one Claim per Evidence subsection with the chart title stating the Claim, so that a Reader gets the point without reading the whole memo.
20. As an Operator, I want `/analysis-review` to run Method, Question and Reader reviewers in parallel and block on their findings, so that stats hygiene, "did we answer the ask" and Reader fit are judged independently.
21. As an Operator, I want the Reader reviewer to adopt a named profile from my Instance, so that the review judges the memo against the person who will actually read it.
22. As an Operator, I want `/revise-finding` to take my feedback ("make it horizontal", "lead with retention"), re-render, re-run Checks, and tell me when a request would change a number or an interpretation and therefore reopens analysis or review, so that presentation edits are cheap and meaning edits are never silent.
23. As an Operator, I want to pick among Variants of a chart when I am in the loop, so that taste decisions are mine without blocking background runs.
24. As an Operator, I want `aftergrid check` to fail my pull request when a reference does not resolve, a Check fails, a section is missing, a published decision metric cites a definition that is not approved at a pinned version, or an attestation does not bind to the current content digest, so that the merge gate is mechanical. Diagnostic calculations and proposed definitions are allowed inside the Analysis with their status shown.
25. As an Operator, I want `aftergrid render` to produce one self-contained HTML that embeds only the reader-safe payload and shows Checks passed, definitions approved, method reviewed, limitations, Snapshot guarantees, generated-at, version, owner and superseded-by, so that the Reader sees trust as separate facts, not a badge.

**Operator: governance**
26. As an Operator, I want to approve a Metric definition by recording approver and reviewed revision, so that an editable frontmatter field alone never counts as approval.
27. As an Operator, I want to write a Decision record (owner, action or deliberate inaction, rationale, date, revisit condition, outcome) that cites a Finding, so that merging a Finding is never mistaken for making a decision.
28. As an Operator, I want a Reader's flag to reach me with Finding and Claim ids and no values, so that I can triage it into an Issue without leaking data through a URL.

**Reader**
29. As a Reader, I want the Answer in the first sentence and the decision it informs right after, so that I can act without reading further if I trust the process.
30. As a Reader, I want to expand any Claim to see who is counted, compared with what, over which period, and what was excluded, so that I understand the denominator before I repeat the number.
31. As a Reader, I want to see the calculation and evidence behind a sentence, so that I can inspect a number without SQL.
32. As a Reader, I want to see whether a Claim is descriptive, associational or causal, and the caveat that would change the conclusion, next to the Answer, so that I do not over-read a correlation.
33. As a Reader, I want a single "question or flag this" action on the Finding, so that I can follow up without a GitHub account.
34. As a Reader, I want to see when the Finding was generated, what data it covers, and whether a newer Finding supersedes it, so that I do not act on stale evidence.

**Background agent**
35. As a background agent, I want to pick up an Issue labelled `ready-for-agent`, run the Analysis, and open a pull request that links the Issue and contains the full Finding directory, so that the Operator's review is the only human step when no definition approval or provisional-access sign-off is missing; when either is missing, I pause with a needs-input result on the Issue instead of guessing.
36. As a background agent, I want the guardrail hook and adapter guards to stop me from writing, running DDL, exceeding the cost budget or reading unbounded tables, so that a mistake cannot cause harm.
37. As a background agent, I want a provisional read of a non-sensitive unverified source to require recorded human sign-off, be logged with a reason code, and never have its results rendered, so that exploration is possible without routing around hard permissions.

**Revisit (stories 38–39 are v0 schema; 40–42 are v0.1 runtime, listed for shape only)**
38. As an Operator, I want every Claim to declare a Recheck policy (the proposition it asserts, its comparison method, evidence, minimum data and window policy, or an explicit not-automatically-evaluable reason) and every Question a machine-checkable falsifier, so that a merged Finding can later be re-tested without re-commissioning the analysis.
39. As an Operator, I want a Decision record to name the Claims it rests on and carry a structured revisit condition (schedule, falsifier reference, or both), so that "when should we look at this again" is data, not a promise.
40. (v0.1) As an Operator, I want `aftergrid revisit` to refresh the Snapshot as new retained inputs, rerun the saved SQL under the declared window policy, evaluate each Recheck policy and the falsifier, and open a new revision reporting each Claim as holds, contradicted, insufficient data or not comparable, so that a refresh is a review, not a week-long project.
41. (v0.1) As a Reader, I want the Decision log rendered as a board showing, for each decision, the Recheck results of the Claims it rests on, so that I know what to revisit without asking.
42. (v0.1) As an Operator, I want a contradicted falsifier to produce a reviewed Finding rather than a failed run, and thin data to report insufficient data rather than a flip, so that results are results and noise never masquerades as a changed decision.

**Maintainer and contributor**
43. As a maintainer, I want golden Questions on a synthetic dataset to run nightly and assert answer within tolerance, definition id used, tables read, and expected abstention, so that a model or skill change that breaks reasoning is caught.
44. As a maintainer, I want failure fixtures (duplicate joins, zero denominators, mix shift, late events, missing instrumentation, bad references, insufficient data) in the dataset, so that evals reward refusing an unsupported conclusion.
45. As a maintainer, I want the Finding-directory seam to run on every pull request against fixture directories, so that linter, evidence model, Checks, template and render are tested without a model in the loop.
46. As a contributor, I want an adapter contract test suite that runs the same behaviours on DuckDB and Postgres, so that I can add a backend by making the suite pass.
47. As a maintainer, I want a capability matrix per backend (snapshot, catalog, guards, SQL dialect), so that coverage is never claimed for an untested backend such as PostHog managed warehouse.
48. As a maintainer, I want the Engine installable as a Claude Code plugin and via skills.sh, with `openai.yaml` beside each skill, so that Codex users get the same skills.

## Implementation Decisions

**Repository shape.** The Engine mirrors mattpocock-skills: skill buckets (promoted, misc, in-progress, deprecated), user- vs model-invoked split recorded in each skill's frontmatter and its `openai.yaml`, a `CLAUDE.md` rule set, `.out-of-scope/`, a docs page per promoted skill, a plugin manifest listing promoted skills explicitly. `CONTEXT.md` and `docs/adr/` are the glossary and decision record. Nouns (tables, metrics, readers) never live in the Engine.

**Skills, v0.** User-invoked: `/setup-aftergrid`, `/grill-question`, `/analyze`, `/revise-finding`. Model-invoked: `/checked-analysis`, `/write-finding`, `/iterate-visual`, `/shape-narrative`, `/analysis-review`. Every skill is written under the `writing-for-agents` discipline: steps end on checkable completion criteria; reference (rubrics, section template, glossary pointer) is disclosed behind pointers; Reader-facing copy uses plain words. `/analyze` invokes the model-invoked chain and is the only skill that declares the whole gate order. `/grill-question` runs the `grilling` primitive from mattpocock-skills and the `domain-modeling` discipline to update the Instance glossary and propose definitions. `/ask-aftergrid` (router), `/probe`, `/to-analysis-plan`, `/triage-requests`, `/diagnosing-metric-change`, `/audit-data`, `/metric-modeling`, `/measurement-design` are scaffolded in the in-progress bucket only if they cost nothing; otherwise deferred to v0.1.

**Dependency on mattpocock-skills.** Hard dependency for the model-invoked `grilling` and `writing-for-agents`; setup verifies presence. `handoff`, `research`, `to-questionnaire` recommended as install-alongside; aftergrid never invokes them.

**Instance layout** (scaffolded by setup, inside the Operator's repo): a metric-definitions collection (one markdown file per definition with frontmatter: id, version, kind approved-or-diagnostic, status proposed/approved/deprecated, grain, population, denominator, window, owner, approver, reviewed revision; body: plain-language meaning; canonical SQL per dialect), a readers file of named profiles, a findings collection (one directory per Finding), a decision log, a golden-Questions collection, and a connection profile.

**Finding directory.** Contains the memo, the manifest, saved query results, query files, Check files, chart specs and rendered chart images. The manifest carries `schema_version`, Finding id and revision, the Reader, the Question (decision, metric, population, window, falsifier), the Snapshot (retained input ids and content hashes, guarantees held: replay and/or rerun), executions (each binding SQL content hash, parameters including analytical timezone, input ids and hashes, definition ids with versions and content hashes, result id and hash), result sets (id, row-key column, column types and units), Claims (id, type, evidence references, population, baseline, window, exclusions, limitations, Recheck policy), the Question's falsifier as a Check reference with expected outcome, a content digest over memo, charts, queries, results and policies, approval and review attestations bound to that digest (source, reviewer, date), owner contact, export policy (allowed fields, recipient scope), coverage, generated-at, supersession, derived values (declared operation, referenced operands, units, zero-denominator and null behaviour), typed external sources (targets, assumptions), Checks run with outcomes, and review records (reviewer, date, content revision). Ids use a restricted character set so reference separators are unambiguous.

**Evidence references.** Memo prose and table cells insert values with a reference token naming result-set id, row key and column. The renderer resolves every token from the pinned manifest; resolution is by row key, never index; missing or duplicate keys and missing columns are errors. Precision is preserved; null and not-available are distinct from zero; rounding and percentage formatting are defined once and applied only at display. Dates, section numbers and labels have explicit non-evidence handling. A data-bearing numeral that is not a reference fails `check`.

**Charts.** One Vega-Lite spec per chart, validated against an allowlist that covers nested and layered specs and encoding-level behaviour: no `transform`, no aggregate, bin, timeUnit or stack-normalise encodings, no inline replacement data, no URLs. Data is bound by the renderer from saved result sets. A shared house-style config (grey plus one accent, direct labels, title states the Claim, colorblind-safe palette) is applied at render. Output is SVG (PNG for the agent's own viewing during iteration).

**Snapshot.** Retained inputs: for DuckDB, an immutable copy of the fixture or extract; for Postgres, bounded extracts of the declared dependency tables captured inside one `REPEATABLE READ` transaction, stored in the Instance with content hashes. Rerun on Postgres restores the extracts into a disposable compatible Postgres with recorded schema and runtime requirements and executes the original SQL there; a rerun never falls back silently to the live source. Restore is controlled provisioning, distinct from agent-issued analysis SQL. Fingerprints of live tables are recorded only as a drift signal. Refresh is an operation that produces a new Finding revision with a change explanation.

**CLI.** TypeScript, distributed on npm, two commands in v0. `check` takes a Finding directory and runs, in order: manifest schema validation, reference resolution, template and narrative structure lint (sections present, one Claim per Evidence subsection, chart or table present for numeric Claims, Claim type present), Check execution through the adapter against the Snapshot, definition status verification (approved for any published decision metric, version pinned), and exits non-zero with a machine-readable report on first category of failure. `check` also verifies that every required Check result, definition approval and review attestation binds to the current content digest; any artifact mutated after attestation invalidates it. `render` for publication takes a Finding directory whose attestations are bound and current and produces chart images and one self-contained HTML containing only the reader-safe payload (the export policy's allowed fields; hidden tables, chart payloads and metadata included in the projection) with the trust facts, provenance footer, coverage and generated-at, a canonical location for newer revisions, expandable Claim evidence and the single Reader action (a mailto to the manifest's owner contact, prefilled with Finding and Claim ids only). A draft preview renders without attestations, is labelled draft, cannot claim reviewed status, and still applies the reader-safe projection. Users of the CLI write SQL, markdown, YAML and JSON only.

**Adapters.** An adapter contract with: execute (SQL, parameters) returning typed rows with column metadata (business units come from evidence and metric metadata, `unknown` allowed); capture (dependency list) returning retained inputs plus hashes; open-retained (restore retained inputs for rerun); privilege probe (does the connected role hold write or DDL rights); non-executing cost estimate in backend units with `unknown` allowed (Postgres `EXPLAIN` without `ANALYZE`); resource limits (statement timeout, memory) applied per execution; a statement guard that rejects DDL, DML, and scans that have neither a row limit nor an estimate under the configured cap; catalog read (tables, columns) for probing. DuckDB and Postgres implement it in v0. A capability matrix records per backend which capabilities are supported; an unsupported required capability fails or takes an explicit safe fallback and never reports zero cost or green. PostHog managed warehouse is listed as unvalidated.

**Safety.** Source permissions and adapter limits are in place before any real-data execution, and the harness hook before any unattended intake. A Claude Code PreToolUse hook blocks shell or SQL invocations that write, run DDL or exceed budget; adapter guards enforce the same floor for any harness; warehouse roles are read-only; PII masking is a connection-profile option applied by the adapter. Hard permissions, privacy boundaries and execution limits have no bridge. Provisional reads of non-sensitive unverified sources require human sign-off, are logged with a reason code, and their results are never rendered.

**Intake.** GitHub Issues with the five canonical triage labels. `ready-for-agent` triggers a background run; the Finding returns as a pull request linking the Issue. Reader flags arrive to the Operator by email with ids and are filed as Issues by the Operator.

**Review and approval.** `/analysis-review` dispatches Method, Question and Reader reviewers as parallel subagents; each returns blocking and non-blocking findings; `/analyze` halts on any blocking finding. Approval of a Finding revision, and approval of a Metric definition, are attestations (source, approver, date) bound to a content digest; a frontmatter status is display only. Metric kind is `metric | diagnostic`; lifecycle is `proposed | approved | deprecated`; the two are separate axes.

**Decisions.** Decision records are written by the decision owner through `/revise-finding` in v0 and appended to the decision log; merge of a Finding never creates one. Each carries a structured revisit condition: a schedule, a reference to the Question's falsifier, or both.

**Revisit (ADR 0009, amended).** v0 ships the schema only, validated by `check` for shape and references: a tagged Recheck policy per Claim (predicate + threshold/direction, comparison method or versioned method reference, evidence references, tolerance units and baseline where applicable, minimum-data and coverage, window policy fixed-window restatement vs advancing-window comparison; or not-automatically-evaluable with a reason), the Question's falsifier as a Check reference with expected outcome, and on each Decision record the Claim ids it rests on and a revisit condition. v0.1 ships `aftergrid revisit`: refresh as a new retained input set, rerun every execution under the window policy, evaluate each Recheck policy and the falsifier, and write a new Finding revision reporting per Claim holds / contradicted / insufficient data / not comparable, distinct from engine Check failures. Associational and causal Claims whose assumptions or method no longer apply report not comparable, method review required. The Engine never infers that a decision holds; the decision owner judges. A Revisit is reviewed like any Finding and never closes or changes a Decision record by itself.

**Synthetic dataset.** A deterministic generator in the Engine produces PostHog-shaped users, events and subscriptions with planted effects (a churn spike, a broken funnel step, a mix shift) and the failure fixtures listed in the user stories, as a DuckDB file. Three to five golden Questions with expected answers or expected abstention and tolerances ship with it.

**Distribution.** Claude Code plugin manifest listing the promoted skills; skills.sh compatible layout; `openai.yaml` per skill; npm package for the CLI. MIT with Matt Pocock's notice retained where his wording is adapted.

## Testing Decisions

Tests assert external behaviour at two seams and never implementation details.

**Seam 1, Finding directory (primary, on every pull request).** Input: a fixture Finding directory. Output: `check` exit code and report; `render` artifacts. The first two fixtures are hand-written before any skill exists: a tiny numeric Finding and a tiny nonnumeric Finding; `/write-finding` is later written to produce what they contain. Fixtures cover: a valid numeric Finding; an inconclusive Finding with no numeric Claim; an unresolved reference; a duplicate row key; a hand-typed data-bearing numeral in prose; a chart spec using a forbidden transform or encoding, including nested and layered specs; a missing section; a Claim without a type or Recheck policy; a published decision metric citing a proposed definition; a definition referenced without a version; a Check that fails reconciliation; a Snapshot hash mismatch; a stale attestation whose digest no longer matches; a forged attestation with no trusted source; an artifact modified after attestation; a private-field sentinel that must be absent from rendered HTML and SVG, including metadata and embedded payloads, not just visible text; a draft preview that must carry the draft label and the reader-safe projection; a render whose Reader action carries ids and no values. Good tests here run the CLI as a black box and compare exit code, report categories, and rendered HTML content.

**Seam 2, adapter contract (on every pull request).** One suite, parameterised over DuckDB and Postgres (Postgres via a disposable container), covering execute with typed columns, capture with consistent multi-table extracts and stable hashes, open-retained followed by a rerun that must reproduce the original result after the live source has been mutated post-capture, privilege probe, non-executing cost estimate with `unknown`, resource limits, statement guard rejecting DDL, DML and unlimited-and-unestimated scans, and catalog read. A new adapter is accepted when the suite passes; the capability matrix is generated from which suite sections pass.

**Acceptance evidence for stories the seams cannot observe.** Interviews (5–7), craft and reviewer behaviour (18–23), setup and hook installation (1–4), Issue-to-PR orchestration (8, 35) and package installation (48) stay v0 stories; each names its evidence: a setup or install smoke test, a workflow boundary test with fake Issue and harness interfaces feeding a real fixture Finding, a nightly model eval, or the Reader exercise. Reader comprehension (29–34) is evidenced by the milestone's Reader smoke test.

**Skill-level evals (nightly, model in loop).** Golden Questions on the synthetic dataset run `/analyze` end to end and assert answer within tolerance, definition id used, tables read, and expected abstention on the failure fixtures. Results are stored with skill version, git SHA and model id. Not a merge gate.

**Prior art.** None in this repo. Structure follows mattpocock-skills' `tdd` discipline (behaviour at the seam, red before green) and Ramp's context-layer evals (assert intermediate facts, not full traces).

## Out of Scope

- Any chat or Slack surface for Readers; Slack, Notion, PDF delivery; cron and metric-alert triggers.
- HogQL, Snowflake, BigQuery adapters beyond an empty in-progress scaffold; any coverage claim for PostHog managed warehouse.
- Interactive charts, decks, notebooks, dashboards as canonical artifacts; `/present`.
- Automatic correction harvesting from chat; self-improving skills.
- The `revisit` command itself (v0.1); v0 only validates its schema fields.
- The formative usability study (gates external release, not v0).
- Revocation of shared HTML files.
- Codex-native plugin packaging; Codex safety parity claims until export and query paths are tested.
- Multi-context Instances (CONTEXT-MAP).
- Spot Sports schema, metrics, ids or credentials anywhere in the Engine.

## Further Notes

- v0 milestone gate: golden Questions green; first Spot Sports Finding (podcast/video readout) passes the Reader reviewer under a "non-technical product owner" profile; one outside person explains the Answer in their own words, names the denominator and a limitation, and picks an action.
- Independent review (`docs/design/independent-review-2026-09-15.md`) accepted this scope with acceptance criteria now folded in: three visual passes is a maximum, Variants share pinned evidence, visual score is advisory. Its finding 7 (cut scope to one path) was rejected by the owner and is recorded as a delivery risk to revisit after the first real Finding.
- Build order for ticketing is the six vertical slices recorded on epic `ag-v0-spec-9an`, each ending in a passing seam test: (1) one retained DuckDB answer to inspected HTML; (2) reject invalid evidence and unsafe publication; (3) author and revise the same artifact, then orchestrate; (4) onboard and run on Postgres; (5) run asynchronously; (6) distribution and milestone evidence. Instance layout, Reader-profile format, Question/Claim/Decision-record shapes and approval/export metadata precede `/write-finding`; one golden eval is seeded in slice 1 and grown thereafter.
