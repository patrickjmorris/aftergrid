# Research notes — Meta Analytics (two pieces) and Shopify (data and intuition), 2026-09-17

Read for positioning: where aftergrid fits in the market. Summaries, not re-derivations. Companion to `research-notes-2026-09-15.md` and `-16.md`. Meta quotes are checked against owner-supplied PDFs of the originals; Shopify was read through a summarising fetch, so check its quotes against the page before public use.

## Meta — How data scientists lead and drive impact (Crystal Distin and Jason Wei, 2025-01-28)

- Thesis: the job is **product leadership**, not analytics service. "Data scientists at Meta are great at analytics and coding, but first and foremost, we push the frontiers on the products we build by challenging assumptions."
- Stance: "it's very important to be highly critical and highly skeptical of the data that we do see. This mindset helps us go deep enough to surface the true insights versus the surface level insights that may lead us in the wrong direction."
- Embedded vs centralised, stated as a trade: a central team taking requests can "standardize methodology and flex across different product areas" but "decreases accountability for business outcomes as you jump from project to project." Embedded means one DS per product team, held "accountable to the success and outcomes of that product team," from IC to VP.
- On intuition: with 3B+ users on networked products, "it's impossible to operate with just our intuitions." Leaders "look to data (and our voices)" and then decide.
- What counts as high-impact work:
  - Measurement for networked products: feedback effects, inventory effects, peer-encouragement and cluster experiments, folded into a "Facebook Ecosystem Score" that arbitrates between surfaces (People-You-May-Know vs Groups-You-Should-Join: each cut has a downstream cost the local metric hides).
  - A series of analyses "over the course of many months." Facebook and Messenger DS teams worked "for almost a year" on experiments proving the value of messaging; result was joint goals, and "this change impacts the work of thousands of engineers across 2 large organizations."
- History: ten years ago, 40 data scientists for ~200 PMs and 4,000 engineers; "limited in both our depth and understanding," and much of the job was logging and debugging badly set up experiments. Today 1:1 with PMs.
- Not present: anything about how an analysis is written up, checked or revisited. Trust comes from the person and their standing on the team.

## Meta — Inside Meta's home-grown AI Analytics Agent (2026-03-30)

- Scope is **routine** analysis. Founding bet: "88% of queries by Data Scientists rely solely on tables they've queried in the preceding 90 days," so each analyst's work is a bounded domain. Goal stated as "doesn't replace the data scientist but scales them."
- Adoption: weekend prototype to company-wide in about six months; 77% of DS and DE weekly, "roughly 5x as many users from non-data roles." Adoption goal raised from 20% to 55% mid-half and overshot. No accuracy or eval numbers are reported anywhere in the piece.
- Context: "shared memory" per analyst. Offline LLMs process every query a person has run and generate descriptions of their tables and analysis patterns; docs, warehouse metadata, pipeline source and semantic models are indexed beside it. You can "clone" a colleague by pointing the agent at their query history. No approval step on any of it.
- **Cookbooks / Recipes / Ingredients.** Recipe = a team's standard operating procedure (reference experts, instructions, custom validations, tool controls). Ingredients = what the data means (semantic models, docs, text snippets, Memories accumulated from user corrections). Cookbook = the package for a domain. Design rule: "Recipes define what to do (workflows, analysis steps, response formats), but not what the data means."
- Custom Validations: natural-language rules "that a separate AI checks against the agent's output before presenting results," e.g. "WAU should be < 8 billion", "Always filter by is_test=false."
- Trust: "show everything." Every data point carries its SQL. "In analytics, a wrong number presented confidently is worse than no number at all." "Accuracy you can't verify isn't useful." Verification is reading the SQL, "just as they'd review a colleague's SQL."
- Community: 750+ feedback posts in a half; "4,500+ community-created recipes had been used 150,000 times" by open beta.
- Lessons they name: start with a falsifiable bet; personal context; make it easy for experts to teach the agent; show your work; early users are co-builders; ship early.
- Not present: difficulty tiers, a planning gate, a deliverable beyond the chat answer, a decision record, a revisit, any gate between an agent's learned Memory and its use as context.

## Shopify — Data and intuition (shopify.com/news/data-and-intuition; Nell Thomas, VP Data)

- Thesis: "data-driven" is not the goal. "Data does not replace intuition, it sharpens it." "You still have to have conviction": people decide, dashboards don't, and data must not become a way to deflect responsibility for the call.
- Origin story: a published, elegant EKG finding that was produced by a Visual Basic bug scrambling row order. **"People tell very powerful stories with data. So you'd better make sure the story is true."**
- Goodhart's Law taken seriously: targets get optimised instead of the thing they stood for. "If you want to build a 100-year company, you're not going to get there if you only care about hitting a quarterly target."
- Data team's role is foundations, not decisions: 13 PB/day, heavy investment in data quality and canonical sources of truth; "custodians of context."
- Wide access: internal tools including an MCP for natural-language queries; 90% of non-data employees use data tools monthly, 40% daily. More users means more scrutiny of the data.
- Example: half of new signups are repeat entrepreneurs; second-time merchants earn more than 2× average sales per shop.
- AI framing: models commoditise; the differentiator is "trust in the underlying data" and "correct, objective interpretation."

## Cross-cutting, against aftergrid

