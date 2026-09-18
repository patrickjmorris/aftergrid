# Monetization brief and pressure test, 2026-09-17 (session CobaltMouse)

Context for whoever picks up the `monetization` beads. Owner: Patrick Morris. Nothing here is a decision unless
marked as the owner's. The full brief is a published artifact (private, owner's account):
<https://claude.ai/artifact/U3hwKUNTNvaLBsqf2jo2Rk> (v3). This file records what the brief says, what a
pressure test found wrong with it, and the corrected sequence. The beads point here.

## Owner's framing

- Aftergrid need not be monetized as SaaS, but revenue should be explored from day one: consulting on AI data
  operations, sponsorship, advertising, anything that works.
- The owner has little time for monetization right now. How much depends on job interviews: a job soon means
  very little time; no job means a lot more, and cash matters.
- Working rules that hold: the Engine stays MIT; nothing commercial inside a rendered Finding; no paid party
  touches a metric approval or a capability status; client Instances stay private; every engagement records a
  sanitized study observation.

## The 30 ideas and their verdicts (brief v3)

Keep: 1 First Finding engagement · 2 Metric Definition Audit · 3 data-ops retainer · 5 "Analysis CI" workshop ·
8 sponsored adapter program · 12 public Findings gallery (+13 newsletter folded in) · 18 hosted Reader link ·
20 starter packs w/ paid approval session · 23 data-agent trust benchmark · 26 PostHog partnership ·
28 Anthropic programs (credits, plugin marketplace).

Fold: 9 GitHub Sponsors (into 8) · 13 newsletter (into 12) · 17 mini-book (into 5) · 19 hosted Revisit
scheduler (into 18) · 27 MotherDuck partnership (into 8).

Later: 6 enterprise support subscription · 29 consultancy referral channel.

Reject: 4 fractional Head of Data · 7 paid independent Finding review (conflicts with the PR-review trust source)
· 10 grants · 11 bounties · 14 podcast · 15 video/affiliate · 16 job board · 21 marketplace of "verified"
definitions (contradicts ADR 0007/0002) · 22 open core / dual licence · 24 white-label render licence (MIT
already permits) · 25 paid GitHub App · 30 Operator certification.

## Pressure test (2026-09-17): what the brief gets wrong

A cold reviewer agent read the brief against the repo; each finding below was verified in the repo by me.

### Stale or false premises

1. Repo state: 157 commits, 10 ADRs (brief says 56 / 9). ADR 0010 makes the **recorded** path the default
   (harness runs SQL, `aftergrid record` saves it; adapters are an upgrade). `check --mode rerun` refuses
   recorded Findings by name (`src/commands/check.ts:73`). The brief's acceptance script requires
   `sql_execution: performed` under rerun: **not acceptable for most clients**.
2. Package smoke bead `ag-distribution-dq4` is **closed**. The brief gates PLG on it. The real gate is npm publish
   and public activation, which per README/`ag-external-release-readiness-4zn` need the formative study plus the
   owner's explicit release instruction.
3. Public demo already exists: owner decided (2026-09-17) `examples/nyc-open-data/` in-repo; two real Findings
   are merged (`2026-09-17-crz-trips-after-pricing`, inconclusive by pre-registered falsifier; and
   `2026-09-17-member-ebike-share-jan2025`, answered), awaiting owner PR approval (`ag-demo-attest-ready-8st`).
   The brief's separate "gallery repo with Finding zero" is superseded; the gallery *is* the demo Instance.
4. `README.md` line 5 says "the repository is private"; `gh repo view` says PUBLIC. Fix before pointing anyone at
   it.
5. `docs/design/fanout-review-2026-09-16.md`: 49 defects incl. P1 in `decide` (record without `id` silently
   dropped) and P1 in publication policy (a Finding directory can ship its own `aftergrid.yaml` and self-approve
   to `ready`). The acceptance script and any hosted publication rest on these. Check bead status before relying
   on either command in a contract.

### Findings that change the plan (ranked)

