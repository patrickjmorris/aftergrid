# sol — Method and Question review

Reviewed the supplied question, report, all five skill outputs, the production estimation scripts, and relevant saved results. Checked the claims using read-only queries against `/tmp/aftergrid-eval/data/videos.sqlite`. This is one agent's serial review, applying only Method and Question. No analysis outputs were rewritten and `run_all.py` was not executed because it writes results.

Five material findings remain. The primary **descriptive estimate is reproduced**, including its channel bootstrap; the findings concern causal interpretation, the placebo design, segment uncertainty, and the recommended correction.

## What passed

The raw-row SQL in Q1 below gives **746 common channels, 13,254 pre videos, 23,962 post videos, R = 1.7711119130383648**. The pre denominator is 679,235,228 views; the standardized post numerator is 1,203,001,604.06613. The numerator is not the raw post total, correctly: it holds the pre channel mix fixed.

All selected pre readings were taken **2026-06-05 through 2026-08-23**, before the switch, for videos published May 8–July 26. Post videos were published **August 31–September 29**, with readings September 29–October 28. Ages are [28,30) days on both sides; average age is 28.816 pre and about 29.098 post. The narrow age-window sensitivities make the small remaining age difference an unsubstantiated explanation for a 77% gap.

The channel bootstrap resamples whole channels with replacement, retains their pre weights, recomputes the ratio, and takes percentile endpoints. Re-executing it on raw-row groups with 2,000 draws and the script's seed reproduced **[1.5975731332, 1.9400138006]**, and geometric contrast **2.4295790467 [2.0260372155, 3.0968956931]**. I found no arithmetic, matching, boundary, or bootstrap-implementation error in the headline.

The within-pre and within-post placebos and the Shorts control also use the same pre-weighted ratio-of-means algebra. Q1 with their documented predicates reproduced respectively **0.9951194 (623 channels), 0.8864282 (757), 0.9602350 (341), and 0.8144416 (554)**. The 2025 placebo uses that algebra too; its problem is measurement design, not a secretly different estimator.

## 1. Material — Blanket restatement scales already-new-rule views a second time

**Location:** `report.md:14`, `:66`, `:74`; duplicated in `skill-outputs/05-make-the-call.md`. Recommendation: multiply the current counts of pre-August-24 videos by 1.77, with only August 20–26 called out for a partial adjustment.

**Evidence/query:** Q2 below finds **132,461** long-form videos published before August 20 with two post-switch readings and nonnegative growth. Their observed increments total **164,394,511 views**, all fetched between two dates after the switch. These increments already use the new count. Under the report's own constant-R assumption, **117** videos have a lower bound on overstatement exceeding 25%; **98** of those have at least 1,000 current views, totaling 16,673,550 views.

A concrete non-transition example was published **2026-08-06 00:00:36 UTC**: 421 views at September 4, then 122,297 at October 4. Blanket scaling gives **216,601.67**. Even assuming all 421 earlier views were old-rule views, the correct new-basis count can be at most **421 × R + (122,297 − 421) = 122,621.64**. The recommendation therefore overstates this count by at least **76.64%**, conditional on its own R.

**Attempted refutation:** The day-29 ranking illustration does use entirely pre versus entirely post counts, where this mixed-accrual objection does not apply. The report also recognizes that old videos accrue new plays and offers a narrow transition exclusion. Neither rescues the recommendation's application to current lifetime counts in “any cross-date comparison”: the example is outside that exclusion and its known later increment is already new-rule.

**Why it matters:** The correction can create ranking errors larger than the owner's 25% line even if the estimated factor is exactly right.

**Narrow fix:** Limit the illustrated adjustment to frozen, entirely old-rule readings. For current counts, separate old-rule accrual B from already-new accrual N and use **R × B + N**, or leave mixed counts uncorrected/excluded when that split cannot be estimated. Publication date alone is insufficient.

## 2. Material — An aggregate factor and its interval do not validate one factor for every video

**Location:** `report.md:9`, `:38`, `:56`, `:66`, `:74`; `skill-outputs/04-diagnose-change.md`, “Segments under the headline's own controls.”

**Evidence/query:** Q1 establishes that R is a ratio for the **pre-period channel mix**, rather than a measured ratio for each video's identical plays. The raw-row calculation in Q3 below then divides every post count by the proposed R and recomputes the report's own geometric metric. The aggregate ratio becomes **1.0000 by construction**, but the geometric contrast remains **1.37367 [1.14573, 1.75067]** in a 2,000-channel bootstrap with R fixed at the proposed value. Using the jointly resampled geometric/aggregate ratio instead gave **1.37178 [1.14909, 1.76398]**. Thus an aggregate “fix” does not even eliminate the other observed cohort contrast.

