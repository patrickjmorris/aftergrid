# aftergrid — design review packet (2026-09-15)

**Purpose:** independent review of a settled design before any implementation. No code exists. Everything below is the full state of the repo `patrickjmorris/aftergrid` (private) as of commit `92d2539`.

## Review brief

Challenge the design, not the prose. Specifically:

1. **Positioning.** "The Finding is the product" (ADR 0001). Is there a gap here that Ramp/Anthropic/Snap/OpenAI leave open, or is it wishful? What would make an outside team adopt this over a Slack bot?
2. **Provenance.** "Every number traced, enforced by a Check" (ADR 0004). Is it enforceable with a linter on markdown? Where does it break (derived numbers, percentages in prose, chart annotations)?
3. **Format.** Markdown + static Vega-Lite (ADR 0003). Is static SVG enough for non-data Readers, or does interactivity matter more than diffability?
4. **Stack.** TypeScript CLI for a data audience (ADR 0005). Will data people contribute adapters in TS?
5. **Scope.** v0 = 10 skills + CLI + 2 adapters + synthetic dataset + hook. Too big for a solo builder? What would you cut first?
6. **Success test.** Solo Instance; Operator = Reader. Is the proposed test meaningful?
7. **Vocabulary.** Any term in CONTEXT.md that is ambiguous, redundant, or will collide with common usage?
8. **Missing branches.** Decisions the design tree never visited.

Return: ranked findings, each with the decision it challenges, why, and a concrete alternative. Flag anything you'd block on vs. merely note.

---

# 1. Settled design


## Positioning
- **Finding-first.** The product is the Finding a non-data Reader trusts; skills, Checks, adapters and the Instance serve it. (ADR 0001)
- **Personas:** Operator (data-savvy, installs/maintains/reviews, works in Claude Code or Codex) and Reader (consumes Findings, never reads SQL).
- **Success test for v0** (Spot Sports is solo, so Operator = Reader): (1) golden Questions green in CI; (2) the first Finding passes the Reader subagent under a "non-technical product owner" profile; (3) one outside person reads the rendered HTML and states the decision correctly without asking a question.

## The Finding
- Canonical: `memo.md` + one Vega-Lite `.vl.json` per chart, rendered to SVG/PNG, plus queries and Checks, reviewed as a PR in the Instance. (ADR 0003)
- Fixed sections, linter-enforced: Answer (one sentence) → Decision it informs → Evidence → How we checked (Checks, Snapshot) → What would change our mind → Appendix (queries).
- Narrative: answer-first. Each Evidence subsection is one Claim: a sentence heading, ≥1 chart or table, chart title states the Claim. Linter enforces structure; a narrative reviewer subagent judges coherence and Reader-level language.
- Visual iteration: autonomous in background runs (render → view PNG → score against rubric → revise, max 3 passes); Operator picks among Variants when in the loop via `/revise-finding`.
- Visual rubric seeded from *Storytelling with Data* (Knaflic): declutter, one message per chart, title = the Claim, direct labels over legends, grey + one accent, colorblind-safe. Checkable as yes/no items against a PNG.
- Reader lens: `analytics/readers.md` in the Instance holds named Reader profiles; each Finding names its Reader; the Reader subagent in `/analysis-review` adopts that profile, generic fallback if none.
- `/revise-finding` changes presentation and narrative only (charts, tables, ordering, wording, Reader). Any change to a number or query reopens `/analyze` against the same Snapshot. Checks rerun either way.
- Every number in a table or chart traces to query file + Snapshot + Metric definition id; prose numbers cite a table cell; unlinked number = failed Check. (ADR 0004)
- Reader delivery: `aftergrid render` → single self-contained HTML, derived, never authored. Each number carries a "this looks wrong" link that opens a prefilled GitHub Issue. Slack/Notion/PDF in `in-progress/`.