1. **"Paid engagement = release gate" is false.** The gate (v0 design; bead `4zn`) needs ~5 non-data Readers
   and 2–3 practitioners across a correct, an inconclusive and a *controlled-misleading* Finding with debrief;
   an outside Operator who connects data *and corrects a definition*; a second voluntary use. A paid client gives
   one Reader, one Finding, and you as the Operator. The study is a separate, unpaid ~15h task, absent from all
   30 ideas, and it gates publish → PLG. Do it first.
2. **Prices don't fit the buyer.** $12–15k for one memo to a 5–40 person startup with no data team, from a
   project with 0 stars, no npm, no case study. "Scarcity pricing" at $15k with zero demand is a number nobody
   sees. Corrected: first 2–3 engagements free-for-consent (study participation + case study) or $3–6k pilots
   to network founders. $12k is a year-two price.
3. **Low-time path earns ~$0, not $20–50k.** Inbound-only via a demo with no traffic. Honest framing: portfolio
   for interviews plus the study; revenue ≈ 0 for six months. Delete that table.
4. **Job branch keeps invoicing it can't do.** Retainer is called a conflict, but $15k engagements and a Stripe
   link stay, with the selling entity unresolved. Corrected: job branch = zero-invoice only (demo, plugin
   listing, GitHub Sponsors as an individual, grants, credits). Entity, terms and tax before any payment link;
   read any offer's IP/outside-work clause and negotiate an aftergrid carve-out by name.
5. **Hours ignore the defect rate and data access.** 50h/engagement assumes the CLI works on a stranger's data;
   the first real Finding on the owner's own data has not merged. Read-only role, capture, PII in retained inputs
   the consultant holds, DPA: none costed. Realistic first engagement 100–150h, so $60–100/h, not $220.
6. **Acceptance script over-demands.** `readiness: ready` needs a client GitHub repo, a separate automation
   account opening the PR, an allowlisted approver at the exact SHA, CODEOWNERS and branch protection on
   `aftergrid.yaml`; the live GitHub path is tested with fakes only. SOW should accept `check` passing on the
   recorded path (`syntax ok`, `content complete`, `evidence valid`) plus a verified Decision record;
   attestation optional; never `--mode rerun` in a contract.
7. **Hosted Reader link: flat compliance cost, $150–450/mo revenue.** Reader-safe HTML still embeds aggregates
   (ADR 0006). Holding 5–15 Operators' client data means DPA, deletion, breach duty, for $29 each. Corrected:
   `aftergrid publish` to the Operator's *own* bucket or Pages with the successor-version header and
   `--withdraw`. Same PLG hook, no liability. No `publish` command exists today.
8. **Rejections flip per branch.** Grants and GitHub Sponsors were rejected for latency/size; in the job branch
   they are the only zero-invoice money. Fractional Head of Data (04) was rejected as "consumes the maintainer";
   in the no-job branch "two retainers" *is* 04, and it is the highest $/h with the least Engine risk. Rank per
   branch, not one list with footnotes.
9. **Trust benchmark: reject, not defer.** The named buyers run their own evals; the golden set is our own
   fixtures; every foreign harness would need a shim we write. Research artifact, not a product. Starter packs'
   trigger ("after three audits") never fires on the low-time path.
10. **PostHog capability matrix is its own ~12h task**, not "4h on the side of the podcast Finding": that
    Finding is recorded-path via the PostHog MCP with no adapter, and no test touches the managed warehouse.
11. **Async audit without the interview** reproduces the LLM-bootstrapped-definition trap ADR 0007 warns
    about. Keep the one-hour owner interview.
12. **Retainer at $6k for two Findings is $3k/Finding against a $12k First Finding.** Clients will wait for
    retainer pricing. Reprice or reframe before publishing either.

### Missing from the 30

- The unpaid formative study itself.
- Free-for-consent pilots: first 2–3 teams free in exchange for study participation and a case study.
- Fractional/agency data people as *the Operator*: "aftergrid is your delivery format", sold to people who
  already invoice founders. Stronger than the referral channel (29).
