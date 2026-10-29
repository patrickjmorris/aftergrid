# Review of /tmp/aftergrid-run3 (reviewer: opus)

Scope: the Reader and Materiality lenses from `skills/analysis-review/SKILL.md`, checked against the brief shape in `skills/make-the-call/SKILL.md`. One agent did both passes, one after the other. Method and Question were not reviewed in full. I raise a Method point only where it changes what the owner should do. Queries are in `/tmp/opus-rv-scripts/` and ran read-only against `/tmp/aftergrid-eval/data/videos.sqlite`.

## Bottom line

The yes/no answer holds up: long-form views per video went up by more than 25%. Every variant has a point estimate of at least +46%. The recommended action does not hold up as written. The action is "multiply long-form counts of videos published before Aug 24 by about 1.77". The factor is the wrong summary of the effect for a per-video restatement, and the Aug 24 cutoff mis-scales the videos near the switch. Both problems are material to the recommendation. Neither is material to the >25% call.

## Shape checks (pass)

- Length: the owner message is 252 words (`awk` between "## Message to the owner" and "## Working" piped to `wc -w`). That is at the ~250 limit, and the working sits below it.
- Headline: about 25 words, and the owner could repeat it. See finding 5 for one way it can be repeated with the wrong meaning.
- Invented values: none found. Cost and reversibility read "unknown". The rerun date comes from the refetch cadence at day 29, and the 1.25 trigger is the owner's own threshold.
- Numbers checked against the data:
  - I reran `crosscheck.sql` (fmt=0, age 28-30) and got 746 channels, 13,254 pre videos, 23,962 post videos, ratio 1.7711. This matches the report.
  - The ranking shares (64.4%, 77.3%, 60.4%), the stock figures (+11.4%, +0.4% to +3.0%), the null range (0.81 to 1.00) and the lowest variant (1.4563, equal weight per channel) all match the CSVs.
  - Small error: the brief calls the ranking pool "June to September" videos. My query (`q3.sql`) shows the pool is videos published 2026-05-08 to 07-26 and 2026-08-31 to 09-29.

## Findings

### 1. The 1.77 factor is the wrong summary for a per-video restatement. Its interval understates the uncertainty. (material)

- **Location:** owner message, option 1 ("multiply … by about 1.77"); working §5, option 1 risk ("off by 9% to 11%").
- **Evidence:**
  - 1.77 is a ratio of totals, so it weights each video by its views. A ranking compares individual videos.
  - I reweighted post videos to the pre-period channel mix, using the same matched sample as the cross-check (`q2.py`). The post/pre ratio by percentile is:

    | Percentile | p25 | p50 | p75 | p90 | p95 | p99 | p99.9 |
    | --- | --- | --- | --- | --- | --- | --- | --- |
    | Post/pre ratio | 2.35 | 2.02 | 1.82 | 1.87 | 1.89 | 2.14 | 1.08 |

  - From p25 to p99 the lift is 1.82 to 2.35, above 1.77 at every percentile. Trimming the extreme tail moves the ratio of totals only to 1.79–1.82, so the difference comes from the choice of summary, not from a few outliers.
  - The report's own estimators bracket the factor widely (`sensitivity.csv`, `primary_lift.csv`):
    - equal weight per channel: 1.46
    - ratio of totals: 1.77
    - median video: about 2.0
    - typical (geometric) video: 2.43, interval 2.03 to 3.10
  - The 1.60 to 1.94 interval reflects only resampling of channels within one estimand.
- **Why it matters:** the owner is told the factor is "about 1.77", and the risk is "9–11%, well under the 25% line". A median pre-switch video scaled by 1.77 still sits about 12% below an equal post-switch video (2.02 / 1.77). Under the per-channel reading, 1.77 over-corrects by about 21% (1.77 / 1.46). The real spread runs from about −18% to +37% around 1.77. That is the same order as the owner's 25% line.
- **Narrow fix:**
  - Keep the >25% call. It survives every estimand.
  - Present the factor as a range that depends on the estimand (1.5 to 2.4).
  - Recommend option 2 (rank within each side of the date, or by percentile within publish week) as the call, since it does not depend on the factor. Alternatively, offer option 1 as a test with a quantile-matched factor.
  - make-the-call §5 says that when cost is unknown, the action should be framed as a test rather than a commitment.

### 2. The Aug 24 cutoff mis-scales the videos that straddle the switch, and the brief does not say so. (material)

