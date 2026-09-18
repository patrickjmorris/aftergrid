# Analytics skills benchmark

Research date: 2026-09-17. This is a product recommendation, not a claim of parity or endorsement. Repository READMEs, runtime skills, supporting references, and teaching surfaces were read directly. No reference plugin was installed or executed.

## The bar

Aftergrid should make a recognizable analytics practice installable: sharpen the decision, establish the metric and grain, investigate with checks, challenge the explanation, communicate the result, and retain the lesson. The product is the skills and the expertise they encode. The Engine supplies stronger evidence and reproducibility where useful.

These references earn credibility through a distinct point of view, a short path to first use, source that makes the doctrine concrete, and examples that teach a habit. Matching their skill count or adopting their command names would accomplish little.

## Sources and versions

| Reference | Inspected snapshot | Primary entry points |
| --- | --- | --- |
| Matt Pocock | `74ca5fe077456a0b3b2f5310cf9430999fd0b5fd` | [Repository](https://github.com/mattpocock/skills/tree/74ca5fe077456a0b3b2f5310cf9430999fd0b5fd), [skills course](https://www.aihero.dev/skills/subscribe) |
| Compound Engineering | `082c83e0537c803ac1d927daafc2e6eb6962dedf` | [Repository](https://github.com/EveryInc/compound-engineering-plugin/tree/082c83e0537c803ac1d927daafc2e6eb6962dedf), [Every's explanatory essay](https://every.to/chain-of-thought/compound-engineering-how-every-codes-with-agents) |
| pstack, standalone mirror | `157aae39a733135e93d8b5b19ff62c6a84b0ad56` | [Mirror](https://github.com/backnotprop/pstack/tree/157aae39a733135e93d8b5b19ff62c6a84b0ad56), [original Cursor package](https://github.com/cursor/plugins/tree/main/pstack) |

The current original pstack path is `cursor/plugins/pstack`, not `cursor/plugins/plugins/pstack`. The mirror explicitly adds installation guidance and harness-neutral adaptations; its [sync instructions](https://github.com/backnotprop/pstack/blob/157aae39a733135e93d8b5b19ff62c6a84b0ad56/MIRROR.md) describe that relationship. Original repository HEAD resolved to `e31650eea443aaea1e84cc15d88c13f40080b275`; detailed skill observations below are pinned to the mirror, not claimed to be a byte-identical original checkout. Commands below report the references' instructions at inspection time; they are not Aftergrid compatibility tests.

## What each reference actually does

### Matt Pocock: portable, composable expertise

The README distinguishes a managed Claude plugin from editable skill copies installed with `npx skills@latest add mattpocock/skills`. First use is explicit: install, run setup once per repository, then choose skills by the failure being addressed. Its catalog distinguishes human-started orchestration from reusable model-invoked discipline. [README](https://github.com/mattpocock/skills/blob/74ca5fe077456a0b3b2f5310cf9430999fd0b5fd/README.md)

The quality is in the procedure. TDD defines observable interface seams, independently grounded expected values, and one test/implementation slice at a time. Domain modeling resolves ambiguous language against the actual code and records terms when they become clear. These are specific interventions in predictable failure modes, rather than general encouragement to do good work. [TDD](https://github.com/mattpocock/skills/blob/74ca5fe077456a0b3b2f5310cf9430999fd0b5fd/skills/engineering/tdd/SKILL.md), [domain modeling](https://github.com/mattpocock/skills/blob/74ca5fe077456a0b3b2f5310cf9430999fd0b5fd/skills/engineering/domain-modeling/SKILL.md)

The authoring reference treats reliable process as the objective. Ordered actions need observable completion criteria; branch-specific detail belongs behind explicit references. This is a useful editing test for Aftergrid's longer skills: can an agent see the next action, the artifact, and the condition for continuing? [Writing for agents](https://github.com/mattpocock/skills/blob/74ca5fe077456a0b3b2f5310cf9430999fd0b5fd/skills/productivity/writing-for-agents/SKILL.md)

**Analytics equivalent:** every skill should solve a problem a practicing analyst can name, with a copyable prompt, expected artifact, scope boundary, and worked example. Preserve the existing question/analysis/writing/review division, while providing useful entry points for a metric definition, broken join, or suspect conclusion.

### Compound Engineering: learning must be retrieved

Its current README presents native installation for several hosts, setup, one core loop, and optional specialist routes. The central claim is not simply better execution: prior work becomes grounding for subsequent work. Its narrative website explains the practice; the repository supplies the operational version. [README](https://github.com/EveryInc/compound-engineering-plugin/blob/082c83e0537c803ac1d927daafc2e6eb6962dedf/README.md)

`ce-compound` accepts only solved, verified problems with durable reasoning that cannot readily be recovered from the resulting implementation. It can update an existing lesson rather than duplicate it, and can correctly finish without writing anything. The capture has explicit boundaries and completion checks. [Runtime skill](https://github.com/EveryInc/compound-engineering-plugin/blob/082c83e0537c803ac1d927daafc2e6eb6962dedf/skills/ce-compound/SKILL.md)

The return path is concrete: planning's researcher searches the lesson corpus, matches applicability and domain terms, and converts findings into constraints, verification implications, and known failed approaches. A folder of notes alone would not satisfy this mechanism. [Learning retrieval](https://github.com/EveryInc/compound-engineering-plugin/blob/082c83e0537c803ac1d927daafc2e6eb6962dedf/skills/ce-plan/references/agents/learnings-researcher.md)

Its demo documents provenance: a replay of two real sessions, 18 days apart, in which the second reads the first's lesson. Timing compression and identifying substitutions are disclosed. This is a stronger proof pattern than an invented terminal transcript. [Demo provenance](https://github.com/EveryInc/compound-engineering-plugin/blob/082c83e0537c803ac1d927daafc2e6eb6962dedf/assets/demo/README.md)

**Analytics equivalent:** retain a verified grain, denominator, cohort-maturity, source-latency, or interpretation lesson with applicability and evidence; read matching lessons before another analysis; show exactly which check or choice changed. Prefer a reusable SQL assertion or metric definition when that fully captures the lesson. Keep approval and historical context distinct from a reusable rule.

### pstack: make the proof observable

The original-style entry is `/add-plugin pstack`, `/setup-pstack`, then `/poteto-mode` for substantial work. The mirror offers `npx skills add backnotprop/pstack` and an explicit dependency table. The mode chooses a playbook; individual skills remain available. Its guide moves from a first task to verification, longer runs, customization, and recipes. [README](https://github.com/backnotprop/pstack/blob/157aae39a733135e93d8b5b19ff62c6a84b0ad56/README.md), [guide](https://github.com/backnotprop/pstack/blob/157aae39a733135e93d8b5b19ff62c6a84b0ad56/docs/guide/README.md)

The proof principle requires exercising actual behavior and inspecting produced artifacts, including delegated work. When possible, keep a script a reviewer can rerun. Its review skill sends the same intent and rubric to independent models and synthesizes a verdict; model agreement is evidence to assess, not an automatic fix instruction. [Proof](https://github.com/backnotprop/pstack/blob/157aae39a733135e93d8b5b19ff62c6a84b0ad56/skills/principle-prove-it-works/SKILL.md), [review](https://github.com/backnotprop/pstack/blob/157aae39a733135e93d8b5b19ff62c6a84b0ad56/skills/interrogate/SKILL.md)

`why` explicitly separates direct evidence, supported interpretation, inference, speculation, and unknowns. `reflect` routes lessons toward skill changes but checks whether structural enforcement would be stronger first. [Epistemics](https://github.com/backnotprop/pstack/blob/157aae39a733135e93d8b5b19ff62c6a84b0ad56/skills/why/references/epistemics.md), [reflection](https://github.com/backnotprop/pstack/blob/157aae39a733135e93d8b5b19ff62c6a84b0ad56/skills/reflect/SKILL.md), [structural enforcement](https://github.com/backnotprop/pstack/blob/157aae39a733135e93d8b5b19ff62c6a84b0ad56/skills/principle-encode-lessons-in-structure/SKILL.md)

**Analytics equivalent:** inspect input-to-result-to-claim directly; calculate independently where practical; test competing explanations and show disconfirming evidence. A review must be able to change an answer into “inconclusive.” Independent reviewers should challenge method, decision relevance, and reader interpretation, with their actual scope stated.

## What Aftergrid should ship

These are recommendations inferred from the comparison, not features promised by the references.

| Surface | Concrete bar |
| --- | --- |
| Landing page | Lead with analytics skills, who they help, and the failure they prevent. Put install, first prompt, and a real example before engine architecture. |
| Skill catalog | Organize around analyst jobs: frame a question, define a metric, diagnose a change, inspect SQL, challenge a finding, communicate it, retain a lesson. Each page states input, output, and completion. |
| First use | One short path using bundled data and no warehouse credentials. Separate skill installation from optional Engine setup; disclose actual dependencies. |
| Flagship example | Supply the question, retained input or acquisition script, flawed first interpretation, check that catches it, corrected conclusion, rendered artifact, and rerun command. |
| Learning example | A second question retrieves a prior lesson and visibly changes its plan or check. Label authored fixtures, agent runs, and human approval independently. |
| Teaching | Publish practical walkthroughs: denominator drift, join fanout, immature cohorts, a headline the data cannot support, and turning a caught mistake into a reusable check. Every article links its executable example and skill. |
| Credibility | Credit influences; show sources, supported hosts actually tested, known limits, and evidence artifacts. Make no adoption, superiority, endorsement, or accuracy claims without evidence. |

The existing `analyze`, `checked-analysis`, and three-lens `analysis-review` already supply substantial discipline. The biggest opportunity is to make that expertise legible and usable before explaining publication machinery, and to close the capture-to-retrieval loop. The source contracts must remain precise; the introductory experience should speak in the analyst's task language.

## What not to import

- **Scale as theater.** More skills, agents, model brands, or workflow stages do not establish analytical quality. Apply independent work where there are distinct questions worth resolving.
- **Software completion as analytical truth.** A successful command, passing schema, or clean review does not establish causal attribution or a valid business decision.
- **Mandatory ceremony for every task.** A quick SQL review should not require the entire Finding lifecycle. State which guarantees each route provides.
- **Unbounded memory.** Capture durable lessons with applicability and a canonical home; update stale lessons. Generic session summaries increase retrieval noise.
- **Copied persona or claims.** Borrow specific mechanisms and credit them. Aftergrid needs its own analytical judgment, demonstrations, and voice.
- **Demo inflation.** A deterministic fixture can prove tool behavior. It cannot prove live agent skill reliability or human publication approval. Show which occurred.