- **Meta's two pieces, read together, are the market map.** The agent takes the routine 88%. The first article says the value of a data scientist is the rest: skepticism, challenging assumptions, accountability for the outcome. Meta tools the first and staffs the second. So does everyone else in these notes (Shopify's MCP, Ramp, Vera Tier 1–2, DANA, OpenAI are all access). The second side, the step from an answer to a decision, is done by senior people and is not productised. aftergrid is tooling for that side.
- **Who it fits: Meta ten years ago.** 40 DS for 200 PMs, no depth, no accountability. That ratio is most companies today, and they will not get to 1:1. Meta frames centralised vs embedded as methodology vs accountability, pick one. aftergrid's claim is both without the headcount: the Engine's skills are the standard methodology a central team would give, and the Decision record is the accountability embedding would give.
- **"Show the SQL" stops working at 5×.** Meta's verification model is a colleague reading the query. Five non-data users for every data one cannot do that; neither can Shopify's 90%. A Reader who "can understand, inspect and follow up on a Finding without reading SQL" is the gap, and it widens with every access rollout. "A wrong number presented confidently is worse than no number at all" is their sentence and our problem statement.
- **Recipes / Ingredients is the Engine / Instance split.** "Recipes define what to do, but not what the data means" is ADR 0002 (the Engine holds verbs, never a team's nouns) arrived at independently. 4,500 recipes used 150,000 times says a shareable analysis procedure is a unit people adopt and extend, which backs skills as the launch surface. Snap's 250 skills said the same.
- **Their validations are judged; ours run.** Custom Validations are natural-language rules read by a second model. Checks are runnable assertions with results bound to evidence. Same instinct, different guarantee; worth saying plainly on the page. A Recipe-style natural-language rule is still a good authoring surface for an Operator who then gets a Check generated from it.
- **Ungated context again.** Table descriptions generated from query history and Memories from user corrections go straight into context, like DANA's knowledge note. Anthropic reported that LLM-bootstrapped definitions "encoded the very ambiguities we were trying to eliminate." ADR 0007's Operator approval remains the differentiator; "clone a colleague" is the convenient version of the same risk.
- **Accountability is the unclaimed artefact.** Meta gets it from org design. No agent product in any of the three note sets records whether an analysis moved a decision. Decision record plus outcome plus Revisit is that accountability in a form a small team can keep, and it is what lets single Findings accumulate toward something like Meta's months-long series. aftergrid should not claim the series itself; ecosystem scores and cluster experiments are beyond one Analysis.
- **Shopify's line is the thesis in one sentence.** "Make sure the story is true" is evidence binding, Snapshot hashes and Checks. The row-order bug is the class of error an invariant Check exists for.
- **"People decide" is already in the glossary.** Meta says data cannot be skipped at scale; Shopify says it cannot replace the call; both end with a person deciding. "Whether a Decision still holds is the decision owner's judgement, never inferred by the Engine" is that position. Copy should avoid "data-driven" and "automated insights."
- **The 2× repeat-entrepreneur number is a Claim-type case.** Associational, reads as causal. Declaring type per Claim is the mechanism.
- **"Start with a falsifiable bet"** is Meta's own first lesson and the word the Question already uses. Useful shared vocabulary with exactly the audience that would be Operators.
- **Goodhart is a gap.** Nothing in the Engine notices when an approved Metric definition has become a target. Decided below.
- **Risk to the pitch.** All three pieces locate trust in a person with product context. aftergrid is pitched as making the Operator's judgement legible and re-checkable to a Reader, never as replacing the Operator. Meta's own phrasing, "doesn't replace the data scientist but scales them," is the safe register.

## Decided (owner, 2026-09-17)

- Counter-metric on a Metric definition is in v0. Bead: `ag-counter-metric-fv0`.
- Landing copy moves toward the "make sure the story is true" framing, sharper than that sentence. Candidates in `docs/design/landing-page-directions.md`, "Headline candidates (2026-09-17)". Owner picks: `ag-site-headline-pick-kfa`.
- README does not need to name the target team. Positioning lives in `docs/design/positioning.md` instead: `ag-positioning-doc-hmr`.

## Recommendations from this reading, as beads (2026-09-17)

Promote:
- Reader verification without SQL (the provenance popover) to the section right after the hero, decision log next, install last. `ag-site-reorder-1ts`.
- Decision record: hero run ends with `aftergrid decide`, not "draft ready". Same bead.
- Checks run, they are not judged; definitions approved, not learned; attributed Meta/Shopify quotes. `ag-site-contrast-copy-fwm` (blocked on `ag-shopify-quotes-ta4`).
- Halting and inconclusive as features: show one real inconclusive Claim or halted run. `ag-site-inconclusive-3uk` (blocked on the e-bike Finding, `ag-demo-open-data-qsl.6`).

Demote:
- Install mechanics out of section 3 into the CTA; the skill count out of the h2; SQL-writing as a feature anywhere but the hero foil. All in `ag-site-reorder-1ts` / `ag-site-contrast-copy-fwm`.

Change:
- Problem collage shows the 2026 moment (agent answer in a thread nobody can check), not only the 2019 trail. `ag-site-collage-2026-8cc`.
- Intake requires a decision owner before dispatch; never framed as a ticket queue. `ag-intake-decision-owner-iya`.
- Operator writes a rule in English, Engine runs it as a Check (Meta's validation surface, our guarantee). `ag-english-rule-check-dmf` (v0.1).
- Context mining into proposed table docs and join heuristics, Operator-approved; the largest product risk after v0. `ag-context-mining-8x8` (v0.1).

Leave alone: Engine/Instance split, falsifier vocabulary, "people decide" rule, no-hype copy rules.