Raw-row segment calculations also reproduce tennis at **1.39208 [1.09252, 1.69255]**, with its interval below the headline point factor. An additional disjoint-channel bootstrap of tennis minus all other sports gave **−0.39045 [−0.73538, −0.01435]** (10,000 draws, seed 19). This last comparison is exploratory and unadjusted for multiple testing; it is not definitive proof of causal sport heterogeneity.

**Attempted refutation:** A common factor could still be a useful approximation, and differing geometric/aggregate results can reflect content changes or sampling noise rather than heterogeneous counting effects. Conversely, overlapping segment intervals do not establish practical equivalence. The report supplies neither an equivalence bound nor validation of ranking accuracy. The interval for the average R also cannot establish the claim that any video's correction is wrong by only 9%–11%.

**Why it matters:** The owner is deciding how to compare individual videos. Correcting a view-weighted average is a different objective from recovering comparable video-level rankings.

**Narrow fix:** Present 1.77 as a provisional aggregate normalization for the measured population, conditional on stability assumptions. Remove “every video comparable,” the individual 9%–11% assurance, and claims that the adjusted ranking is verified. Retain the ranking exercise as an illustration of what the assumed factor does. Validate any stronger per-video correction against engaged-view ratios across a relevant range of videos/channels.

## 3. Material — The reported 60%–94% interval covers the cohort contrast, not uncertainty about the causal rule effect

**Location:** `report.md:7`, `:55`, `:74`, `:258–267`; `skill-outputs/04-diagnose-change.md`, diagnosis and hypothesis ledger.

**Evidence/query:** Q1 and the bootstrap check above reproduce the interval exactly. They compare different videos in the same channels at different calendar times. Q1's group date summaries show long-form pre publications May–July versus post August–September. Running the same raw-row selection for Shorts gives **pre publications July 1, 2025–July 9, 2026**, and **post September 9–October 15, 2026**. These are not concurrent calendar controls for the long-form contrast. The report acknowledges the missing Shorts timestamps and nonmatching windows; the channel bootstrap resamples those same unmatched calendar windows and cannot estimate an unobserved long-form-specific time change.

The report's own threshold sensitivity is arithmetic, not ruled out by the bootstrap: **1.7711119 / 1.25 = 1.4168895**. A 41.69% increase in the old-rule counterfactual between cohorts would leave the rule effect at 25%, even while the observed 1.77 ratio and its channel interval remain exactly as reported. Finding 4 explains why the 2025 check does not fully close this gap.

**Attempted refutation:** The timing, many positive segment estimates, matched ages/channels, and sensitivity variants are substantive evidence in favor of a counting effect. The brief itself supplies a real rule change; lack of randomization is not an objection by itself. The report also discloses observational inference. What remains unsupported is giving the bootstrap interval a causal interpretation and treating rivals as eliminated, rather than conditioning the sizing on stable underlying viewing/content.

**Why it matters:** The owner's threshold is explicitly “because of this.” A precisely estimated before/after association does not by itself establish a 95% range for that causal quantity.

**Narrow fix:** Keep 77% as the matched-cohort estimate and label its interval accordingly. Make the stable-underlying-viewing assumption explicit, distinguish evidence favoring the rule from a measured causal interval, and show the existing 41.69% counterfactual sensitivity next to the threshold conclusion. A suitable matched control or engaged-view sample would strengthen attribution; an artificial experiment is not required for a useful conditional sizing.

## 4. Material — The 2025 placebo has the same algebra but not the same age-matched measurement

**Location:** `report.md:11`, `:184–193`, `:259`; `scripts/diagnose.py`, “Year-earlier placebo”; `skill-outputs/04-diagnose-change.md`, sections 3–4.

**Evidence/query:** Q4 below reproduces the placebo's common support: **4,057 pre and 5,393 post videos in 335 channels**. The pre lifetime readings are at ages **315.997–351.733 days, average 328.879**; post readings are at **249.519–290.383 days, average 267.002**. All these long-form readings were fetched in June 2026. They are not the headline's [28,30)-day outcome. The 0.8349 placebo therefore combines publication-season differences with lifetime maturity and the selection of channels whose current fetch was still pre-switch.

**Attempted refutation:** The author explicitly labels this a lifetime-count placebo, and videos may accrue little after day 29. It is useful auxiliary evidence and does not use the wrong ratio formula. However, small late growth in the 2026 selected sample does not demonstrate age equivalence for all these 2025 cohorts. It cannot be described as the same age-controlled comparison or used to reject seasonal differences in first-month viewing with the certainty claimed.

