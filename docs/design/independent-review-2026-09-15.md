# aftergrid — independent design review

Date: 2026-09-15  
Reviewed: [design review packet](review-packet-2026-09-15.md), including its seven ADRs, glossary, and research notes.  
Scope: product and technical design review. No running product or screens exist to evaluate; usability and adoption remain hypotheses. Recommendations below are proposals, not changes to the settled ADRs.

## Verdict

**Keep the direction, but reopen the design before turning the whole packet into implementation tickets.** A portable, inspectable finding is a promising first deliverable. The current design is more complete as an analyst's publishing workflow than as a tool that makes non-data people data savvy.

The missing product loop is: ask a question → understand the comparison → inspect an assumption → ask a better follow-up → make and revisit a decision. Producing a polished memo completes only part of that loop.

Keep the public engine/private context split, answer-first presentation, SQL-based checks, human ownership of business definitions, TypeScript, and a readable saved artifact. Concentrate the first release on one analyst and one decision maker working through a recurring product decision.

“Block” below means resolve the contract before relying on it in a release; it does not prevent a small disposable prototype.

## Ranked findings

### 1. Block: the Reader persona does not fulfill the stated product ambition

**Challenges:** ADR 0001; positioning and personas; GitHub-only intake; Reader sees only Findings.

The user wants people to become more capable with data. The packet gives the non-data person a finished answer and an error-reporting link. It does not give them a way to frame the question, understand a denominator, try a relevant comparison, or contribute domain knowledge. Those activities are where the proposed product could make someone more capable. “Never needs SQL” is useful; “only consumes” is too restrictive.

**Alternative:** retain two levels of expertise, but make both active participants. Start with a small product team: a data lead prepares a launch readout, and a product owner uses it to decide whether to continue, change, or investigate a feature.

Design the Finding to support three plain-language actions:

- **Understand:** who is counted, compared with what, and over which period?
- **Inspect:** show the calculation, exclusions, and the evidence behind this sentence.
- **Continue:** ask a follow-up or record what we decided and why.

For v0, explanations and approved comparison views can be precomputed, and follow-ups can go through the Operator. No general chat application is necessary. Test whether the handoff works.

Illustrative learning moment: 20 of 100 people converting is 20%; 30 of 200 is 15%. There are more conversions but a lower conversion rate. A useful experience lets the person discover why the denominator changes the conclusion, rather than merely repeating the headline.

If the intended audience really includes people arriving with spreadsheets and no warehouse owner, explicitly choose that onboarding path instead. The present installation and governance model assumes an available technical partner.

### 2. Block: passing Checks does not establish that a Finding is trustworthy

**Challenges:** ADRs 0004 and 0007; glossary relationship “A Finding is trusted only when its Checks pass”; mandatory answer-first Claim structure.

Passing checks can establish specified properties, such as agreement with a canonical calculation. It cannot establish that the population is appropriate, the instrumentation is complete, the comparison is fair, or the conclusion follows. Both the analysis and its reconciliation can use the same flawed definition. A correct retention difference between viewers and non-viewers does not establish that watching a video caused retention to improve.

