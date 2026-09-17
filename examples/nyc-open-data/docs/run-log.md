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