**Why it matters:** “Neither do the same dates in 2025” is a main reason offered for attributing the full 77% to the rule. This weaker placebo cannot carry that burden or serve as a directly comparable normal-variation observation.

**Narrow fix:** Keep it as a clearly qualified, unequal-age lifetime placebo. Do not pool it into a claim of null variation from the same measurement design or use it to eliminate seasonality. Recompute at comparable age if historical readings exist; otherwise list that exact missing check.

## 5. Material — Positive segment point estimates do not establish a jump in every segment

**Location:** `report.md:11`, `:56`, `:230–233`; `skill-outputs/04-diagnose-change.md`, H1/H4 and segment conclusions.

**Evidence/query:** Q3's raw-row grouping and the same production channel bootstrap reproduce these primary ratio intervals:

| Segment | Channels | Ratio | 95% channel interval |
| --- | ---: | ---: | ---: |
| Running | 68 | 1.31888 | 0.77580–2.36417 |
| Cricket | 19 | 1.50914 | 0.60409–2.39412 |
| Cycling | 19 | 1.21189 | 0.82054–1.90043 |
| Long-form ≤60 seconds | 49 | 1.45809 | 0.62677–3.26008 |

The detailed acknowledgement at line 56 lists running and cycling but misses cricket and the shortest duration band. The duration summary omits the ≤60-second band entirely. Independent channel-size thirds all have intervals above 1, but the smallest third's lower bound is only **1.0502**, not above 1.25.

**Attempted refutation:** “Point estimates are above 1 in every segment” is true, and the geometric metric is positive with stronger intervals for these groups. Neither establishes a positive effect in every segment under the **primary** ratio estimator. Switching to the geometric metric to rescue that universal claim would also change the estimand used to choose the single factor. These intervals do not prove absence of a lift either.

**Why it matters:** The universal claim is used as evidence for a universal ranking correction. Segment noise permits both no lift and materially different lifts in relevant groups.

**Narrow fix:** Say that point estimates rise broadly, with inconclusive primary estimates in four listed groups; do not infer universal effects or common-factor equivalence. Include cricket and ≤60 seconds whenever describing exceptions. Separate “above zero” from “above the owner's 25% threshold.”

## Queries and calculations actually run

### Q1 — Raw reading selection, matching, and estimator

Opened the database with `sqlite3.connect('file:/tmp/aftergrid-eval/data/videos.sqlite?mode=ro', uri=True)` and ran:

```sql
WITH r AS (
 SELECT video_key,channel_key,is_yt_short fmt,published_at p,
        prev_view_count_at t,prev_view_count v,'prev' kind
 FROM videos WHERE prev_view_count_at IS NOT NULL AND prev_view_count IS NOT NULL
 UNION ALL
 SELECT video_key,channel_key,is_yt_short,published_at,last_stats_check,view_count,'last'
 FROM videos WHERE last_stats_check IS NOT NULL AND view_count IS NOT NULL
), a AS (
 SELECT *,julianday(substr(t,1,19))-julianday(substr(p,1,19)) age
 FROM r WHERE fmt=0
), w AS (
 SELECT *,row_number() OVER (PARTITION BY video_key ORDER BY abs(age-29)) rn
 FROM a WHERE age>=28 AND age<30
), g AS (
 SELECT *,CASE WHEN t<'2026-08-24' THEN 'pre'
               WHEN p>='2026-08-31' THEN 'post' END grp
 FROM w WHERE rn=1
), cs AS (
 SELECT channel_key,sum(grp='pre') npre,sum(grp='post') npost,
        avg(CASE WHEN grp='pre' THEN v END) mpre,
        avg(CASE WHEN grp='post' THEN v END) mpost
 FROM g WHERE grp IS NOT NULL GROUP BY channel_key HAVING npre>0 AND npost>0
)
SELECT count(*),sum(npre),sum(npost),sum(npre*mpost)/sum(npre*mpre),
       sum(npre*mpre),sum(npre*mpost) FROM cs;
```

Also ran the same CTE with final selection:

```sql
SELECT grp,kind,count(*),min(p),max(p),min(t),max(t),min(age),avg(age),max(age)
FROM g JOIN cs USING(channel_key) WHERE grp IS NOT NULL GROUP BY grp,kind;
```

Re-ran the same pattern for the documented null predicates, adjusting format, age window, and midpoint for Shorts. Results are recorded under “What passed.”

### Q2 — Already-new increments in old videos

