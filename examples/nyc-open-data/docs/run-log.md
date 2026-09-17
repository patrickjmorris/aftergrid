# Run log: `/analyze` on the NYC open-data Instance

What the hands-on scope asks for: every point where a skill said one thing and the Operator had to do another,
every dead end, timestamped, so the middle of the run is visible afterwards. One section per run. Transcripts
(stream-json) are kept outside the repository in the session's scratch directory; what is recorded here is what
they showed.

## Run 1 — 2026-09-17T15:05:44Z to 15:11:29Z (5 min 45 s, 37 turns, $5.68)

Invocation: headless Claude Code from the Instance root, `claude --plugin-dir <repo> --permission-mode acceptEdits
--allowedTools Bash(aftergrid:*) Bash(node:*) … Read Write Edit Glob Grep --max-budget-usd 40 -p "/analyze <raw ask>"`.
`analytics/golden/` was moved out of the Instance for the duration so the model could not read the answer key.

Outcome: **no Finding**. The run stopped in `clarify`, `finding.outcome` still `pending`.

What happened, in order:

1. `aftergrid new finding` ran and scaffolded `findings/2026-09-17-crz-trips-after-pricing/` (manifest, memo).
2. `aftergrid capture --tables crz_daily,weather_daily,trips_sample,build_provenance` ran **before** the Question
   was clarified. The skill orders clarification first; the model captured first. Harmless here (capture sets no
   guarantee) but out of order, and it captured `trips_sample` (93,739 rows) that no Claim was going to read.
3. Every write into the Finding directory was refused by the harness: `analysis-progress.yaml`, `checks/`,
   `checks/*.sql`, via the Write tool and via `printf >`/`mkdir` in the shell. Denial text: *"Claude requested
   permissions to edit <path> which is a sensitive file."* Sixteen refusals across eight paths.
4. The model did not route around the refusal (no copies, no CLI flags) and reported the block. It could not
   write the halt artifact either, because that artifact lives in the same directory.
5. The model noticed that `analytics/README.md` carried the goldens' reference values ("so the weather threshold
   is not blind") and said it would record that in `analysis.yaml`. It was right: the Instance README leaked the
   answer key even with `golden/` held out.

Skill and Engine gaps this run exposed (each is a bead or a fix, not a note):

- **A permission block is neither `needs_input` nor `needs_attention`.** `/analyze` has no halt state for "the
  harness refused to write", and the halt artifact cannot be written when that is the block. The skill needs a
  third state that is reported through the run's own output (stdout/exit), and the nightly command analyzer must
  read it as infrastructure, not as an analytical failure.
- **The nightly template (`--permission-mode acceptEdits`) would hit the same wall.** Run 1 used the same mode.
- **Reference values must never live in the Instance's own README.** Moved to `golden/README.md` after run 1.
- **Clarify before capture.** The skill says so; the model did not. Worth a Check the reviewer can see rather than
  a sentence in prose: an `analysis.yaml` with `stage: clarified` should exist before `inputs/` does.

Numbers read by the model during run 1: none (no query ran; the captured CSVs were listed, not queried).

### Root cause of the run-1 block, established by probes (each a 4-turn headless session, ~$0.60)

| Flags | Write into `findings/<x>/checks/` | Write elsewhere in the Instance |
| --- | --- | --- |
| `--permission-mode acceptEdits` alone | ok | ok |
| `--add-dir <repo>` + acceptEdits | ok | ok |
| `--plugin-dir <repo>` + acceptEdits | **denied, "sensitive file"** | **denied** |
| `--plugin-dir <repo>` + acceptEdits + `Write(//<instance>/**)` `Edit(//<instance>/**)` allow rules | **denied** | **denied** |
| `--plugin-dir <repo>` + `--permission-mode bypassPermissions` | ok | ok |

Loading the aftergrid plugin with `--plugin-dir` turns every write in the session into a "sensitive file"
refusal that no allow rule lifts; only bypass mode writes. The cause inside Claude Code is not established here
(the plugin ships no hooks configuration; `hooks/claude-code/aftergrid-guard.mjs` is installed by `aftergrid hook
install`, which this Instance skipped). Run 2 uses bypass mode with the model instructed to stay inside the
Instance. The nightly template must do the same or find the real cause: bead `ag-analyze-permission-halt-pr7`.

