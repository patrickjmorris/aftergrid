# aftergrid

Open-source skills, checks and a thin CLI for producing Findings: analysis memos a non-data reader can understand, inspect and act on, with every number traced to its evidence. The engine is public; each team's context lives in a private Instance.

This glossary governs Engine and Instance docs and skill prose. Reader-facing copy may use plain words (analyst, decision maker, workspace, "a finding").

## Language

### Work

**Question**:
The sharpened form of a raw ask: a decision to make, a metric, a population, a window and a falsifier. For a completed evaluable Question the falsifier is machine-checkable so a Revisit can evaluate it; unresolved or not-answerable Questions explicitly retain that state instead of inventing a falsifier. Sharpening is the job of `/grill-question`; a raw ask is not rejected for lacking these.
_Avoid_: request, ticket, ask

**Analysis**:
One run that answers a Question and produces a Finding.
_Avoid_: report, notebook, investigation

**Finding**:
The document an Analysis produces: Claims, tables and charts, with every number traced to the evidence behind it. "Inconclusive", "insufficient data" and "question needs reframing" are valid Findings.
_Avoid_: memo, report, result, insight, readout

**Claim**:
One assertion in a Finding, stated as a sentence; a numeric Claim is backed by at least one chart or table whose numbers are traced. Every Claim declares its type: descriptive, associational or causal; its comparison, population and window; and a Recheck policy.
_Avoid_: insight, takeaway, point, key finding

**Variant**:
One candidate rendering of the same Claim, produced while iterating on a chart; at most one becomes the chart in the Finding.
_Avoid_: option, alternative, draft, version

**Check**:
A runnable assertion that establishes one stated property of an Analysis: an invariant holds, a calculation matches its Metric definition, an evidence reference resolves. Passing Checks never by itself makes a Finding trustworthy.
_Avoid_: test, validation, guardrail, proof

**Snapshot**:
The retained inputs an Analysis ran against: an immutable fixture or bounded extracts with content hashes. A Finding lists which guarantees its Snapshot gives: artifact replay, analysis rerun, both, or neither.
_Avoid_: freeze, baseline, as-of, fingerprint

### Context

**Metric definition**:
The versioned meaning of a metric in plain language and in canonical SQL: grain, population, denominator, window, owner. Status is proposed, approved or deprecated; only an Operator can approve, and the approver and reviewed revision are recorded. Only an approved definition may carry a published decision metric.
_Avoid_: metric (bare), KPI, measure

**Diagnostic calculation**:
A traceable calculation used inside an Analysis that is not an approved Metric definition. Allowed in working Analyses with explicit status; never the headline of a Finding.
_Avoid_: ad-hoc metric, scratch metric

**Golden Question**:
A reference case: a Question with an expected answer within tolerances, or an expected abstention, used to evaluate that the Engine and an Instance still agree.
_Avoid_: eval case, test question

**Recheck policy**:
The declared way a Claim is re-tested on Revisit: the proposition it asserts (predicate, threshold, direction), the comparison method, the evidence it reads, its minimum data, and its window policy; or an explicit statement that it cannot be evaluated automatically and why. A Recheck yields holds, contradicted, insufficient data, or not comparable.
_Avoid_: tolerance (alone), threshold (alone), alert rule

**Decision record**:
An entry stating who decided, what action or deliberate inaction was taken, why, when, what would trigger a Revisit, and the eventual outcome. It cites a Finding; merging a Finding does not create one.
_Avoid_: outcome, verdict

**Revisit**:
The operation that refreshes a merged Finding's Snapshot as new retained inputs, reruns its Analysis, evaluates each Claim's Recheck policy and the Question's falsifier, and produces a new revision reporting each Claim as holds, contradicted, insufficient data or not comparable. Whether a Decision still holds is the decision owner's judgement, never inferred by the Engine.
_Avoid_: refresh (the data step only), re-run, monitor, alert

**Decision log**:
The collection of Decision records in an Instance.
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
The person a Finding is written for. Can understand, inspect and follow up on a Finding without reading SQL. Each Finding names its Reader from the profiles the Instance keeps.
_Avoid_: stakeholder, consumer, end user, audience

## Relationships

- A **Question** has many **Analyses**; each **Analysis** produces one **Finding**
- A chart in a **Finding** is the surviving **Variant** for its **Claim**
- A **Finding** is made of **Claims**; each **Claim** is headed by a sentence, and a numeric **Claim** is backed by a chart or table
- A **Finding** is publishable only when its required **Checks** pass, its published decision **Metric definitions** have verified approval, and its required method/human publication reviews are recorded against current content; these are shown as separate facts, never one badge
- An **Analysis** runs against one **Snapshot**
- Every data-bearing value in a **Finding** resolves from a typed evidence reference: query execution, **Snapshot**, and a **Metric definition** or **Diagnostic calculation**, or an explicitly sourced target/assumption
- A **Decision record** cites a **Finding** and enters the **Decision log**; merging a **Finding** does not create one
- A **Revisit** of a **Finding** tests every **Decision record** that cites it
- A **Golden Question** has a reviewed expected answer or abstention with explicit evidence constraints and tolerances
- The **Engine** operates on an **Instance**; the **Operator** owns both; the **Reader** understands, inspects and follows up on **Findings** without SQL