```sql
WITH a AS (
 SELECT *,view_count-prev_view_count delta
 FROM videos
 WHERE is_yt_short=0 AND published_at<'2026-08-20'
   AND prev_view_count_at>='2026-08-24'
   AND last_stats_check>prev_view_count_at
   AND view_count>=prev_view_count AND prev_view_count>=0
)
SELECT count(*),sum(view_count),sum(delta),
 sum((1.7711119130383648-1)*delta /
     (1.7711119130383648*prev_view_count+delta)>.25),
 max((1.7711119130383648-1)*delta /
     (1.7711119130383648*prev_view_count+delta))
FROM a;
```

Output: `(132461, 7802400553, 164394511, 117, 0.7711119130383648)`.
Also selected dates and both counts ordered by that overstatement bound, and counted the >25% rows restricted to `view_count>=1000`; outputs appear in finding 1.

### Q3 — Raw-row bootstrap, segment checks, and uniform scaling

Ran with `PYTHONDONTWRITEBYTECODE=1`, importing only calculation/reading functions; no writer was invoked:

```python
import sys
sys.path.insert(0, '/tmp/aftergrid-run3/scripts')
from common import load_rows, readings, channel_sport, CHANGE
from metric import pick_reading, groups, channel_stats, estimate, bootstrap
rows = load_rows()  # SELECT documented source columns FROM videos
rd = readings(rows)
pick = pick_reading(rd, 0, 28, 30)
g, _, _ = groups(pick, lambda x: x['T'] < CHANGE,
                 lambda x: x['P'] >= CHANGE + 7)
cs = channel_stats(g)
print(estimate(cs), bootstrap(cs))
sport = channel_sport(rows)
for name in ('Running', 'Cricket', 'Cycling', 'Tennis', 'Golf'):
    sub = {c: v for c, v in cs.items() if sport[c] == name}
    print(name, len(sub), estimate(sub), bootstrap(sub, reps=1000))
short_lf = [x for x in pick if (x['dur'] or 0) <= 60]
sub = channel_stats(groups(short_lf, lambda x: x['T'] < CHANGE,
                           lambda x: x['P'] >= CHANGE + 7)[0])
print('<=60s', len(sub), estimate(sub), bootstrap(sub, reps=1000))
R = estimate(cs)[0]
adjusted = {c: (a, [v / R for v in b]) for c, (a, b) in g.items()}
adj_cs = channel_stats(adjusted)
print(estimate(adj_cs), bootstrap(adj_cs))
```

Also ran independent disjoint channel resampling for each named sport versus its complement (10,000 draws, `random.Random(19)`) and a 2,000-draw joint resampling of geometric ratio divided by aggregate ratio (`random.Random(20261028)`). Interpretations and multiplicity limitation are recorded in finding 2.

### Q4 — 2025 placebo ages on exactly its common support

```sql
WITH a AS (
 SELECT *,CASE WHEN published_at<'2025-07-25' THEN 'pre'
               WHEN published_at>='2025-08-31' AND published_at<'2025-09-30'
               THEN 'post' END grp,
        julianday(substr(last_stats_check,1,19))-
        julianday(substr(published_at,1,19)) age
 FROM videos WHERE is_yt_short=0 AND last_stats_check<'2026-08-24'
   AND view_count IS NOT NULL
), c AS (
 SELECT channel_key FROM a GROUP BY channel_key
 HAVING sum(grp='pre')>0 AND sum(grp='post')>0
)
SELECT grp,count(*),min(age),avg(age),max(age)
FROM a JOIN c USING(channel_key) WHERE grp IS NOT NULL GROUP BY grp;
```

## Claims not verified / limits

- The actual per-video new-rule/engaged-view ratio, causal homogeneity, and the exact counterfactual total cannot be observed in these public-count rows.
- No actual Spot Sports ranking formula or out-of-sample ranking validation was supplied. The saved top-N exercise is conditional arithmetic, not evidence that adjusted rankings recover engagement or owner preferences.
- I did not independently verify the external web articles; the review takes the question's stated rule change as given. No outside sources were needed for these findings.
- I did not independently regenerate the stock interpolation or validate all its uncertainty. The reported stock ranges propagate R uncertainty and should not be taken here as independently verified causal intervals.
- I did not read or reconcile against the CSV copy: access was restricted to the supplied question and SQLite file within `/tmp/aftergrid-eval/`. The report's CSV parity claim remains unchecked by this reviewer.
- The post-start buffer is disclosed as chosen after exploration; its reported sensitivity range does not substantiate an objection that the 1.77 estimate was manufactured by that choice. Likewise, no primary pre/post contamination or wrong estimator in the immediate pre/post nulls was found.
