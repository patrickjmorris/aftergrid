# Hands-on scope: one real Finding on the recorded path (2026-09-16)

Scope for the first real Analysis run with the skills, in the Operator's own harness, with no aftergrid adapter. Inputs: `docs/inputs/research-notes-2026-09-16.md` (Vera, Confidence, DANA), ADR 0010, the v0 spec's Spot Sports milestone. This is a scope, not a plan; it will be revised as the run teaches us things.

## Purpose

Test two things at once:

1. **The positioning.** "Go deeper when the agent can't." The self-serve agent answers a question shallowly; the skills take the same question to a Finding a Reader can act on. Vera's tier 3 failure ("stop early and optimistically") is the behavior we're trying to beat.
2. **The recorded path** (ADR 0010). The harness runs every query. aftergrid never touches the source. Does the Finding contract hold, and does a Reader trust the result, when nothing was captured or rerun?

Secondary: find where the skills assume aftergrid owns the SQL and fix those assumptions, and find what the middle of a days-long analysis needs that the skills don't provide (the gap named in the 2026-09-16 review).

## The ask

Verbatim, from the Operator:

> We want to do an analysis on Video Podcasts and try to get an understanding on how they correlate to Apple Podcast rankings (our source for `podcast_rankings`).

Why this one: it is associational by construction, so the Claim-type discipline matters; it relates the Instance's own ranking source to a live product bet (the video podcast linking work), so a Decision record can be real; and "correlate" is exactly the word a self-serve agent will answer with a table and a plausible sentence. The sharpened Question, the definitions and the Reader profile live in the Spot Sports Instance, not here. No Spot Sports schema, metric or id beyond the table the Operator named enters this repository.

