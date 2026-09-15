# Research notes — data-agent landscape (2026-09-15)

Read for the aftergrid grill. Summaries, not re-derivations.

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