## Engine
- Name `aftergrid`; repo `patrickjmorris/aftergrid`; MIT with Matt Pocock's notice retained.
- Structure mirrors mattpocock-skills: buckets (promoted / misc / in-progress / deprecated), user- vs model-invoked split, router `/ask-aftergrid`, `/setup-aftergrid` with hard/soft dependency split, `.out-of-scope/`, `/skill` prose references, docs page per promoted skill, Claude plugin + skills.sh + `openai.yaml` per skill. Recorded as a `CLAUDE.md` rule, not an ADR.
- Depend on `mattpocock-skills` for model-invoked `grilling` and `writing-for-agents` (setup checks it is installed). Recommend `handoff`, `research`, `to-questionnaire` as install-alongside.
- **CLI in TypeScript**, npm `aftergrid`: `check` (run `.sql` Checks via adapter + provenance lint + template lint), `render` (Vega-Lite → SVG, Finding → HTML). Users write SQL, markdown, JSON only. (ADR 0005)
- Safety in hooks, roles, adapter guards; never prose alone. Prefer logged provisional access over hard walls. (ADR 0006)
- Adapters: **DuckDB + Postgres** promoted in v0 (Postgres covers Supabase and PostHog managed warehouse). HogQL, Snowflake, BigQuery scaffolded in `in-progress/`, promoted when a consumer proves each. Adapter PRs open from day one; skill PRs maintainer-only until first Spot Sports-proven promotion.
- Snapshot = as-of timestamp every query filters on + per-table fingerprint in the Analysis manifest; rerun compares fingerprints, drift fails a Check.
- Metric definition = markdown + frontmatter (id, grain, population, denominator, window, owner, status) + canonical SQL per dialect; `approved` only by a human. (ADR 0007)
- Golden Questions assert answer within tolerance + Metric definition id used + tables read. No full-trace matching.
- Eval/demo data: deterministic synthetic consumer-app events (PostHog-shaped: users, events, subscriptions) with planted effects, on DuckDB in CI. Generator lives in this repo.
- Intake: GitHub Issues with Matt's triage labels; `ready-for-agent` → background run → Finding PR linking the Issue. Cron, Slack, metric alerts in `in-progress/`.

## Instance
- Engine/Instance split; nouns never in skills. (ADR 0002)
- First Instance: `spot_sports/analytics/` — Metric definitions, table docs, Decision log, golden Questions, Findings. Its shape becomes the template `/setup-aftergrid` scaffolds.
- First `analytics/readers.md` profile: "non-technical product owner, reads on phone".
- First real Question: the **podcast/video success readout** (`docs/analytics/podcast-video-success-metrics.md` already has a metric set and readout plan).

## v0 skill set (one Finding end-to-end)
- User-invoked: `/setup-aftergrid`, `/grill-question`, `/analyze`.
- Model-invoked: `/checked-analysis`, `/analysis-review` (Method + Question + Reader subagents).
- Finding-craft library (added 2026-09-15, same session): `/write-finding` (M, orchestrates craft), `/iterate-visual` (M), `/shape-narrative` (M), `/revise-finding` (U: Operator feedback → rerun render + Checks). v0 ≈ 10 skills.
- Deferred to v0.1+: `/probe`, `/to-analysis-plan`, `/to-tickets`, `/triage-requests`, `/diagnosing-metric-change`, `/audit-data`, `/metric-modeling`, `/measurement-design`, `/ask-aftergrid`.
- Hard ceiling stays well under 50 skills.

## Assumptions made without asking (cheap to reverse)
- Finding directory in the Instance: `analytics/findings/<yyyy-mm-dd>-<slug>/{memo.md, manifest.yaml, queries/, checks/, charts/}`.
- Decision log is `analytics/decisions.md`, appended when a Finding PR merges with status `accepted`.
- Findings carry a visible status (draft / reviewed / accepted) in the render.
- v0 hooks target Claude Code (PreToolUse); adapter guards are harness-neutral so Codex gets the same floor.
- Chart house style is a shared Vega-Lite config; every chart title states the claim, not the axis.
- `/setup-aftergrid` scaffolds the Instance; no separate template repo.

## Next
1. `mattpocock-skills:writing-for-agents` before any `SKILL.md`, router, `CLAUDE.md`.
2. `/to-spec` → `/to-tickets` from this file.
3. `mattpocock-skills:codebase-design` for adapter interfaces (warehouse, metric source, ticket source, memory, trigger).
4. `mattpocock-skills:prototype`: `/checked-analysis` + provenance linter against the synthetic DuckDB fixture before committing CLI shape.

---

# 2. Glossary (CONTEXT.md)


Open-source skills, checks and a thin CLI for producing Findings: analysis memos a non-data reader can trust, with every number traced to its query. The engine is public; each team's context lives in a private Instance.

## Language

### Work

