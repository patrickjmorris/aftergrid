# Research notes — Vera (DoorDash) and Confidence (Spotify), 2026-09-16

Read for scoping the hands-on analysis. Summaries, not re-derivations. Companion to `research-notes-2026-09-15.md`.

## DoorDash — Inside Vera (careersatdoordash.com/blog/inside-vera-doordashs-data-agent, 2026-09-16)

- Internal conversational data agent. 19 domains, 1,900+ evals, LLM judge on three criteria: right tools, right tables, correct answer. Domain owners vet every eval. Evals mined from Slack threads and Jira tickets by a model, then owner-reviewed (95% accepted).
- Pass rate 43% → 90% over the project. Model releases plateaued; **the harness (context, retrieval, data model, SQL validation) is the dominant lever now.** Claude Code with the same skills and SQL tools scored 48% vs Vera 73% on the same model: the gap was a catalog of modeled tables and join heuristics.
- Access to unmodeled or unverified sources is **blocked at the harness level**. New knowledge sources start inactive and must pass an eval threshold before a domain owner promotes them. Every source encodes provenance; change detection opens approval proposals.
- Evals with relative windows ("last week") go stale; one contributor keeps them current.
- **Difficulty taxonomy:**
  - Tier 1: descriptive, known definitions, curated patterns (pulls, trends, splits, sanity checks)
  - Tier 2: analyses that could influence decisions (prioritization, targeting, opportunity sizing, allocation)
  - Tier 3: deeper interpretation and accountability (causal analysis, experiment readouts, committed forecasts, high-stakes decision support)
- **Tier 3 failure mode, verbatim:** models "tended to stop early and optimistically … returned superficial — albeit plausible — answers without diving deeper."
- **Tier 3 fix:** an `/analysis` flow. Problem discovery and planning before execution; plan shown; nothing runs until the user approves or adjusts. Resolves timeframes, metrics, scope, constraints. Pass rate on 14 Tier 3 evals: 64% to 100%, i.e. high variance, small sample. Tier 3 is the stated core focus going forward.
- Open questions they name: cost per answer; **how to build evals for complex analytics and reporting**; whether faster analytics move business metrics.
- Not present: any deliverable artifact beyond the chat answer, a decision record, a re-check of a past answer, or a measure of whether a stakeholder acted.

## Spotify — Confidence and confidence-ai-plugins (github.com/spotify/confidence-ai-plugins v0.9.0, Apache-2.0)

- **Warehouse connection is a direct connector, not MCP.** Confidence's own service account (BigQuery) or key pair (Snowflake) is granted write access to assignment/exposure schemas and read-only access to fact tables. Metrics are computed inside the customer warehouse by scheduled jobs; only aggregates (daily count, mean, variance per group) are cached in Confidence.
- **MCP is the control plane.** Two remote HTTP servers, `mcp.confidence.dev/mcp/flags` and `/mcp/docs`, OAuth handled by the MCP server. Tools seen in skills: `getIdentityInfo`, `listFactTables`, `getEventDefinition`, `validateWarehouseConfig`, `createFlag`, `addTargetingRule`, `resolveFlag`, `createClient`, docs search. No tool executes SQL against the warehouse. The agent configures the connector and links to the UI; it never queries data.
- **Metric model** (docs/api/metrics/concepts): Entity → FactTable (timestamp, entity, measurement; defined as a query) → Metric (kind: conversion/consumption/average/ratio; aggregation; window) joined with ExposureTable (first exposure per entity, per experiment) by a ScheduledMetricCalculation. AssignmentTable maps any flagging source.
- Skill patterns worth copying: plan / adjust / execute with consent ticks and no writes during plan; `validateWarehouseConfig` returns a structured validation array and the skill says "never assume partial success from an ambiguous error"; prefer one MCP call over chained REST; skill evals with mocked MCP tools, multi-turn harness, deterministic scorers plus LLM judges (`evals/`).
- Do not copy: skills embed telemetry curls run with `dangerouslyDisableSandbox: true` and instruct the agent never to mention them.
- `explore-metric` stops at a pre-filled Metric Explorer URL because the overlap check (`QueryAvailableTimeRange`) has no public tool. The skill says so instead of guessing.

## Cross-cutting, against aftergrid

- Vera's Tier 3 is the tier aftergrid targets. Their only Tier 3 lever is the planning gate, which is `/grill-question` plus the pre-registered comparison. Neither system has a mechanism for depth during the analysis; "stop early and optimistically" is the agent-side form of the analyst losing the question.
- Vera measures answer correctness; aftergrid measures whether a Reader can act. Vera has no artifact, no decision record, no revisit. That gap is intact.
- Vera's blocked-unless-modeled rule and provenance-with-approval are ADR 0006 and ADR 0007 at company scale. aftergrid has no table catalog or join-pattern layer; that is Instance-side by ADR 0002, but the Claude Code vs Vera gap says its absence costs accuracy.
- Confidence's metric objects are a structured, warehouse-native Metric definition. For an experiment-readout Finding, consuming Confidence's exposure and metric outputs as typed evidence is cheaper and more credible than recomputing the statistics.
- "Warehouse via MCP" is common for vendor control planes and for standalone Snowflake/BigQuery MCP servers, not for Confidence's data path. aftergrid's adapter-in-CLI with hook guardrails matches Vera's harness-level blocking; an MCP-backed adapter would be one more adapter, not a design change.

## Devin — Data Analyst agent, DANA (docs.devin.ai/work-with-devin/data-analyst)

- **Data access is MCP-only.** "The Data Analyst Agent connects to your data through MCP integrations." Marketplace: Redshift, Postgres, Snowflake, BigQuery, MySQL, SQL Server, Neon, Supabase, Cloud SQL; Datadog, Metabase, Grafana, Sentry; or any custom MCP server. Credentials go to Devin (connection strings, service accounts, API keys). Several sources can be connected at once; the agent picks by query context.
- **Context** is a "Database Knowledge note": schema docs auto-referenced before queries; the agent writes back schema relationships, business-logic definitions and data-quality patterns it learns. Metric definitions are stated in the prompt and persisted the same way. No approval step; the agent's own learnings become context.
- **Workflow:** synchronous sessions in the web app or Slack (`/dana`, `@Devin !dana`), reply in-thread. Recommended pattern is iterative: start broad, drill down, investigate. No plan-before-execute gate.
- **Output:** tables, seaborn charts, and for investigations a "structured summary": plain-language answer, the SQL, key numbers, insights, Metabase links. Verification is "review the SQL." No memo, no saved results, no hashes, no decision record, no revisit.
- **Difficulty:** examples run from lookups to cohort drop-off analysis; no explicit tiers, no method review, no statement of what the agent could not verify.
- Against aftergrid: DANA is Vera's Tier 1–2 shape packaged for any customer. Everything aftergrid adds (Question gate, Checks, bound evidence, six-section Finding, Decision record, Revisit) sits after the point where DANA stops. DANA's knowledge note is the un-gated version of ADR 0007's Metric definition. Its MCP-only access is the "harness owns the data path" assumption in production, which is the assumption aftergrid is now adopting for its default path.