#### Re-probed under `ag-analyze-permission-halt-pr7`, 2026-09-17, `claude 2.1.274`

Four more probes, each a headless session bounded by `--max-budget-usd 2` (this CLI version has no
`--max-turns`), asking for one file to be written into a throwaway copy of `fixtures/instance`:

| Flags, all with `--plugin-dir <repo>` | Into `<instance>/probe/checks/` | Into `<instance>/findings/<slug>/checks/` | Cost |
| --- | --- | --- | --- |
| `--permission-mode bypassPermissions` | ok | — | $1.09 |
| `--permission-mode dontAsk` | **denied** — "Permission to use Write has been denied because Claude Code is running in don't ask mode" | — | $0.58 |
| `--allowedTools "Write" "Edit" "Bash(aftergrid:*)"` (no mode flag) | ok | ok | $0.56 + $0.57 |
| `--permission-mode acceptEdits` | — | **ok** | $0.56 |

So `dontAsk` is unusable, and **run 1's refusal did not reproduce**: at this CLI version, at the same shape of
path, `acceptEdits` + `--plugin-dir` wrote into a Finding directory without complaint. The cause of run 1 is
still not established — a version, an environment or a settings difference nobody has isolated — and the nightly
template now uses `bypassPermissions`, the one mode with evidence of writing under both conditions
(`docs/contracts/eval.md`, "What the headless run needs"). The block is no longer silent either way: `/analyze`
halts with `permission_denied` and prints it as the last line of its output, and the eval records that as
infrastructure rather than as a wrong answer.

## Run 2 — 2026-09-17T15:15:14Z to 15:23:07Z (7 min 53 s, 28 turns, $5.78)

Same invocation as run 1 except `--permission-mode bypassPermissions` (see the probe table) and `/analyze` pointed
at the Finding run 1 had scaffolded. `golden/` held out again; the Instance README no longer carried the goldens'
numbers (one stray figure remained at the time of the run, found by the model and logged in its `analysis.yaml`;
removed afterwards).

Outcome: **halted `needs_attention` at `checked_analysis`, recommended outcome `inconclusive`.** No memo, no
charts, no review. The Finding directory holds the clarified `analysis.yaml`, six queries with results executed by
the DuckDB adapter on retained extracts (`aftergrid execute`; `check --mode rerun` reproduced all six exactly),
five Checks (four passed), and `analysis-progress.yaml` naming the Operator as the one who decides.

What the data showed, per the model's own report:

| | Jan 2024 | Jan 2025 |
| --- | --- | --- |
| Trips into the zone, month | 9,037,182 | 9,277,575 (+2.7%) |
| Per weekday | 276,803 | 291,496 (up) |
| Per weekend day | 333,838 | 321,645 (down) |
| Yellow / HVFHS | 2.12M / 6.92M | 2.49M / 6.78M |
| Zone share of all trips | 39.9% | 38.8% |
| Weather-comparable day pairs | 10 of 31 | |

Why it halted: the pre-registered falsifier (`falsifier_direction_holds_by_day_type`, written before any total
was computed, `required: true`, expected `pass`) says the Answer is wrong if weekday and weekend per-day averages
do not move the same way as the monthly total. They did not. The model did not loosen, un-require or flip the
Check after seeing the result, and said so. `aftergrid check` therefore reports `check_failed` as an evidence
error, and `render` refuses any Finding with an error, so the halt cannot even be rendered as a draft.

Gaps this run exposed:

- **A failing pre-registered falsifier is a Finding outcome, not an evidence error.** The contract
  (`checks-and-results.md`) makes `required: true` Checks a validity condition and lets a failing `minimum_data`
  Check be a business result; it says nothing that lets a failing falsifier become `inconclusive` and still be
  written, reviewed and rendered with the failed Check shown. The skill let the model mark the falsifier
  `required`. The honest Finding here is "inconclusive: the month rose, weekdays rose, weekends fell, the zone's
  share fell, and the two Januaries are not weather-comparable" — and today that Finding cannot exist.
- **Golden vs run.** The golden expects `answered`. The run's falsifier was stricter than the golden's
  reasoning. A golden should say which pre-registered falsifiers it accepts, or accept more than one outcome
  when the falsifier choice decides it.