**The Reader is a podcaster, and the Finding is public.** It will be published and shared with podcasters, not read by an internal product owner. That sets the Reader profile (a `podcaster` profile the Instance does not have yet), the decision the Finding informs (the podcaster's: whether to invest in video for their show), and the export policy (public; reader-safe projection only; nothing about Spot Sports internals, ranking pipeline mechanics or unpublished product bets in the rendered Finding). Publication needs the human APPROVED attestation path in `docs/contracts/publication.md`, which this run exercises for real for the first time. The Reader session is therefore with an actual podcaster, and the contact route on the Finding is live public exposure.

Candidate decisions `/grill-question` should surface (the Operator settles, not this doc): for the podcaster Reader, whether adding video is associated with ranking well enough to be worth the cost; for Spot Sports internally, whether to weight video availability in discovery ranking or prioritize linking for highly ranked shows. One Finding has one Reader, so the internal decision, if it survives the grill, is a second Finding on the same Question, not a section in this one. Candidate outcome: `needs_reframing` is a valid and likely result for an ask phrased as "correlate", and an associational Claim published to podcasters must not read as causal.

## Harnesses, in order

| Order | Harness | Data access | CLI | What it tests |
| --- | --- | --- | --- | --- |
| 1 | Claude Code | Supabase Postgres via the Operator's existing tools; PostHog MCP | yes | The full chain on the recorded path |
| 2 | Codex / ChatGPT Work | same, via `agents/openai.yaml` skills | yes | Skill parity across harnesses |
| 3 | Devin Data Analyst | MCP marketplace connectors | yes (VM) | The skills as a knowledge note; no plugin install |
| later | Cursor | same as 1 | yes | Not in this round |

All four have a shell, so `aftergrid check` and `render` run everywhere. What differs is how the skills are loaded and which tool runs SQL.

## The comparison

1. **Baseline.** Three plain sessions in harness 1 with the same data tools and no aftergrid skills. Ask the verbatim question each time. Save all three as-is and take the best one forward by the Operator's judgment, recording why. This is the self-serve answer.
2. **Skills.** `/grill-question` on the same ask, then `/analyze` through to a reviewed draft, on the recorded path. Save the Finding.
3. **Reader session.** `docs/design/reader-session-a2f.md` protocol, both artifacts, one podcaster who does not write SQL. Baseline first, then the Finding. Add one question to the protocol: "Would you share this with another podcaster? What would you say it shows?" because the artifact is meant to travel.

We are not measuring correctness against a gold answer. We are measuring whether the Reader can name the denominator, the comparison, the window and a limitation, and pick an action, for each artifact.

## What the run records

Beyond the Finding directory: a log of every point where a skill said "run `aftergrid capture`" or "run `aftergrid execute`" and the Operator had to do something else; wall-clock time per stage; and the three baseline answers verbatim.

The middle of the analysis is recorded in `analysis.yaml#/probes`, extended rather than replaced: every probe, dead end and reframe as a probe entry with what it asked, what it showed, what the plan did about it, and a timestamp; `post_hoc: true` where it was taken after a result was seen. The run tests whether that one list, kept honestly, is enough to see afterwards where the analysis went and why. If it is not, that is the finding about the middle, and the shape of whatever replaces it comes from what the list could not hold.

## Repository changes before the run

- `execute` gains a recorded mode, or a sibling `record`: takes SQL, parameters and a result file the agent produced, pins hashes, sets `guarantees: [artifact_replay]`, records the executing tool in the manifest. `capture` becomes optional. Bead `ag-3cp`.
- `/checked-analysis` step 2 and 7: probe entries accept a timestamp and a `kind` of `exploratory`, `dead_end` or `reframe`, so the middle of the analysis lands in the existing list. Schema change to `analysis.yaml`; small.
- The Spot Sports Instance is scaffolded **by hand** for this run, following `docs/contracts/instance-layout.md`: a `podcaster` Reader profile, a public export policy, and no definitions until the grill proposes them. `aftergrid setup` is not run; the run notes what the hand scaffold needed that `setup` would not have produced.
- `/checked-analysis` steps 3 and 6 get a recorded-path branch written first, adapter path second (ADR 0010). Bead `ag-olp`.
- `/analyze` stops treating a missing adapter as a halt.
- Check outcomes on the recorded path are agent-reported; the manifest and the rendered Finding say so.

Nothing else changes before the run. Anything the run reveals becomes a bead, not a pre-emptive fix.

## Out of scope

New connectors. Revisit. The intake runner. Changes to the reader-facing contact route (it ships as-is on the public Finding, and the session records whether a podcaster can use it). Tier 3 evals (the run produces one data point, not an eval). Any change to the Finding's six sections.

## Learn criteria

The run is useful if it answers: did the skills go deeper than the baseline in a way the Reader could see; where did the recorded path break the contract; what did the Operator need mid-analysis that no skill provided. A run that shows the contract needs revision is a valid outcome.

## Settled 2026-09-16

- Reader: a podcaster; the Finding is public. Instance by hand. Mid-analysis log is `analysis.yaml#/probes`, extended. Baseline is best of three.

## Unresolved questions

- Which podcaster runs the Reader session, and do they have a show in the ranking source?
- Public export: does the rendered Finding name Spot Sports as the publisher, and does it show the ranking source as "Apple Podcasts charts" or as Spot's own ranking derived from them?
- Trusted approver for the publication attestation: the Operator alone, or a second human?
- Does a second, internal Finding on the same Question get scoped now or after the podcaster one lands?

## Next session: start here (updated 2026-09-17)

State as of 2026-09-17: the three gating beads landed (`ag-3cp` record command and `docs/contracts/record.md`, `ag-olp` recorded-path skills, `ag-3ce` probe kinds with `at`), and `examples/nyc-open-data` holds two Findings produced by `/analyze` in a real Claude Code session on the adapter path, which is the reference run for what a completed chain looks like. Nothing in the Spot Sports Instance exists yet.

Epic `ag-video-podcast-finding-e6e`, children in dependency order:

1. `.1` scaffold the Spot Sports Instance by hand: `podcaster` Reader, public export policy, no adapter. Ready now.
2. `.2` three self-serve baselines, verbatim, best of three. `.3` `/grill-question` on the verbatim ask. Both unblock after `.1`.
3. `.4` `/analyze` on the recorded path, probes kept as they happen, run-log of adapter assumptions.
4. `.5` reader session with a podcaster, both artifacts, plus the share question. `.6` the first real public publication path.
5. `.7` retro on the middle of the analysis; it opens the follow-up beads and unblocks `ag-tier3-depth-eval-bv2`, `ag-diagnosing-metric-change-8c2`, `ag-analyze-reanchor-1wo`, `ag-instance-tables-catalog-4ie`.
6. `.8` deferred internal second Finding; owner decides after `.5`.

Beside the epic: `ag-harness-codex-eln` and `ag-harness-devin-vw6` (parity, after `.4`), `ag-positioning-go-deeper-8gu` (copy; coordinate with whoever holds `site/`).

Prior beads this run serves rather than duplicates: `ag-manual-real-finding-db2` and `ag-first-real-finding-rdo`. The next agent decides whether the video-podcast Finding closes them or they stay for a second real Finding.

Owner questions each bead names are asked at the step that needs them, not up front. Context: `docs/inputs/research-notes-2026-09-16.md`, ADR 0010, the reader-session protocol, and the 2026-09-16 review conclusion that the skills cover the start and the end of an analysis and not the middle.