- Vendor-sponsored public Finding on the NYC demo (MotherDuck or PostHog pays for one Finding and gets a named
  sponsor line on the site). Sponsorship without an adapter build.
- Job branch: the employer as the outside Operator, if the IP carve-out allows.

### What survives the pressure test cleanly

README "work with me" (as a pilot offer, no price until the entity is settled) · sponsors page + `FUNDING.yml` ·
credits application · plugin marketplace listing after publish · the demo Instance (already the owner's) ·
self-hosted `publish` · PostHog matrix as its own task · free workshop kit · no open core · no commercial
content in Findings · sponsor placements only on site/docs chrome.

## Corrected sequence (both branches share it)

1. Fix the README visibility line.
2. Formative study with existing renders (fixture onboarding-checklist Finding = correct; NYC congestion Finding
   = inconclusive; a negatives fixture rendered as a labelled draft = controlled-misleading). ~15h, unpaid,
   5–8 people. Sanitized observations per `docs/design/reader-session-a2f.md`.
3. Entity, terms, DPA template decided by the owner.
4. Publish npm + plugin marketplace listing (owner's release instruction).
5. Then sell: pilots free-for-consent or $3–6k; sponsors page live; PostHog matrix published and one email.

Per branch after the trigger (offer signed, or ~6 weeks with no offer):

| | Job lands | No job |
| --- | --- | --- |
| Money | Zero-invoice: Sponsors as individual, grants, credits | Pilots → $12k engagements once a Reader is quotable; fractional/retainer for up to two clients as runway |
| Time | Demo, listing, self-hosted publish | Full sequence, outbound to ten network founders, workshop sold |
| Skip | All invoicing, retainer, workshop delivery | Benchmark, hosted link |

## Pricing assumptions (unconfirmed; change freely)

Pilot $3–6k or free-for-consent · First Finding $12k (year two) · audit $3.5k with a 1h interview ·
retainer $6–8k/mo, reprice against the engagement · workshop $7.5k remote · sponsored adapter $8k one-time /
$20k/yr (speculative) · sponsored open-data Finding $3–5k · async pack review $750.

## Bead map

Epic `ag-monetization-sd9`. Children, in the corrected order:

| Bead | P | Who | Blocked by |
| --- | --- | --- | --- |
| `ag-readme-visibility-k8w` | 1 | agent | — |
| `ag-formative-study-plan-hb4` | 1 | owner recruits, agent prepares packet | — (it blocks `4zn`) |
| `ag-entity-and-terms-lf8` | 1 | owner | — |
| `ag-services-offer-docs-e0c` | 2 | agent | `lf8` |
| `ag-sponsor-terms-6we` | 2 | agent | — |
| `ag-posthog-capability-matrix-1u0` | 2 | agent prepares, owner runs probe | — |
| `ag-brief-v4-per-branch-xvy` | 2 | agent | — |
| `ag-anthropic-credits-listing-7tk` | 3 | owner (credits now), agent (listing) | `4zn` |
| `ag-publish-self-hosted-31n` | 3 | agent | `91e` |
| `ag-workshop-kit-free-gxe` | 3 | agent | — |
| `ag-sponsored-open-data-finding-8at` | 3 | agent drafts, owner sends | demo `.5`, `6we` |
| `ag-out-of-scope-record-ckl` | 3 | agent | — |
| `ag-starter-pack-consumer-subscription-24z` | 4 | agent | `e0c` (two audits done) |
| `ag-operator-channel-research-o3x` | 4 | agent | `hb4` |
| `ag-grants-sponsors-individual-900` | 4 | agent prepares, owner submits | — |

Ready for an agent with no owner input: `k8w`, `6we`, `xvy`, `gxe`, `ckl`, and the packet half of `hb4`.

## Open questions for the owner

- Entity before any payment link: sole prop or LLC?
- Free-for-consent pilots acceptable, or must the first engagements be paid?
- Fractional Head of Data back in as the no-job branch's first move?
- Trigger date for the branch: six weeks, or tied to a specific interview loop?
- Any offer on the table with an IP or outside-work clause to read now?
- Study participants: 5–8 people recruitable this month?