**Question**:
An ask sharpened into a decision to make, a metric, a population, a window and a falsifier.
_Avoid_: request, ticket, ask

**Analysis**:
One run that answers a Question and produces a Finding.
_Avoid_: report, notebook, investigation

**Finding**:
The document an Analysis produces: claims, tables and charts, with every number traced to the query, Snapshot and Metric definition behind it.
_Avoid_: memo, report, result, insight, readout

**Claim**:
One assertion in a Finding, stated as a sentence and backed by at least one chart or table whose numbers are traced.
_Avoid_: insight, takeaway, point, key finding

**Variant**:
One candidate rendering of the same Claim, produced while iterating on a chart; at most one becomes the chart in the Finding.
_Avoid_: option, alternative, draft, version

**Check**:
A runnable assertion an Analysis must pass before its Finding is trusted — an invariant, a reconciliation, or a provenance rule.
_Avoid_: test, validation, guardrail

**Snapshot**:
The as-of moment an Analysis ran against, plus a fingerprint of each source table it read, so the Analysis can be rerun and drift detected.
_Avoid_: freeze, baseline, extract

### Context

**Metric definition**:
The meaning of a metric in plain language and in canonical SQL: grain, population, denominator, window, owner. Only an approved definition may appear in a Finding; an agent can propose one, only an Operator can approve it.
_Avoid_: metric (bare), KPI, measure

**Golden Question**:
A Question with a known-true answer, used to evaluate that the Engine and an Instance still agree.
_Avoid_: eval case, test question

**Decision log**:
The record of accepted Findings and the decisions they drove.
_Avoid_: memo archive, history

**Engine**:
aftergrid itself: skills, Checks, adapters and the CLI. Holds verbs, never a team's nouns.
_Avoid_: core, framework

**Instance**:
A team's private repository of context (Metric definitions, table docs, Decision log, golden Questions) and Findings, which the Engine operates on.
_Avoid_: config, app, workspace

### People

**Operator**:
The data-savvy person who installs the Engine, maintains the Instance and reviews Findings.
_Avoid_: analyst, admin, maintainer

**Reader**:
The person a Finding is written for; not expected to read queries or SQL. Each Finding names its Reader from the profiles the Instance keeps.
_Avoid_: stakeholder, consumer, end user, audience

## Relationships

- A **Question** has many **Analyses**; each **Analysis** produces one **Finding**
- A chart in a **Finding** is the surviving **Variant** for its **Claim**
- A **Finding** is made of **Claims**; each **Claim** is headed by a sentence and backed by a chart or table
- A **Finding** is trusted only when its **Checks** pass
- An **Analysis** runs against one **Snapshot**
- Every number in a **Finding** traces to a query, a **Snapshot** and a **Metric definition**
- An accepted **Finding** enters the **Decision log**
- A **Golden Question** is a **Question** whose **Finding** is already known
- The **Engine** operates on an **Instance**; the **Operator** owns both, the **Reader** sees only **Findings**

---

# 3. ADRs

## 0001-finding-is-the-product

**The Finding is the product, not the harness or the context repo**

Every published data-agent system we studied (Ramp Research, Anthropic's self-service analytics, Snap's DS Agent, Macomber's post-AI stack) agrees the harness is a commodity and the moat is company context plus a feedback loop. None of them ships the last mile: a document with tables, numbers and charts that a non-data reader can act on. The one product that does (OpenAI's Data agent) is closed. aftergrid anchors on that gap: the deliverable is a **Finding** a Reader trusts, and skills, Checks, adapters and the Instance exist to produce it. We considered engine-first (a Matt Pocock-style skill set where the memo is one output) and context-first (an open company-context template); both would compete with well-funded internal systems on their strength and leave the reader-facing artifact as an afterthought.

## 0002-engine-instance-split

**Engine and Instance are separate repositories; nouns never live in skills**

aftergrid (the Engine) is public and holds only verbs: skills, Checks, adapters, the CLI. Each team's nouns — Metric definitions, table docs, Decision log, golden Questions, Findings — live in a private Instance (for Spot Sports, `spot_sports/analytics/`, colocated with schema and CI). A skill count near 15, hard ceiling under 50, follows from this: Snap reached ~250 skills partly because table and domain facts became skills. A pattern enters the Engine only after it has worked in an Instance. The alternative, one repo with a `private/` folder, would leak Spot Sports schema into the open-source history and make "what is generic?" a per-commit judgement.

