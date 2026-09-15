# Handoff: open-source "Devin for data analysis" skills repo

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