- **The `weekday_share` definition names `trips_daily`**, which cannot be captured; the model applied its rule
  to `crz_daily` and logged it. The definition should name the bounded table.
- **`trips_sample` was captured (6.8 MB) and never read** by any Claim. Capture-before-clarify again.
- The Operator decision the run asks for: accept `inconclusive` as it stands, or open a new revision with weekday
  and weekend as separate pre-registered Questions. Not taken by the agent.

## After `ag-falsifier-outcome-cov` — re-checked 2026-09-17, no file in the Finding touched

The contract changed under the run-2 Finding: a `kind: falsifier` Check is no longer an evidence-validity
condition, a falsifier that records the outcome it did not expect is an analytical fact, and `render` no longer
refuses a Finding over one. `examples/nyc-open-data/analytics/findings/2026-09-17-crz-trips-after-pricing` is
committed run output and was **not edited** — what `aftergrid check --mode artifact` says about it now is the
evidence that the change landed.

What it reports today (verbatim categories and locations):

| | Before | Now |
| --- | --- | --- |
| `checks/falsifier_direction_holds_by_day_type` | error `check_failed` — "required Check … outcome fail" | error `check_shape` — "falsifier Check … declares `required: true`", remedy: falsifiers decide the outcome, not validity |
| the same Check, as a fact | nothing | warning `falsifier_failed`, carrying the Question's falsifier statement in full, plus an info line saying the honest Finding is inconclusive or needs_reframing |
| `manifest.yaml#/definitions/1` (`weekday_share`) | no error | error `hash_mismatch` — the definition was edited (it now reads `crz_daily`, the bounded table, as run 2 said it should) and this Finding pins the version it actually read |
| overall | syntax ok, content incomplete, evidence invalid | unchanged: syntax ok, content incomplete, evidence invalid, publication not_ready |

So the halt is still a halt, and for a better-stated reason: the complaint is no longer "your falsifier failed"
but "your falsifier was declared a validity condition, and it is not one". There is no longer any rule that
stops the honest Finding from existing — the same Check recorded `fail` with `required: false` and
`finding.outcome: inconclusive` reports **no error**, one `falsifier_failed` warning, and renders, with the
falsifier as its own line on the page ("Falsifier: … — recorded fail; this Finding is inconclusive"). That is
covered by `fixtures/negatives/falsifier-failed-inconclusive` and by `src/render.test.ts`.

**What a revision (r2) would change**, if the Operator takes it — none of this is done here:

1. `checks[falsifier_direction_holds_by_day_type].required: true` → `false`. The Check's SQL, its threshold and
   its `expected_outcome` are **not** touched; it recorded `fail` and that stands.
2. `finding.outcome: pending` → `inconclusive`, `finding.state: draft` → `complete`, and the Claims and memo
   written by `/write-finding`: the month rose, weekdays rose, weekend days fell, the zone's share of all trips
   fell, and the two Januaries are not weather-comparable. The Answer sentence says the Question is not settled
   and names what the falsifier asked and what the data showed.
3. `definitions[weekday_share].content_hash` re-pinned to the current `weekday_share.md`, or the Analysis rerun
   against it. Version stays 1: the rule did not change, only the table it reads.
4. `coverage.data_from`, `data_to` and `description`, which are still the `new finding` scaffold sentinels.
5. `analysis.yaml#/checks_preregistered` filled in, so a reviewer can see mechanically that the falsifier is the
   one written before any total was computed. Run 2 established that from the probe timeline only.

`scripts/examples-check.mjs` accepts this tree because the recorded halt accounts for every error: the two
Check-level categories at the Check its `reason` names, and a definition pin that moved because the Instance's
own definition file did. A hash mismatch on a **result**, an **input** or the content digest is still fatal
there — that would be tampered evidence, and no halt excuses it.

The golden was updated in the same change: `crz_trips_jan2025_vs_jan2024` now accepts
`[answered, inconclusive]` with `falsifier_dependent: true`, because which one is honest is decided by the
falsifier the Analysis pre-registers, and grading only `answered` would have scored run 2 down for writing the
stricter falsifier. The `must_state` list is unchanged.

### Amendment, 2026-09-17: the definition-pin tolerance is bounded, and this run's record now names its definition