- **Location:** owner message, option 1 ("published before August 24"); working §4 item 5; working §5 option 1 note.
- **Evidence:**
  - In `event_study.csv` (daily, compared with each channel's pre-period baseline):

    | Publish dates | Ratio |
    | --- | --- |
    | Aug 24–26 (all views under the new rule, per the brief's own source) | 1.19, 1.24, 1.46 |
    | Aug 27 onward | 1.8 to 3.1 |
    | Aug 8–23 (labelled "before") | already 0.97 to 1.49 |

  - My within-channel check (`q1.sql`): among 428 channels, videos published Aug 27–29 have 1.37× the day-29 views of videos published Aug 24–26.
  - The ranking illustration leaves out all 19,489 day-29 videos published Jul 25 to Aug 30 (`q3.sql`). Those are exactly the videos the rule handles badly.
- **Why it matters:**
  - Applied as written, option 1 pushes Aug 8–23 videos above comparable later videos. Some of those are already partly lifted (0.97–1.49), and ×1.77 lifts them again.
  - It also leaves Aug 24–26 videos, at about 1.2–1.46, below the scaled pre-switch videos.
  - The working calls Aug 24–26 "partly affected" but does not explain why videos with every view under the new rule would be partial. The step in this data sits at about Aug 27.
- **Narrow fix:** state in the brief that videos published about Jul 26 to Aug 26 need their own treatment: exclusion, a per-day factor, or percentile ranking. Say that the step appears at about Aug 27, three days after the announced date.

### 3. The ranking illustration reads as proof that 1.77 is right, but it isn't. (minor)

- **Location:** owner message, "Why it matters" ("77% of slots on raw counts and 60% once scaled. They are 64% of the videos").
- **Evidence:**
  - Putting 60% next to 64% suggests the scaled list is roughly fair.
  - The 64% share of the pool is not a fair benchmark. Within matched channels, post videos skew toward lower-view channels (mix term −18,450, `decomposition_channel_mix.csv`).
  - The top-100 result, 44% scaled against 64%, is in `ranking_illustration.csv` and the working but not in the brief.
- **Why it matters:** this is the only evidence the brief offers that option 1 fixes a ranking. It shows the factor moves the list, not that the factor is right.
- **Narrow fix:** say "illustration only; no fair-share benchmark exists". Alternatively, drop the 64% comparison.

### 4. "The jump shows in every sport, length, and channel size" overstates how uniform the lift is. (minor)

- **Location:** owner message, "Finding and caveat"; working §4 item 2 ("No tested segment gets a lift that differs from the rest by more than its interval allows").
- **Evidence (`lift_by_segment.csv`):**
  - The tennis ratio of totals is 1.39 (1.09 to 1.69). That interval excludes 1.77, so the working's claim is false for tennis.
  - Golf is 1.39 (1.12 to 1.77). Football is 2.06 and soccer 1.96.
  - Intervals that reach below 1:

    | Segment | Ratio of totals (95%) |
    | --- | --- |
    | Cycling | 1.21 (0.82 to 1.90) |
    | Running | 1.32 (0.78 to 2.36) |
    | Cricket | 1.51 (0.60 to 2.39) |
    | ≤60 s | 1.46 (0.63 to 3.26) |

  - On the typical-video measure the sports are more alike (1.9 to 2.4, except cycling 1.39).
- **Why it matters:**
  - It does not change the >25% call.
  - It does weaken "one factor can fix comparisons", which is the premise of option 1. A single ×1.77 would over-correct tennis and golf by about 27%.
- **Narrow fix:**
  - Change the brief to "point estimates above 1 in every segment; size varies (1.2 to 2.7 by sport)".
  - Correct the working's "no segment differs" line.

### 5. The "which 25%" question is handled honestly, but the headline still settles it by assertion. (minor)

- **Location:** headline; option 3; working §3.
- **Evidence:**
  - The headline says "long-form views about 77% higher … well above your 25% line". The stored long-form total is +11.4% (9.6% to 12.9%, `stock_translation.csv`).
  - The working names the ambiguity. It departs knowingly from make-the-call's rule that "a threshold stated for a total applies to the total", reasoning from the action the threshold guards (comparing videos). Option 3 gives the other reading.
  - So the ambiguity is surfaced, not exploited.
- **Why it matters:** the owner could repeat "our long-form views are up 77%", which is wrong for any total or dashboard figure. The per-view reading is defensible, but the owner never chose it.
- **Narrow fix:**
  - Change the headline to "about 77% higher per video at the same age".
  - Add one line asking the owner which reading they meant.

## Refutations considered

- **Finding 1:** maybe a views-weighted factor is right because rankings care about the top. At p90 to p99 the lift is still 1.87 to 2.14, so 1.77 sits low even there. The objection does not hold.
- **Finding 2:** maybe Aug 24–26 is low because of seasonality or a rollout lag. That may well explain the cause. Either way, the restatement rule as written, keyed to publish date before Aug 24, still mis-scales those days, so the finding stands for the recommendation.
- **Finding 5:** maybe the per-view reading is plainly what the owner meant. That is plausible, which is why this finding is minor rather than material.

## Could not verify

- Spot Sports' actual ranking formula, which was not supplied. Whether a multiplier is even usable depends on it.
- Whether the step at about Aug 27 reflects YouTube's rollout timing or a seasonal or data effect. I did not run the Method lens on this.
- The stock estimate of post-switch accrual for older videos (6.7% for videos published Jul 26 to Aug 23). That looks low next to the event-study ratios, but I did not trace the `stock` method.
- The bootstrap intervals. I did not rerun them.