## 0003-finding-is-markdown-plus-static-charts

**A Finding is a markdown memo with static Vega-Lite charts, reviewed as a pull request**

The canonical Finding is `memo.md` plus one `.vl.json` spec per chart, rendered to SVG/PNG and committed beside the queries that produced the numbers. This renders natively on GitHub, diffs cleanly, and is reviewable by the Operator before a Reader sees it. HTML reports, decks and Slack posts are derived from this source, never authored directly. Rejected: notebooks (poor PR review, pulls the stack toward Python), single-file HTML as canonical (not diffable, encourages unreviewed sharing), slide decks as canonical (worst for provenance), and dashboards (Macomber: they become "repositories of facts" agents decompose, not the deliverable). Vega-Lite over matplotlib or Observable Plot because the spec is language-neutral JSON: reviewable, LLMs write it reliably, and house style is a shared config rather than code.

## 0004-every-number-traced

**Every number in a Finding traces to a query, a Snapshot and a Metric definition, enforced by a Check**

The unsolved failure in every system we studied is the silent one: a plausible wrong number used without objection (Anthropic names it explicitly; Snap and Ramp mitigate with verified tables and evals). We chose the strictest provenance rule: each number in a table or chart maps to the query file, Snapshot and Metric definition id that produced it; a number in prose cites a table cell; an unlinked number fails a Check and blocks the Finding. Lighter options (headline numbers only, or an Anthropic-style provenance footer per Finding) were rejected because they leave exactly the supporting numbers a Reader repeats in a meeting unverifiable. The cost is authoring friction, which the `/write-finding` discipline and the CLI linter absorb rather than the Operator.

## 0005-typescript-cli-for-a-data-tool

**The CLI is TypeScript, even though the audience expects Python**

`aftergrid check` runs `.sql` Checks through a warehouse adapter, lints Finding provenance, and renders Vega-Lite charts. Users of the Engine write SQL, markdown and JSON only; they never touch the CLI's language. Given that, TypeScript wins on the author's stack, node already shipping with Claude Code, and Vega rendering natively in node. Python (typer + duckdb + altair) would match data-team expectations and Ramp's eval framework, but adds a runtime the first Instance (Spot Sports) does not have and buys nothing users would see. Prose-only (no CLI) was rejected because "every number traced" and "safety in hooks, not prose" both need something runnable. Revisit if contributors are blocked by TS or if Python-only adapters (e.g. a warehouse SDK with no node client) become the norm.

## 0006-safety-in-hooks-not-prose

**Safety is enforced in hooks, roles and the CLI, never in skill prose alone**