A review of the falsifier contract (bead `ag-falsifier-outcome-cov`) found that tolerance unbounded: it accepted
a moved pin on *any* definition, including one that moved for a reason nobody wrote down. It now requires the
record to name the definition, either in the halt `reason` or in a `stale_definitions: [<id>, …]` list. So
`analysis-progress.yaml` in this Finding gained one field, `stale_definitions: [weekday_share]`, and nothing
else: the `reason` prose is run 2's own words and stays verbatim.

That field was added rather than the `reason` rewritten because **`analysis-progress.yaml` is a progress file,
not evidence**. It records where a run stopped and who decides next; it is outside the content digest envelope
(`src/digest.ts` hashes the manifest, `memo.md`, and the query, Check, chart and result files it names), so
adding a field changes no hash, no attestation, no recorded number and nothing `check` verifies. The run output
proper — the manifest, the six results, the five Checks and their outcomes — is untouched, as it has to be.

The same review also removed `analytical_outcome` from the categories a halt can excuse. That category means a
Finding still records `answered` over a falsifier that fired, which is the publication the contract exists to
stop; a halt is not a place to park it. This Finding never had one: it records `pending`, not `answered`.

### Root cause of the run-1 block, established (2026-09-17, claude 2.1.274)

Two more probes, same flags (`--plugin-dir <repo> --permission-mode acceptEdits`), same version, one file each
(~$0.56 each): a Finding in a temp directory **outside** the repository was written; the same write into
`examples/nyc-open-data/analytics/findings/` **inside** it was refused as "a sensitive file". Claude Code
protects the tree of a plugin loaded with `--plugin-dir`, and this Instance lives inside that tree. That is why
run 1 failed and why an earlier probe that used a temp Instance could not reproduce it. Consequence: the nightly
runner (temp Instance) uses `acceptEdits`; runs of this in-repo demo Instance use `bypassPermissions`, or the
plugin should be loaded from a copy outside the repository.

## Run 3 — 2026-09-17T17:18:49Z to 17:46:47Z (28 min, 171 turns; usage reported as ≈$29 at API list price)

