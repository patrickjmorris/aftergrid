# Method Lens Review of `/tmp/aftergrid-run3` (Reviewer: `gemini`)

## 1. Executive Summary & Independent Reproduction

- **Reproduction of author's headline estimate (`1.77x`):** **Reproduced exactly.** Running our own code directly against `/tmp/aftergrid-eval/data/videos.sqlite` under the author's specification (one reading per long-form video in age `[28.0, 30.0)` days closest to day `29.0`; pre-group read before `2026-08-24 00:00:00 UTC`; post-group published on or after `2026-08-31 00:00:00 UTC`; 746 matched channels with 13,254 pre videos and 23,962 post videos; channel means weighted by `n_pre_c`; 2,000-resample channel bootstrap with seed `20261028`) yields **`1.7711x` (95% CI: `1.5976` to `1.9400`)** for the ratio of totals and **`2.4296x` (95% CI: `2.0260` to `3.0969`)** for the `n_pre_c`-weighted geometric (`typical_video`) ratio.
- **Independent estimates from defensible alternative designs:**
  1. **Poisson Pseudo-Maximum Likelihood (PPML / Channel Fixed-Effects Poisson regression) on level views at age 28–30 days (`N = 37,216` videos, `746` channels):** **`1.7382x` (`+73.8%`, 95% channel-bootstrap CI: `1.5936` to `1.9233`)**; harmonic-weighted ratio of channel means gives **`1.7435x` (95% CI: `1.5919` to `1.9383`)**. Unlike the author's `n_pre_c`-weighted ratio of means, PPML weights each channel's contrast by its effective pre/post precision `n_pre_c * n_post_c / (n_pre_c + n_post_c * R)`, preventing channels with large `n_pre_c` and tiny `n_post_c` (specifically channel `[hashed id]`, with `n_pre = 233` and `n_post = 10`) from dominating the numerator.
  2. **Channel Fixed-Effects OLS regression on `log(1 + view_count)` at age 28–30 days (`N = 37,216` videos, `746` channels):**
     - **Baseline within-channel FE (`w_c = n_pre_c * n_post_c / (n_pre_c + n_post_c)`):** **`2.1265x` (`+112.7%`, 95% channel-bootstrap CI: `1.9630` to `2.3098`; analytical cluster-robust 95% CI: `1.9607` to `2.3063`)**. On strictly positive views (`log(views)`, `N = 36,999`): **`2.0705x` (95% CI: `1.9161` to `2.2629`)**.
     - **Controlling for continuous reading age `(age - 29.0)` and `log(1 + duration_seconds)` with channel fixed effects:** **`2.0903x` (`+109.0%`, 95% channel-bootstrap CI: `1.9014` to `2.2980`)**, with `beta_post = 0.7373`, `beta_age = +0.0223` per day, and `beta_log_dur = +0.1479`.
  3. **Difference-in-Differences (DiD) against Shorts (`502` channels with both formats in both periods):**
     - **Channel × Format Fixed-Effects OLS on `log(1 + views)`:** **`2.3322x` (95% channel-bootstrap CI: `2.0816` to `2.6049`)**.
     - **PPML DiD on level views:** **`2.0756x` (95% CI: `1.6043` to `2.7651`)** across all 502 channels, and **`1.7814x`** once a single NBA Playoff Shorts outlier channel (`[hashed id]`) is excluded (author's ratio-of-totals DiD drops from **`2.2194x` [95% CI: `1.6804` to `3.0270`]** to **`1.8855x`** without that one channel).
- **Bottom-line judgment on the owner's decision:** Every defensible estimator places the per-view long-form lift between **`1.74x` (`+74%`)** on level totals and **`2.09x–2.13x` (`+109%` to `+113%`)** on typical (geometric) video views, with all lower 95% confidence bounds (`1.59x` to `1.90x`) well above the owner's `1.25x` (`+25%`) decision threshold. However, we identified **two material Method flaws** (one in `stock()` that misses post-switch views accrued before `T1` on straddlers, and one in `n_pre_c` weighting that makes `typical_video` and the channel-mix decomposition heavily sensitive to two extreme sample-imbalance channels) and **three minor Method issues**.

---

## 2. Independent Rebuild & Heterogeneity vs. Placebo Cutover Test

### 2.1 Code & Query Used to Rebuild the Estimates from `videos.sqlite`

```python
import sqlite3, math, random, statistics as st
from collections import defaultdict, Counter
from datetime import datetime, timezone

con = sqlite3.connect('/tmp/aftergrid-eval/data/videos.sqlite')
def ts_day(s):
    if not s: return None
    return datetime.fromisoformat(s.replace('+00', '')[:26]).replace(tzinfo=timezone.utc).timestamp() / 86400.0

CHANGE = ts_day('2026-08-24 00:00:00')
POST_START = ts_day('2026-08-31 00:00:00')

cur = con.execute("""
    SELECT video_key, channel_key, sport, is_yt_short, duration_seconds,
           published_at, ingested_at, last_stats_check, view_count,
           prev_view_count, prev_view_count_at
    FROM videos
""")
rows = cur.fetchall()
```

Summary of headline estimates across designs (`N = 37,216` long-form videos across `746` matched channels at age `28–30d`, `502` dual-format channels for DiD, `2,000` channel bootstrap resamples):

| Estimator / Design | Point Estimate | 95% Interval | Notes |
| --- | --- | --- | --- |
| Author `ratio_of_totals` (`n_pre_c` weights) | **1.7711x** | `[1.5976, 1.9400]` | Exact reproduction; channel `[hashed id]` (`n_pre=233, n_post=10`) adds `+0.0686` |
| **PPML / Poisson Channel FE (level views)** | **1.7382x** | `[1.5936, 1.9233]` | Precision-weighted MLE on level counts; robust to `n_pre >> n_post` |
| Harmonic-weighted ratio of channel means | **1.7435x** | `[1.5919, 1.9383]` | Weights channel means by `w_c = n_pre * n_post / (n_pre + n_post)` |
| Author `typical_video` (`n_pre_c` weights on `log1p`) | **2.4296x** | `[2.0260, 3.0969]` | Distorted `+0.2526` by channel `[hashed id]` (`n_pre=261, n_post=18`, 101 pre zeros) |
| **Channel FE OLS on `log(1 + views)`** | **2.1265x** | `[1.9630, 2.3098]` | Exact within-channel OLS (`w_c = n_pre * n_post / (n_pre + n_post)`) |
| **Channel FE OLS on `log(1 + views)` + age & duration** | **2.0903x** | `[1.9014, 2.2980]` | Controls for `(age - 29.0)` and `log(1 + duration_seconds)` |
| Channel FE OLS on `log(views)` (`views > 0`) | **2.0705x** | `[1.9161, 2.2629]` | Drops 217 zero-view readings (`N = 36,999`, `746` channels) |
| **DiD vs. Shorts: Channel × Format FE `log(1+v)`** | **2.3322x** | `[2.0816, 2.6049]` | `502` common channels (`LF 28–30d` vs `Shorts 12–14d`) |
| **DiD vs. Shorts: PPML (level views)** | **2.0756x** | `[1.6043, 2.7651]` | Drops to **1.7814x** when outlier Shorts channel `[hashed id]` is excluded |

---

### 2.2 Heterogeneity Test Across Channel Size, Sport, and Duration vs. Placebo Cutovers

To test whether the lift varies across **channel size** (independent Jan–Apr 2026 median lifetime views terciles), **sport** (the 14 modal channel sports with `>= 10` matched channels), and **duration** (the 6 duration bands `<=60s`, `61–180s`, `3–10m`, `10–20m`, `20–60m`, `>60m`) beyond what a placebo cutover produces with the **same estimator**, we computed the cross-segment dispersion (`SD(log R)` and `max(R)/min(R)`) at the **Actual cutover** (`T < 2026-08-24` vs. `P >= 2026-08-31`) and compared it against two in-sample **Placebo cutovers** where the counting rule did not change:
1. **Pre-period Placebo cutover (`2026-07-01`):** `P < 2026-07-01` vs. `P >= 2026-07-01` (all read before `2026-08-24`).
2. **Post-period Placebo cutover (`2026-09-14`):** `2026-08-31 <= P < 2026-09-14` vs. `P >= 2026-09-14` (all published after the buffer).

| Dimension (Segments) | Estimator | Actual Cutover Segment Estimates | Actual `SD(log R)` (`max/min`) | Pre-Placebo (`Jul 1`) `SD(log R)` (`max/min`) | Post-Placebo (`Sep 14`) `SD(log R)` (`max/min`) | Exceeds Placebo Noise? |
| --- | --- | --- | --- | --- | --- | --- |
| **Channel Size** (3 independent Jan–Apr 2026 terciles) | `ratio_of_totals` | `[1.461, 1.995, 1.662]` | **0.157** (`1.37x`) | **0.181** (`1.43x`: `[0.824, 1.182, 1.019]`) | **0.090** (`1.19x`: `[0.811, 0.968, 0.867]`) | **No** (`0.157 < 0.181`) |
| **Channel Size** (3 independent terciles) | Channel FE `log(1+v)` | `[2.206, 2.064, 1.987]` | **0.053** (`1.11x`) | **0.054** (`1.10x`: `[0.962, 1.053, 1.058]`) | **0.048** (`1.10x`: `[0.979, 0.937, 0.888]`) | **No** (`0.053 ≈ 0.054`) |
| **Sport** (14 sports with `>=10` channels) | `ratio_of_totals` | `1.212` (Cycling) to `2.675` (Swimming) | **0.215** (`2.21x`) | **0.329** (`2.64x`: `0.666` Golf to `1.759` Soccer) | **0.303** (`3.40x`: `0.689` Gen. to `2.345` Swim) | **No** (`0.215 < 0.329, 0.303`) |
| **Sport** (14 sports with `>=10` channels) | Channel FE `log(1+v)` | `1.385` (Cycling) to `2.347` (Football) | **0.137** (`1.69x`) | **0.239** (`2.04x`: `0.764` Tennis to `1.562` Cycling) | **0.160** (`1.90x`: `0.706` Bball to `1.344` Cycling) | **No** (`0.137 < 0.239, 0.160`) |
| **Duration** (6 bands from `<=60s` to `>60m`) | `ratio_of_totals` | `[1.458, 1.793, 1.945, 1.546, 1.938, 1.615]` | **0.121** (`1.33x`) | **0.243** (`1.95x`: `0.874` to `1.707`) | **0.637** (`5.93x`: `0.761` to `4.516`) | **No** (`0.121 < 0.243, 0.637`) |
| **Duration** (6 bands from `<=60s` to `>60m`) | Channel FE `log(1+v)` | `[2.416, 2.386, 1.943, 1.956, 2.194, 2.027]` | **0.098** (`1.24x`) | **0.102** (`1.30x`: `0.898` to `1.166`) | **0.073** (`1.24x`: `0.886` to `1.096`) | **No** (`0.098 ≈ 0.102`) |

**Conclusion on heterogeneity:** Across all three dimensions (channel size, sport, and duration) and under both `ratio_of_totals` and Channel FE `log(1+v)`, the cross-segment dispersion at the August 24 switch is **no larger (and for sport and duration, smaller) than the cross-segment dispersion produced by placebo cutovers with the exact same estimator**. In particular, while the author noted that Football (`2.06x`) and Soccer (`1.96x`) sit above Golf (`1.39x`) and Tennis (`1.39x`), the Pre-Placebo (`Jul 1`) cutover produces an even wider sport spread (`SD(log RT) = 0.329`, with Soccer at `1.759x` and Golf at `0.666x`) due to normal sport-calendar variance and small per-sport channel counts. Note that the author only ran the placebo cutover by segment for channel size (`diagnose.py` lines 178–183) and omitted the placebo segment checks for sport and duration.

---

## 3. Method Findings (Ranked by Severity and Decision Impact)

### Finding 1 — `stock()` omits post-switch views accrued before the earlier stored reading (`T1`) whenever `T1 > 2026-08-24`, understating the `2026-07-26..08-23` cohort lift (`+3.0%` reported vs. up to `+31.1%` under time-share)
- **Severity:** **Material**
- **Location:** `scripts/diagnose.py` lines 225–251 (`stock()`), `results/stock_translation.csv`, `report.md` ("Message to the owner", "2. Result in goal units", "3. Materiality", "4. Findings ranked by decision impact", and "Stored totals and ranking"), and `skill-outputs/04-diagnose-change.md` (Section 9).
- **Evidence:** In `scripts/diagnose.py` lines 237–240, for videos published before `2026-08-24` with two stored readings, post-switch view accrual `A` is computed as:
  ```python
  inc = max(0, r['view_count'] - r['prev_view_count'])
  a = inc * (T2 - max(r['T1'], CHANGE)) / (T2 - r['T1'])
  ```
  and the docstring (lines 227–228) asserts: `(time share; overstates for young videos whose rate is falling, understates nothing else)`.
  We ran the following check on `/tmp/aftergrid-eval/data/videos.sqlite`:
  ```sql
  SELECT
    CASE
      WHEN published_at >= '2026-07-26' AND published_at < '2026-08-24' THEN '2026-07-26..08-23'
      WHEN published_at >= '2026-01-01' AND published_at < '2026-07-26' THEN '2026-01-01..07-25'
      WHEN published_at < '2026-01-01' THEN '2025'
    END AS cohort,
    COUNT(*) AS videos,
    SUM(prev_view_count_at > '2026-08-24') AS t1_after_switch,
    SUM(CASE WHEN prev_view_count_at > '2026-08-24' THEN prev_view_count ELSE 0 END) AS v1_ignored_views,
    SUM(CASE WHEN prev_view_count_at > '2026-08-24' AND last_stats_check > prev_view_count_at
             THEN MAX(0, view_count - prev_view_count) ELSE 0 END) AS v2_minus_v1_views
  FROM videos
  WHERE is_yt_short = 0 AND view_count IS NOT NULL AND published_at < '2026-08-24'
  GROUP BY 1;
  ```
  Result:
  - In `2026-07-26..08-23` (`20,899` videos, `1,030,638,645` stored views), **20,382 videos (97.5%) have `prev_view_count_at > '2026-08-24'`** (because `T1` was taken at age ~29 days, i.e., `2026-08-24` to `2026-09-21`). Their `prev_view_count` (`V1`) totals **`951,854,881` views** (92.4% of all stored views in the cohort), while `V2 - V1` (accrued between age ~29d and ~60d) totals only `67,976,679` views.
  - Because `T1 > CHANGE`, `stock()` sets `a = V2 - V1` and **treats all `951.85M` views accrued between `published_at` and `T1` as 0% post-switch** — even for videos published on `2026-08-20..08-23` that accrued almost all of their first-29-day views after `2026-08-24`!
  - Including the linear time-share of `[P, T1]` (`prev_view_count * (T1 - CHANGE) / (T1 - P)`) increases estimated post-switch accrual in `2026-07-26..08-23` from `68.60M` (`6.66%` share, **`+2.98%`** lift) to `561.74M` (`54.50%` share, **`+31.11%`** lift — above the owner's 25% line), and increases the all-long-form catalog lift from `+11.4%` (`1.74B` views) to `+13.0%` (`1.95B` views). Furthermore, across `2026-01-01..07-25` and `2025`, another `115,186` videos were refetched twice after `2026-08-24` (`T1 > CHANGE`, `sum(V1) = 6.84B` views), so their post-switch accrual between `2026-08-24` and `T1` is also omitted.
- **Refutation check:** Could omitting `[P, T1]` be justified because views are heavily front-loaded right after publish? Front-loading means linear time-share (`+31.1%`) is an upper bound for `2026-07-26..08-23`, not that post-switch accrual in `[CHANGE, T1]` is zero. Even using the author's own empirical day-29 weekly ratios for `2026-07-27..08-23` (`1.02x` to `1.28x`, and `1.17x` to `1.49x` for `08-20..08-23`), the post-switch lift inside `V1` is several times larger than the `+3.0%` reported from `V2 - V1` alone, and directly contradicts the docstring claim `understates nothing else`.
- **Why it matters to the owner's decision:** Based on the `+3.0%` figure, the report tells the owner that older videos' counts (`+0.4% to +3%`) are "Immaterial" and "Not worth your attention," and Option 1 recommends multiplying **all** pre-`2026-08-24` videos by `1.77` (flagging only `08-20 to 08-26` for a partial factor). Scaling all `2026-07-26..08-19` straddlers up by the full `1.77x` when part of their stored views already accrued under the new rule will over-inflate late-July/August videos in cross-date rankings.
- **Narrow fix:** In `stock()`, account for `[CHANGE, T1]` accrual when `P < CHANGE < T1` (reporting both a front-loaded empirical curve from `event_study.csv` and the linear time-share bound), and widen the partial-factor transition window in Option 1 to `2026-07-26..08-26`.

---

### Finding 2 — Weighting channel contrasts by `n_pre_c` gives extreme leverage to channels with imbalanced pre/post counts (`n_pre_c >> n_post_c`), inflating `typical_video` (`2.43x` vs. `2.13x` FE OLS), breaking the pre-period placebo on `typical_video` (`1.27x`), and allowing one channel (`[hashed id]`) to drive `+0.069` of `1.7711x` and `92.7%` of the channel-mix term
- **Severity:** **Material**
- **Location:** `scripts/metric.py` lines 47–57 (`estimate()`), `scripts/diagnose.py` lines 53–80 (`decomposition_channel_mix.csv`), `results/primary_lift.csv`, `results/null_comparisons.csv`, `results/lift_by_segment.csv`, and `report.md` ("Headline and cross-check" and "Reproduction and mix").
- **Evidence:** In `metric.py`, `estimate()` weights every channel's post-period mean (`mpost` and `lpost - lpre`) by its pre-period video count `n_pre_c`, regardless of how few post-period videos `n_post_c` that channel has. Querying `videos.sqlite` on the 746 matched channels reveals two severe leverage distortions:
  1. **On `typical_video` (`2.4296x`, 95% CI `2.0260` to `3.0969`):** Channel `[hashed id]` uploaded a one-time batch of 295 mostly zero-view videos in June 2026 (`n_pre = 261` at age 28–30d, including `101` zeros, mean `7.78` views) and `n_post = 18` normal videos in September (0 zeros, mean `2,109.28` views). Because `lpost - lpre = +6.352` is multiplied by `n_pre = 261`, this **single channel shifts the entire 746-channel `typical_video` estimate from `2.1770x` to `2.4296x` (`+0.2526x`)** and widens the upper 95% CI from `2.31` to `3.10`. Worse, in `null_comparisons.csv` row 1 (`published before vs after 2026-07-01, all read before change`), this same June batch causes `typical_video` to register a false positive of **`1.2744x` (95% CI: `1.0267` to `1.6850`)**, and in `lift_by_segment.csv` it inflates the smallest-third independent channel-size `typical_video` to **`3.9730x` (`1.9605` to `10.6714`)** (and its pre-period placebo to `2.2756x`). Replacing `n_pre_c` weights with standard within-channel fixed-effects precision weights `w_c = n_pre_c * n_post_c / (n_pre_c + n_post_c)` gives **`2.1265x` (95% CI: `1.9630` to `2.3098`)** overall, **`2.206x`** for the smallest channel tercile, and **`0.962x`** on the smallest-tercile pre-period placebo.
  2. **On `ratio_of_totals` (`1.7711x`) and `decomposition_channel_mix.csv` (`mix = -18,450`):** Channel `[hashed id]` has `n_pre = 233` (mean `467,900` views) and only `n_post = 10` (mean `996,655` views). Multiplying its 10-video post mean by `233` gives those 10 videos **19.30% of the entire 746-channel weighted numerator** (`232.22M` of `1,203.00M` views) and **16.05% of the denominator**, pulling `ratio_of_totals` up by **`+0.0686`** (`1.7025x` without `[hashed id]`; **`1.7382x`** under PPML). In `decomposition_channel_mix.csv`, where the report states `"The mix term is -18,450: after the switch, more videos come from channels with lower views per video"`, channel `[hashed id]` alone accounts for **`-17,104.9` (92.7%) of the entire `-18,450` mix term** (`-1,345` across the other 745 channels).
- **Refutation check:** The author ran `drop top 1% channels by pre views` (`1.8010x`, `sensitivity.csv`), which dropped the top 7 channels at once. However, dropping the other 6 large channels (which had lower lifts of `1.00x–1.51x`) masked the `+0.0686` upward pull of `[hashed id]`'s 10 post videos, and did not drop `[hashed id]` (whose pre-views were near zero, leaving `typical_video = 2.4250x` still distorted).
- **Why it matters to the owner's decision:** Option 1 uses the point estimate (`1.77x`) directly as the scaling multiplier for cross-date rankings, and the large gap between the reported `typical_video` (`2.43x`) and `ratio_of_totals` (`1.77x`) implies a `37%` skew between median and top-end lift, whereas under precision-weighted FE (`2.09x–2.13x` vs. `1.74x`) that gap is half as large and uniform across channel sizes (`2.21x, 2.06x, 1.99x`).
- **Narrow fix:** Use precision weights `w_c = n_pre_c * n_post_c / (n_pre_c + n_post_c)` for log-view FE (`2.13x`) and PPML for level views (`1.74x`) alongside `n_pre_c`-weighted totals, and note in `report.md` that 92.7% of the `-18,450` channel-mix term comes from a single channel (`[hashed id]`).

---

### Finding 3 — The Shorts control (`0.8144x`) and the Long-Form / Shorts DiD sensitivity estimate (`2.2194x`) are pulled by a single NBA Playoff channel (`[hashed id]`), and the DiD row mixes channel weights across formats and omits confidence intervals
- **Severity:** **Minor**
- **Location:** `scripts/diagnose.py` lines 146–152, `results/primary_lift.csv`, `results/sensitivity.csv`, `results/lift_by_segment.csv`, `report.md` ("Headline and cross-check", "Segments, within channel", "Sensitivity", "Rival explanations"), and `skill-outputs/04-diagnose-change.md` (H6).
- **Evidence:** Querying `videos.sqlite` on the 554 matched Shorts channels (age `12–14d`) shows that a single Basketball channel (`[hashed id]`, with `n_pre = 37` Shorts in April–May averaging `18,274,446` views during the NBA Playoffs vs. `n_post = 15` Shorts in Sept–Oct averaging `2,560,545` views during the NBA off-season) accounts for **`676,154,520` of the `3,889,113,438` total pre-period Shorts views (17.39% of the entire 554-channel denominator)**.
  - Excluding that single channel raises Shorts `ratio_of_totals` from **`0.8144x` to `0.9563x`** (and raises Basketball Shorts in `lift_by_segment.csv` from `0.4104x` to `0.8767x`), resolving what the report calls an `"unexplained"` decline in Shorts (`0.81`).
  - In `diagnose.py` lines 146–152 (`long-form / shorts ratio, channels with both = 2.2194`), the author divides `lf_b['ratio_of_totals']` (`1.8075`, weighted by long-form `n_pre_c`) by `sh_b['ratio_of_totals']` (`0.8144`, weighted by Shorts `n_pre_c`) on the 502 overlapping channels, and sets `reps=0` (`rt_lo='', rt_hi=''`). Computing the 2,000-rep bootstrap gives `2.2194x [1.6804, 3.0270]`, and dropping the single outlier channel `[hashed id]` brings the 501-channel DiD down to **`1.8855x`** (`1.7814x` under PPML DiD) — right in line with the primary long-form estimate (`1.77x`).
- **Refutation check:** The author did not use the `2.22x` DiD as the primary estimate and rightly treated Shorts as a directional null check rather than a clean DiD. However, running `drop top 1% channels by pre views` only on long-form missed that a single channel drove the entire `-19%` drop in Shorts.
- **Why it matters to the owner's decision:** It does not alter the call (`minor`), but showing that 553 of 554 Shorts channels are actually flat (`0.956x`) eliminates the main anomaly in the control group and brings the DiD estimate (`1.89x`) into tight agreement with the headline (`1.77x`).
- **Narrow fix:** Report the leave-one-out / top-1%-trimmed Shorts ratio (`0.956x`), weight the 502-channel DiD consistently, and include its bootstrap 95% CI in `sensitivity.csv`.

---

### Finding 4 — The "Timing" table in `report.md` reports `log1p` geometric ratios (`2.01x–2.32x`) labeled simply as "Ratio" alongside `ratio_of_totals` tables (`1.77x`), and "Growth after day 29" (`straddler_growth.csv`) compares pooled unmatched channels across unequal elapsed age windows (`40.1d` vs. `30.1d`)
- **Severity:** **Minor**
- **Location:** `scripts/diagnose.py` lines 83–104 (`event_study.csv`) and lines 196–215 (`straddler_growth.csv`), `report.md` ("Timing" and "Growth after day 29", lines 253–284), and `skill-outputs/04-diagnose-change.md` (Sections 5 and 6).
- **Evidence:**
  1. **Scale switch in `event_study.csv` / `report.md` ("Timing"):** In `diagnose.py` line 96, `event_study.csv` computes `math.exp(st.mean(math.log1p(x['views']) - b[x['channel']]))` (a video-weighted geometric ratio of `log1p` views to each channel's pre-period `log1p` mean). In `report.md` ("Timing"), these numbers (`1.87, 2.11, 2.32, 2.12, 2.01` for publish weeks `2026-08-24` to `09-21`, and `1.02, 1.11, 1.28, 1.17` for `07-27` to `08-17`) are presented in a column headered simply `Ratio` immediately after tables reporting `Ratio of totals (1.77)`. Computed with the primary `ratio_of_totals` estimator (`n_pre_c`-weighted), those post-switch weekly ratios are **`1.65, 1.63, 1.79, 1.49, 1.67`** (and `1.76, 1.85, 2.27, 1.87, 1.71` when weighted by weekly video counts), while the straddler weeks `07-27`, `08-03`, `08-17` are `0.98, 0.82, 0.86`.
  2. **Unmatched channels, unequal elapsed windows, and single-video skew in `straddler_growth.csv`:** In `diagnose.py` lines 196–215, `straddler_growth.csv` selects videos with `27 <= a1 < 31` and `55 <= a2 < 70` and computes pooled `sum(view_count) / sum(prev_view_count)` across unmatched channel sets (`569`, `743`, and `674` channels). Querying `videos.sqlite` shows that Group 1 (`first 29 days under the old rule`, `+6.47%` growth) spans median age `28.19d` to `67.96d` (**`40.05` elapsed days**), whereas Group 3 (`all under the new rule`, `+3.86%` growth) spans median age `29.52d` to `59.59d` (**`30.05` elapsed days** — 25% shorter and starting 1.33 days later). Normalizing for elapsed days (`30 / dt`) reduces Group 1's pooled growth from `+6.47%` to **`+4.88%`** (`1.27x` Group 3, not `1.7x`). Furthermore, Group 2 (`published 07-26 to 08-08`, `+9.03%` aggregate growth over `30.07` elapsed days) exceeds fully-old Group 1 (`+6.47%`) only because a single viral video (`[hashed id]`, which grew from `21.07M` to `28.59M`, `+7.52M` views) accounts for **24.32% of the entire 8,002-video Group 2 view increment** (dropping that one video lowers Group 2 to `+7.28%`; on `geomean_growth`, which `report.md` omitted from its table, Group 1 is `+6.49%` vs. Group 2's `+4.94%` and Group 3's `+2.85%`).
- **Refutation check:** `04-diagnose-change.md` includes the `Geometric` column in Section 6, and `diagnose.py` comments that `event_study.csv` is on the typical-video scale. However, `report.md` omits both disclosures, leaving an apparent arithmetic contradiction in `report.md` (where every post-switch week in "Timing" is `2.01x–2.32x` while the overall post-switch headline is `1.77x`, and where partially-old Group 2 grows `+9.0%` vs. fully-old Group 1's `+6.5%`).
- **Why it matters to the owner's decision:** These supporting tables back the timing and non-restatement diagnoses; presenting geometric weekly ratios (`2.01x–2.32x`) without scale labels next to `1.77x` invites reader confusion about which multiplier is right.
- **Narrow fix:** Label the "Timing" column `Typical-video (geometric) ratio` and add the `Ratio of totals` column in `report.md`; in "Growth after day 29", normalize growth to a 30-day rate within common channels and include the geometric growth column in `report.md`.

---

### Finding 5 — The reading inventory table in `report.md` double-counts post-switch videos that have both `prev` and `last` readings inside the 2-day window (`56,247` readings for `31,870` long-form videos), and the `20–28d` sensitivity check (`1.49x`, CI `1.12–1.97`) has a 2.3-day pre/post maturity mismatch
- **Severity:** **Minor**
- **Location:** `report.md` ("Data" table, line 179; "Sensitivity" table, line 299), `scripts/explore.py` lines 53–64 (`explore_reading_inventory.csv`), and `scripts/diagnose.py` line 133 (`age window 20-28 days`).
- **Evidence:**
  1. **Reading vs. video counts in `report.md` ("Data"):** The table under "Data" reports `56,247` post-switch long-form observations at `28–30 days` (`13,618` before switch) and `60,913` post-switch Shorts observations at `12–14 days` (`45,177` before switch). Querying `videos.sqlite` shows that while all `13,618` pre-switch long-form readings are distinct videos (`prev` readings only), the `56,247` post-switch long-form readings come from only **`31,870` distinct videos** (`24,377` post-switch videos have *both* `prev` at mean age `29.02d` and `last` at mean age `29.63d` inside `[28, 30)`). Likewise, the `60,913` post-switch Shorts readings come from **`31,041` distinct videos** (`29,872` counted twice). While `02-explore-data.md` notes `(30,002 prev, 26,245 last)`, `report.md` drops that note and presents `13,618` vs. `56,247` directly under `"That gives clean comparisons at a fixed age"`. (Note: `pick_reading()` properly deduplicates to one reading per video before computing `primary_lift.csv`.)
  2. **Within-window age mismatch in `age window 20-28 days` (`sensitivity.csv`):** The `age window 20-28 days` sensitivity check (`1.4919x`, 95% CI `1.1212` to `1.9680`) is the only specification in the report whose 95% CI extends below the owner's `1.25x` threshold. Querying the selected readings in `[20.0, 28.0)` shows that pre-switch readings have a median age of **`26.40` days** (`mean 26.05d`), whereas post-switch readings (heavily October publishes censored by the extract date) have a median age of **`24.14` days** (`mean 24.10d`) — a **2.26-day maturity deficit** for the post group that biases the `20–28d` ratio downward.
- **Refutation check:** Neither issue biases the primary `1.77x` headline (`pick_reading()` deduplicates to 1 reading per video in `[28, 30)` where the median age gap is only `0.41` days, and controlling for continuous age changes the FE estimate by less than `0.04`).
- **Why it matters to the owner's decision:** Highlighting in `04-diagnose-change.md` that the `20–28d` interval dips below `+25%` (`1.12x`) overstates uncertainty in the October cohort when that dip is partly driven by a 2.3-day age mismatch inside the 8-day window.
- **Narrow fix:** Show distinct video counts alongside reading counts in the `report.md` Data table, and restrict or age-adjust the `20–28d` sensitivity check so pre and post cohorts have matched reading ages.

---

## 4. Candidate Objections Refuted Before Reporting

1. **Refuted objection — "Using `prev_view_count` in the pre-period and a mix of `prev_view_count` (`21,210`) and `view_count` (`3,769`) in the post-period biases the headline 1.77x":** Checked on `videos.sqlite`. For the `24,377` post-switch videos that have both `prev_view_count` (mean age `29.02d`) and `view_count` (mean age `29.63d`) inside `[28, 30)`, `sum(view_count) / sum(prev_view_count) = 1.00096` (`+0.10%`), and restricting the post group strictly to `prev_view_count` gives `1.7468x` (`sensitivity.csv`), confirming no material reading-type bias.
2. **Refuted objection — "Incomplete pre-period refetch coverage (0%–67% by week) creates selection bias":** Verified `selection_check.csv` on `videos.sqlite`. Within the 745 channels that have both covered and uncovered pre-switch videos published `2026-06-15..07-25`, the within-channel geometric ratio of later lifetime `view_count` (covered vs. uncovered) is `1.0166` (median within-channel log difference `+0.0044`), refuting within-channel popularity selection.
3. **Refuted objection — "`crosscheck.sql` drops fractional seconds via `substr(t,1,19)` and mismatches Python":** Verified against `videos.sqlite`. Despite `substr(t,1,19)`, `crosscheck.sql` matches `metric.py` to the exact integer on channel count (`746`), pre video count (`13,254`), and post video count (`23,962`), and to 6 decimal places on `ratio_of_totals` (`1.771112`).

---

## 5. Claims That Could Not Be Verified from Available Data

1. **Post-switch 30-second ("engaged") view counts:** Public YouTube statistics stored in `videos.sqlite` do not include YouTube Analytics' private "engaged views" metric, so the counterfactual old-rule count on post-`2026-08-24` plays cannot be observed directly.
2. **External web sources and vendor benchmarks:** Third-party articles cited in `report.md` (Social Media Today announcement date, vidIQ's `+30%` long-form estimate on its own dataset, and exact rollout hour on `2026-08-24`) lie outside `/tmp/aftergrid-eval/data/videos.sqlite`.
3. **Spot Sports' production ranking formula and engineering cost/reversibility:** Not supplied in the brief or database.
4. **Videos deleted or made private prior to the `2026-10-27` extract:** `videos.sqlite` contains only videos still publicly available on YouTube at extraction time.