Read-only warehouse roles, cost budgets and dry-runs, blocking DDL and writes and unbounded scans, and PII masking are implemented as Claude Code hooks, adapter-level guards and database roles. A skill may describe the rule, but a rule with no enforcement is not a rule (Snap: "every written rule is paired with an enforcement mechanism in code"; Matt Pocock's `git-guardrails-claude-code` hook is the direct analog). Prose-only guardrails were rejected because an agent under pressure to finish an Analysis will route around advice, and because all-or-nothing gates encourage workarounds; where a gate would block useful work, prefer Snap's bridge — provisional access that is logged with a reason code — over a hard wall.

## 0007-metric-definitions-are-approved-by-humans

**Metric definitions are approved by an Operator; an agent may only propose them**

A Metric definition carries plain-language meaning (grain, population, denominator, window, owner) and canonical SQL per adapter dialect, with a status of `proposed`, `approved` or `deprecated`. Only `approved` definitions may appear in a Finding, and only a human can set that status. Anthropic reports that bootstrapping a semantic layer with LLM-drafted definitions "produced plausible-looking definitions that encoded the very ambiguities we were trying to eliminate"; Snap's rule is that "governance is a decision, not a derivation." Letting the agent auto-approve would be faster to set up and is exactly how a plausible-but-wrong definition becomes load-bearing across every later Finding. The reconciliation Check runs the canonical SQL and compares it to the Analysis's number, so the definition is also the ground truth the checks depend on.

---

# 4. Research notes (5 sources)


## Macomber — Post-AI Data Stack (iandmacomber.com)
- Scarce resource shifted from access to **consensus**. Data team's job: "encode expert judgement into the infrastructure that allows agents to produce correct analysis."
- Stack: harness (commodity) ← company context via progressive disclosure (semantic layer, lineage, domain docs, activity metadata) ← feedback loop (artifacts, decisions, usage, evals).
- **Consensus divergence rate**: same board metric queried across every interface × model; count distinct answers.
- Evals test answer *and* evidence path; normalise traces to steps (`READ_DOMAIN_DOC`, `EXECUTE_SQL`, `SYNTHESIZE_ANSWER`…); snapshot model/prompt/tools/knowledge per run.
- Dashboards become "repository of facts, contracts, and explanations that agents can decompose" — per-data-product `llms.txt`.
- Unsolved: speed vs consistency; vendor drift; keeping context quality compounding.

## Ramp Research (builders.ramp.com)
- Slack-only AI analyst. 1,800 questions / 1,200 convos / 300 users in ~6 weeks; 22× question volume vs `#help-data`. "10–20× increase in questions people ask."
- Context: dbt + Looker + Snowflake metadata + expert-written docs in a filesystem. No PII.
- Tools to inspect values, branch, backtrack — not compression.
- Evals: human-in-loop didn't scale → **evaluate the context layer**. Python mini-framework in dbt asserting final answer *and* intermediate steps (tool calls, table refs, query shape).
- Output: in-thread CSV previews. **No charts, memos, decks.**
- Unsolved: automating context maintenance; headless API next.

## Anthropic — self-service analytics (claude.com/blog)
- Accuracy 21% → 95%+ with skills; semantic layer mandatory first hop; adversarial-review subagent +6%.
- Raw access to query corpus / dashboard SQL moved accuracy <1pt: "bottleneck was structure, not access."
- Answers carry **provenance footer**: source tier (semantic › curated › raw), freshness, owner, confidence.
- Governance by tooling + CI + mandate; metric defs colocated with transformation models; CI flags model changes without doc changes. 90% of data-model PRs include skill changes.
- Correction harvesting: scheduled agent scans Slack for correction language → drafts doc fixes → PRs.
- Traps: LLM-bootstrapped metric defs "encoded the very ambiguities we were trying to eliminate"; skill docs rot within weeks (95% → 65% in a month).
- **Unsolved: silent failures** — plausible wrong answer used without objection.
- Evals pinned to snapshot dates; results stored as warehouse telemetry w/ skill version, git SHA, model.

## OpenAI — Data agent in ChatGPT Work (2026-09-10)
- Closed product. Connectors: Redshift, BigQuery, Snowflake, Databricks, ClickHouse, MongoDB…; context from dbt, Databricks Genie, Snowflake Horizon, BI dashboards.
- **Outputs: interactive dashboards, "leadership-ready update with actuals, comparisons, drivers, caveats, recommended actions", brand guidelines for look & feel.** Writes back to Tableau/Power BI/Sigma/ThoughtSpot/Omni.
- Canonical prompts: diagnose metric change; design KPI framework; create leadership readout.
- Permissions inherit from connected account (table/row/column).
- Only source here that treats the last mile (visuals, readout) as first-class — and it's closed.

## Snap — DS Agent (eng.snap.com)
- Repo-shaped: 1 instruction file, ~250 md skills, ~100 contributors, team workspaces; same canon serves Claude Code / Cursor / Codex.
- Persona: "data scientist who joined last week… completely ignorant of our tables."
- Trust: results shareable only from DataHub-**verified** tables; unverified → analyst sign-off, logged with reason codes. "Governance is a decision, not a derivation."
- "Every written rule is paired with an enforcement mechanism in code." Cost dry-runs.
- Skills ladder: personal → team → company (review + golden dataset + privacy checklist) → hosted app.
- "The bottleneck isn't writing procedures, it's writing descriptions."
- Output: "drafts for the analyst to verify"; claims point back to query. **No visuals/memo story.**
- Self-improvement (repo studies own sessions) unfinished. No impact metrics.

## Cross-cutting
- Consensus: harness commodity; moat = context + feedback loop + evals. All four internal systems built the same shape.
- Nobody open-sources the shape. Snap's repo is internal; Ramp/Anthropic are prose.
- Only OpenAI addresses the **last mile** (tables, charts, readouts for non-data readers), and it is closed and vendor-locked.
- Every source: claims must link to query; verification via checks/evals, not trust; silent plausible-wrong is the open failure mode.

---

# 5. Original handoff (input; decisions there were re-examined above)


Next session: create a new repo and bootstrap an open-source skill set that applies the Devin async-agent model to data analysis, structured like Matt Pocock's skills repo.

## Where this came from

A research and design conversation that started in the `spot_sports` repo. No code was written and nothing was committed. Spot Sports (a consumer sports app: Supabase Postgres + PostHog) will be the **first private consumer** of the new repo, not part of it.

## Inputs (read these, don't re-derive)

- **Ramp head-of-data diagram**, "~2026: Post-AI Data Stack — encode data judgment as infrastructure for agents". The LinkedIn URL expires, so there's a local copy: `/private/tmp/claude-501/-Users-patrickmorris-Sites-spot-sports/4e14b4eb-d273-461b-901d-90f21db82818/scratchpad/ramp.jpg`. Summary:
  - **Existing:** sources → Fivetran → Snowflake/dbt → reverse ETL/ops.
  - **New:** unstructured store (Turbopuffer); agent harness (tools/bash/MCP, model, skills); company context (semantic layer, lineage and provenance, domain docs, activity metadata) fed to the harness via **progressive disclosure**; interfaces (coworkers, coding agents, Slack bots, AI BI).
  - **Feedback loop:** artifacts, analysis, decisions, usage and evals flow back into company context.
  - **Thesis:** the harness is a commodity; the moat is shared context plus the feedback loop.
- **Snap DS Agent:** https://eng.snap.com/ds_agent
  - A git repo run by coding agents (Claude Code/Cursor/Codex): one instruction file, ~250 markdown skills, ~100 contributors.
  - DataHub over MCP; "verified table" flag gates shareable results; provisional queries of unverified tables need sign-off; cost dry-runs before queries.
  - Skills climb a trust ladder: personal → team → company → hosted.
  - They admit the self-improving layer isn't done and give no impact metrics.
- **Matt Pocock skills** (MIT, v1.2.3), installed locally at `~/.claude/plugins/cache/claude-plugins-official/mattpocock-skills/1.2.3/`. Read `README.md`, `CLAUDE.md`, `CONTEXT.md`, `.agents/invocation.md`, `.agents/writing-docs.md`, `.agents/adr/`, `.out-of-scope/`, `skills/engineering/ask-matt/SKILL.md`, `skills/engineering/diagnosing-bugs/SKILL.md`, `skills/engineering/tdd/SKILL.md`, `skills/engineering/triage/SKILL.md`.
- **PostHog managed warehouse** (beta: DuckDB/DuckLake behind a Postgres wire endpoint): https://posthog.com/docs/data-warehouse/managed-warehouse. Candidate data backend and adapter target.

## Decisions made

1. **Separate open-source repo.** Engine only (spec, skills, analysis checks, adapters). Company context (metric definitions, table docs, decision log, golden questions) stays in a private instance, e.g. an `analytics/` dir in spot_sports.
2. **Promote only what's proven.** A pattern enters the engine only after it works in the Spot Sports instance.
3. **No hard dependency on Spot Sports internal tools** (beads, Agent Mail, cass/cm, `headless-bead.sh`). Use adapters instead: ticket source, memory, trigger (cron, metric alert, Slack).
4. **Mirror Matt's structure:**
   - Buckets: promoted / misc / in-progress / deprecated.
   - Invocation split: user-invoked skills orchestrate; model-invoked skills hold reusable discipline; a user-invoked skill never calls another user-invoked skill.
   - A router skill that must stay in sync.
   - `CONTEXT.md` glossary plus ADRs.
   - A setup skill with a hard- vs soft-dependency split.
   - `.out-of-scope/` for rejected requests.
   - Skills reference each other with `/skill` prose, not cross-folder links.
   - A docs page per promoted skill.
   - Claude plugin plus skills.sh distribution, with `openai.yaml` per skill.
5. **Small skill count: ~15, hard ceiling well under 50.** Skills are verbs. Nouns (tables, metrics, domain facts) belong in the semantic layer or catalog, not in skills.
6. **The core new idea is CI for analysis**, the analog of tests/CI in software engineering:
   - reconcile headline numbers with approved metric definitions
   - sanity invariants: date coverage, row counts, null rates, segments sum to total
   - reproducible rerun from a pinned snapshot / as-of timestamp
   - sensitivity to alternate definitions
   - adversarial reviewer subagent
   - golden-question evals
7. **Safety is enforced in hooks and infrastructure, not prose:** read-only roles, cost budget / dry-run, block DDL/writes and unbounded scans, PII masking. Analog of Matt's `misc/git-guardrails-claude-code` hook.
8. **Devin-style async is first-class:** triage label `ready-for-agent` → background run → analysis PR (memo + notebook + queries, every claim linked to its query) → human review → merge into decision log / metric definitions.

## Draft skill map (names provisional)

**Main flow (question → decision):**
- `/grill-question` (U): reuses the `grilling` primitive; turns the ask into decision, metric, population, window and falsifier; updates the glossary.
- `/probe` (M): throwaway queries to check data exists and has the right shape.
- `/to-analysis-plan` (U): pre-registered hypotheses, metrics, cuts, success criteria.
- `/to-tickets` (U): reuse or adapt.
- `/analyze` (U): drives `/checked-analysis`, closes with `/analysis-review`.
- **`/checked-analysis`** (M, the TDD analog): write invariants and reconciliation checks first, at agreed check points; trust the result only when they pass.
- `/analysis-review` (M): two parallel subagents, Method (stats hygiene, denominators, bias) and Question (did it answer the ask).

**Ways into the main flow:**
- `/triage-requests` (U): Matt's labels.
- `/diagnosing-metric-change` (M), the diagnosing-bugs analog: reproduce the move in one query → minimize to the smallest segment → 3–5 ranked falsifiable hypotheses → one cut at a time → monitor/regression check → post-mortem.
- `wayfinder`: reuse for large, unclear research efforts.

**Upkeep:** `/audit-data` (U): undocumented tables, drifting or duplicate metric definitions.

**Vocabulary (M):**
- `/metric-modeling`: domain-modeling analog.
- `/measurement-design`: grain, population, denominator, window, baseline.

**Setup:** `/setup-<name>` (U): warehouse adapter, metric source, issue tracker, artifact dir, permission profile. `/analyze` and `/to-analysis-plan` are the hard dependencies.

**Router:** `/ask-<name>` (U).

**Borrow, don't fork:** `grilling`, `handoff`, `research`, `to-questionnaire`, `writing-for-agents`.

U = user-invoked, M = model-invoked.

## Open questions (resolve first)

1. Project and repo name? It sets the router and setup skill names.
2. Language for CLI and checks: Python (data audience) or TS (the author's stack)?
3. License: MIT or Apache-2.0? Keep Matt's MIT notice wherever his wording is adapted.
4. Personal or company GitHub org?
5. Depend on mattpocock-skills for `grilling`/`handoff`, or vendor copies?
6. Default metric-definition adapter: PostHog metric catalog, dbt, Cube, or plain markdown?
7. `/checked-analysis` checks: runnable CLI from day one, or prose-only first?
8. Contribution policy: maintainer-only skills at first, or open?
9. First adapters: Postgres, DuckDB, PostHog HogQL API, PostHog managed warehouse?

## Notes

- The spot_sports `CLAUDE.md` rules (agent swarm, beads, Vercel git identity, no-contributors-in-README) do **not** apply to the new repo.
- Don't put Spot Sports schema, metrics, IDs or credentials in the open-source repo.

## Suggested skills for the next session

- `/grill-with-docs` (or `mattpocock-skills:grilling`): settle the open questions above and seed `CONTEXT.md` and ADRs in the new repo.
- `mattpocock-skills:domain-modeling`: glossary terms (analysis, check, metric definition, snapshot, finding, decision log).
- `mattpocock-skills:writing-for-agents`: before writing any `SKILL.md`, router or `CLAUDE.md`/`AGENTS.md`.
- `/to-spec` → `/to-tickets`: turn the settled design into a v0 spec and tickets.
- `mattpocock-skills:codebase-design`: adapter interfaces (warehouse, metric source, ticket source, memory, trigger).
- `mattpocock-skills:prototype`: prototype `/checked-analysis` against a local DuckDB fixture before committing to a CLI.

## Suggested v0 scope

Repo skeleton with Matt's structure, then `/setup-<name>`, the `/grill-question` → `/analyze` → `/checked-analysis` → `/analysis-review` chain, a guardrail hook, one adapter (DuckDB), and 3–5 golden-question evals on a public sample dataset.