Operator decision (Patrick Morris): reframe, weekday and weekend as separate Questions. Same invocation shape as
run 2 with two changes: the plugin was loaded from a **copy outside the repository** (`--plugin-dir <tmp copy>`),
which lets `--permission-mode acceptEdits` write into this in-repo Instance (the run-1 refusal was Claude Code
protecting the loaded plugin's own tree), and the database had been rebuilt with `build-data.mjs/2.0.0` (the
`trips_daily` hash is unchanged; `crz_daily` and `weather_daily` hashes match revision 1's captures). `golden/`
held out again.

Outcome: **complete, `inconclusive`, evidence valid, revision 2.** `aftergrid check --mode rerun` reproduced
all six results; three agent reviews, no blocking findings, 25 non-blocking; rendered draft; nothing published.

- Revision 1 archived under `revisions/1/` by `aftergrid revise --pin`; the reframe is probe `p_reframe_day_types`,
  marked post hoc, naming run 2's falsifier result. Every Claim carries `pre_registered: false`.
- New falsifier, pinned in `analysis.yaml#/checks_preregistered` (SQL hash, `required: false`, expected `pass`,
  statement hash) at 17:26:49Z, before any query existed: the weekday direction must hold within day pairs
  matched on day of week, non-holiday and comparable weather. It recorded **fail**: over the whole month the
  average weekday had 5.3% more trips into the zone; among the 5 matched weekday pairs, 5.4% fewer. The weekend
  side was not evaluable (1 of 8 pairs weather-comparable, gate 3). The zone's share of all trips fell on both
  day types (weekdays 39.2% → 38.3%, weekends 41.7% → 40.3%).
- The model's own choices, recorded as unverified assumptions: the holiday dates and the 5-pair / 3-pair gates.
  After the result it noticed two of the five matched pairs sit right after New Year; recorded as a limitation,
  the Check unchanged.
- `trips_sample` dropped from the Snapshot (no query read it); its CSV and revision 1's Check and query files
  stay on disk unreferenced. Revision 1's queries/Checks/results were not copied into the archive because the
  harness refused a `cp`; they remain in git history (77435a5).
- Reviewer items worth a human's eye: the Answer sentence is ~90 words; it does not say only yellow and app-based
  trips are counted; the chart highlights the whole-month weekday rise the Finding says did not hold.

Cost note: every run here ran on a claude.ai Max subscription (`apiKeySource: none`); the dollar figures in the
CLI's JSON envelope are estimates at API list price, not charges. Run 3's volume was the plugin and contract
context re-read on each of 171 turns.

## Citi Bike run 1 — 2026-09-17T18:10:08Z to 18:40:41Z (30 min; Opus; usage reported as ≈$29 at API list price)

Ask: "Are Citi Bike members riding e-bikes more than they were a year ago?" Reader `bike_product_manager`. Plugin
copy + acceptEdits, goldens held out, `--model opus` (owner's choice).

Outcome: **halted `needs_attention` at `analysis_review`**, with a complete, evidence-valid draft behind it.
`answered`: e-bikes were 69.2% of member rides in January 2025 against 62.8% in January 2024 (1,329,923 vs
1,055,584 member e-bike rides on a member total that rose from 1,679,647 to 1,922,501). Falsifier pre-registered
at 18:12:36Z before `clarified_at` and before any query, `required: false`: **passed**. Weather Check failed as
designed (10 of 31 aligned days comparable). Adapter path; rerun reproduced all six results.

Why it halted: the method reviewer found that all four `percent_change` derived values were written with the
operands in baseline-then-after order, so every rendered percent change carries the opposite sign ("rose by
−20.6%"). `aftergrid check` cannot see this: both operand orders are valid arithmetic. The model did not ship the
draft and named the one-line fix. That is the review stage doing its job.

Also flagged by two reviewers: the memo says the weather bar was "set before any weather number was read" while
`analysis.yaml` records (probe `p_weather_result_known_in_advance`) that the likely outcome was known from the
neighbouring Finding on the same two months. Disclosed in the record, not to the Reader.

Gap for the Engine: a percent-change operand order the arithmetic cannot check. Worth a `derived` convention
(`after` and `baseline` named operands, not positional) so the sign is a declared fact the Engine can verify.

Resume (run 2) instructed to apply the fix, carry the weather disclosure into the caveat, and finish.

## Citi Bike run 2 — 2026-09-17T18:41:46Z to 18:52:17Z (10 min; Opus; ≈$22 at API list price)

Resume with the Operator instruction to apply the method reviewer's fix. `revise --classify` refused (no pinned
baseline on revision 1) and `--apply` treats an operand change as `numeric`, so the draft was edited in place and
re-pinned, which is what the halt reason prescribed for an unpublished revision 1. No query, Check, result or
the pre-registered falsifier changed; a post-hoc probe records the repair. Rendered values now: member e-bike
rides +26.0%, member total +14.5%, classic −5.0%, casual total −3.0%. The weather disclosure (the bar's likely
outcome was known from the neighbouring Finding) now sits in the material caveat beside the Answer.

Three current reviews at the final digest `fa002688`, no blocking findings. The manifest also keeps the three
round-1 reviews at the earlier digest, and `review status` warns `stale_review` on each of those by index, plus a
second trio of warnings without an index. The Operator (this session) misread that as "all reviews stale" and
launched run 3 to redo them.

Gap: superseded reviews are history, not staleness; `review status` should say "superseded by the review at
the current digest" and reserve `stale_review` for a kind with no current review.

Amendment 2026-09-17 (bead `ag-review-superseded-rsk`): landed. `check` and `review status` share one per-kind
computation (`scripts/lib/review-currency.mjs`); a superseded review is `review_superseded` info naming the
review that replaced it, `stale_review` is raised at most once per kind against its newest review, and the
rendered page lists superseded reviews once as earlier reviews instead of as warnings. The review tree this run
built is reconstructed as a test in `src/eval.test.ts`, which asserts `reviews: 3 current, 3 superseded, 0
stale`, no `stale_review` warning and exit 0. The Finding itself was not committed, so nothing here re-reads it.

## Citi Bike run 3 — 2026-09-17T18:53:31Z to 18:56:41Z (3 min; Opus; ≈$2)

Instructed to re-run the three reviews. The run read the manifest, found reviews 3–5 already at the current
digest, showed that `review record` would dedupe on (kind, reviewer, digest) and write nothing, and stopped
without spending on reviews that could not be recorded. The refusal was correct; the instruction was not.