The current rendering risks turning a green check into a broad assurance. An assertive chart title can amplify this problem. Anthropic explicitly distinguishes provenance information from answer correctness and still identifies plausible, unchallenged wrong answers as an unresolved failure mode. [Anthropic's account](https://claude.com/blog/how-anthropic-enables-self-service-data-analytics-with-claude).

**Alternative:** expose separate facts: calculation checks passed, definition approved, method reviewed, source limitations, and reviewer/date. Do not collapse these into a truth badge or an invented confidence percentage.

Every decision-relevant claim should specify its comparison, population, time window, material limitations, and whether it is descriptive, associational, or causal. Put a conclusion-changing caveat beside the answer. Allow **inconclusive**, **insufficient data**, and **question needs reframing** as successful outcomes. A Finding with no numerical answer must be able to pass the template.

Keep lightweight data probing and measurement planning inside the v0 workflow, even if their standalone skills are deferred. Write down the primary comparison before exploring many cuts; distinguish later discoveries from the initial hypothesis.

### 3. Block: the proposed Snapshot detects drift but cannot reproduce history

**Challenges:** Engine Snapshot definition; ADR 0004; `/revise-finding` reopening analysis against the same Snapshot.

An event-time cutoff does not freeze a database. A late-arriving event with an old timestamp, a deleted event, or a corrected subscription row can change a historical answer. A table fingerprint may flag the change, but it cannot recover the earlier rows. Separate queries can also observe different states while one analysis is running. Whole-table fingerprints can invalidate old analyses just because unrelated new rows arrived.

**Alternative:** distinguish three guarantees:

1. **Artifact replay:** render the saved results and evidence exactly as reviewed.
2. **Analysis rerun:** execute saved SQL against the same retained input version.
3. **Refresh:** execute against newer data and create a new revision with an explanation of changes.

For the prototype, use a retained immutable DuckDB database or bounded input extracts, recording content hashes. Record SQL, parameters, metric-definition content versions, result hashes, and relevant engine versions. Saved query results alone provide artifact replay, not arbitrary reanalysis.

For Postgres, a repeatable-read transaction can give successive reads a consistent view during that transaction; it is not a durable historical snapshot available to a later session. Durable reruns need retained extracts or an explicitly supported source-version mechanism. [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html).

Fingerprint only a defined dependency scope with a documented algorithm. Where durable source retention is unavailable, say so in the Finding instead of promising reproducibility.

### 4. Block: provenance needs a constrained evidence model, not just Markdown lint

**Challenges:** ADR 0004; charts and prose numbers; presentation-only `/revise-finding`.

A citation can point to the wrong table cell while looking structurally valid. Percentages need denominators; growth rates need a baseline; rounded values need units and formatting rules. Dates, section numbers, targets, and assumptions are numbers without necessarily being query outputs. Conversely, “doubled,” “most,” and “significant” can make quantitative claims without digits.

Charts can also calculate new values after SQL runs. Vega-Lite supports transforms both in `transform` and in encoding fields, including aggregation, binning, and stacking. Checking only query files or the top-level transform property leaves a gap. [Vega-Lite transformation documentation](https://vega.github.io/vega-lite/docs/transform.html).

**Alternative:** keep Markdown for narrative, but have the renderer resolve stable evidence references from a typed result manifest. A reference identifies a result row by stable key, column, unit, metric version, query execution, and input version. Prose inserts a rendered value from that reference rather than hand-copying the number. Derived values identify their inputs and formula. Targets and external assumptions have explicit source types.

For v0, compute analytical transformations in SQL or a recorded calculation step. Allow a small, validated subset of chart specifications that binds to those results; reject untracked calculations and arbitrary data URLs. Generate table cells, annotations, and prose values from the same evidence records. The linter then enforces this supported format; semantic review still evaluates what the sentences mean.

Also revise the revision rule: changing “associated with” to “caused,” hiding a comparison group, changing aggregation, or truncating an axis can change the interpretation without editing a literal number. Such changes invalidate the applicable review. A purely cosmetic edit may reuse analysis, but re-rendering still needs visual verification.

### 5. Block before external release: the success test measures repetition, not capability or adoption

**Challenges:** solo Operator = Reader test; Reader subagent; “states the decision correctly without asking a question”; golden Questions.

An outside person can repeat a headline without understanding it. Asking a good question is often evidence of success. The author playing both roles hides handoff costs, and a simulated Reader cannot establish usability. Golden Questions test a different layer and should remain.

**Alternative:** use the solo run as a smoke test, then run a small formative study with roughly five non-data participants and two or three data practitioners. These numbers are a practical research starting point, not statistical proof.

Use a correct Finding, a valid but inconclusive Finding, and a controlled misleading example. Ask participants to explain the answer in their own words, identify the denominator and baseline, name a limitation, choose an action, and ask a follow-up. Include a new example to test whether the comparison lesson transfers. Debrief any deliberately misleading research material.

Observe an outside Operator connecting a bounded dataset, correcting a definition, and regenerating a Finding. Measure setup time, review effort, interpretation errors, and follow-up completion against their existing spreadsheet/report process. Look for a second voluntary use on a real decision before calling the product useful.

Extend engine fixtures beyond clean planted effects: duplicate joins, zero denominators, changing population mix, late events, missing instrumentation, wrong evidence references, and insufficient data. Expected outcomes must include refusing an unsupported conclusion.

### 6. Block before real-data delivery: sharing and exception rules are underspecified

**Challenges:** ADR 0006; self-contained HTML; per-number GitHub Issues; claim of equivalent safety across harnesses.

A private warehouse connection does not establish that every recipient may see the exported results. Self-contained HTML is a copy of its embedded data; hidden tables and chart payloads count. A link to a private GitHub Issue can exclude the intended Reader, and prefilled URLs may carry sensitive values. A static artifact also needs a visible freshness and supersession story.

The cited Snap exception is narrower than the packet's general preference for provisional access: Snap describes non-sensitive unverified tables, explicit human sign-off, provisional labeling, and no sharing of those results. It does not describe a general permission to bypass controls. [Snap DS Agent](https://eng.snap.com/ds_agent).

**Alternative:** define the intended recipient, allowed result granularity, embedded fields, and delivery location for each Finding. Export only the reviewed reader-safe payload. Make one clear “Question or flag this finding” action available with a tested contact path; use finding/claim identifiers rather than automatically copying values into URLs.

Show source coverage, generation time, version, owner, and any replacement link. A downloaded file cannot be reliably recalled; choose a managed publication surface later if revocation becomes a requirement.

Separate exploratory source-verification exceptions from hard database permissions, privacy boundaries, and execution limits. Record human approval against the relevant artifact version. Do not claim equivalent harness safety until alternate query paths and export paths have been tested. An editable `approved` frontmatter value alone is not proof that a human approved it.

### 7. Change before planning: scope has expanded around packaging before the core experiment

**Challenges:** v0 skill set, adapter scope, dependency setup, visual iteration, next-step ticketing.

Ten skills, automated visual judging, distribution conventions, two adapters, background issue processing, and the evidence engine create many integration seams. Yet the data-savvy Reader loop remains untested. Skill count is not a useful proxy for product completeness.

**Alternative:** build one path: a bounded dataset → a clarified question → a checked analysis → one reviewed Finding → one Reader follow-up. Start manually; automate the repeated steps after observing them.

Keep a thin TypeScript CLI with `check` and `render`, one immutable DuckDB fixture, a small evidence schema, one report template, a few chart forms, a short analysis/review workflow, and failure-oriented evaluations. Treat narrative and visual guidance as reference material rather than four separate skills initially.

Cut first: autonomous three-pass visual scoring, Variant selection, background GitHub intake, scaffolded unused adapters, and multi-channel packaging. Defer the reusable setup framework until a second team has been onboarded. Keep probing and method checks inside the workflow.

Use a bounded real-data extract for the first pilot where feasible. Add a live adapter earlier only if extraction prevents the actual pilot. PostHog documents a PostgreSQL wire endpoint backed by DuckDB; sharing a connection driver does not prove identical snapshot, catalog, guard, or SQL capabilities. Validate a capability matrix before advertising coverage. [PostHog managed warehouse](https://posthog.com/docs/data-warehouse/managed-warehouse).

### 8. Validate: “the last mile is open” is a positioning hypothesis

**Challenges:** ADR 0001 and research claims that other systems lack visuals or actionable reports.

Keep the Finding as the organizing deliverable. But an output format is straightforward for other agents to generate, and an article's silence about a feature does not establish that it is absent. The reviewed OpenAI launch already describes company-data analysis, follow-up questions, evidence review, and shareable interactive dashboards. [OpenAI Data agent announcement](https://openai.com/index/put-data-to-work/).

**Alternative positioning to test:** “Turn recurring product questions into reviewed decisions your team can understand, inspect, and revisit.” Support that with an open evidence format, company-owned definitions, portable artifacts, and less analyst review work.

A Slack bot can be a channel for aftergrid. The adoption question is whether aftergrid gives a team a better maintained decision record and a better evidence-review process than their existing bot or spreadsheet workflow. Measure that with an outside team; do not infer demand from open-source availability alone.

The market review here is deliberately narrow. Ramp's article did not yield substantive text through the available web reader, so its claimed lack of charts was not independently verified. The packet's sources are useful architectural precedents, not an exhaustive competitive survey.

### 9. Change: governance and vocabulary compress different states together

**Challenges:** ADR 0007; accepted Findings automatically entering a Decision log; glossary restrictions.

Requiring every intermediate diagnostic count to be an independently approved business metric makes exploration unnecessarily expensive. At the same time, a definition ID without a pinned version cannot establish historical meaning. Merging an analysis does not establish that someone made or implemented its recommended decision.

**Alternative:** distinguish approved business metrics, traceable diagnostic calculations, and proposed definitions. Permit diagnostics in working analysis with explicit status. Require the agreed approval level for published decision metrics. Version definitions and record the approving person and reviewed revision outside agent-editable status text alone.

Separate analysis review from the decision: an owner may review the Finding and still defer, reject, or choose another action. Record decision owner, action or deliberate inaction, rationale, date, revisit condition, and eventual outcome. Close corrections through a new Finding revision and, when appropriate, a definition update and regression fixture.

Keep the glossary for internal consistency, but remove bans on normal Reader language:

| Current term | Recommendation |
| --- | --- |
| Finding | Keep as the artifact name; allow “finding” to mean an individual observation in ordinary prose. |
| Operator / Reader | Internal role shorthand; use analyst and decision maker in user-facing explanations, allowing people to switch roles. |
| Instance | Prefer workspace in user-facing copy; reserve Instance for the repository contract. |
| Check | Automated assertion, not proof of correctness or a synonym for every form of review. |
| Snapshot | Reserve for retained/versioned inputs; otherwise say source observation or freshness record. |
| Golden Question | Define as a reference case with expected answer or expected abstention and tolerances. |
| Metric definition | Use the full phrase when discussing its contract; allow “metric” in normal prose. |
| accepted | Separate reviewed analysis from recorded decision and completed action. |
| Variant | Keep internal to visual authoring; “option” is fine for users. |

An initial question need not already contain a metric and falsifier. Make that the outcome of clarification, or vague real-world questions will appear invalid before the product can help.

## Keep ADR 0005: TypeScript is a reasonable choice

There is no evidence in this packet that Python is necessary for v0. Users can work in SQL, Markdown, and JSON; the maintainer can build in the stack they know. Contributor willingness to write adapters remains untested. A small adapter interface, a working example, and behavioral contract tests are more useful now than changing language on speculation. Add a language-neutral adapter boundary later only if a real contributor or backend needs it.

## Recommended next experiment

Make one hand-reviewed product launch Finding from bounded data, with an explicit baseline, a visible limitation, expandable evidence, and a usable follow-up path. Test it with a data practitioner and a non-data decision maker before building the broader skill library.

Proceed to a narrow implementation spec once you can answer:

1. Who initiates the question, who reviews it, and who makes the decision?
2. What can the decision maker understand or do that the old spreadsheet workflow did not support?
3. Which guarantees are mechanically enforced, which require judgment, and which are unavailable?
4. Can the exact reviewed artifact be reconstructed, and is a fresh analysis clearly a new revision?
5. Can a real recipient inspect and question the result without becoming a GitHub or SQL user?

The core promise should be **helping people reason well with evidence**. The Finding is the durable artifact that supports that promise.
