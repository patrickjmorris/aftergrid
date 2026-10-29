# CAO Red-Team Review: Spot Sports YouTube Case Study Deck

**Reviewer Persona:** Chief Analytics Officer at a heavy YouTube sponsor brand; advisor to creators and platforms.  
**Target:** `spotsports-youtube-case-study.pdf` (specifically Slides 6–8 and supporting `analysis/`).

---

## 1. Sponsor Perspective: Would I do anything differently on Monday? What is missing?

**Not yet—the diagnosis is right, but the contracting mechanics are missing.** Slides 6–8 tell my media buyers *why* public view counts are inflated (+74% pooled lift; 43% of post-August 24 views are sub-30-second plays), which is a great wake-up call. However, if I hand Slide 7 and Slide 8 to my creator partnerships team on Monday morning, they cannot execute a single renewal or rate re-base without four missing operational pieces:

1. **How deals are actually priced (Flat Fee vs. CPV / CPM with Caps):**
   - Slide 6 ("Sponsors paying per view") and Slide 7 ("57% of the old price per view keeps that cost where it was") assume we buy on a pure uncapped CPV. In reality, most mid-to-macro YouTube integrations are **flat fees anchored to a 30-day average view benchmark** (often with a make-good floor and a payout cap), or CPV deals with a guaranteed minimum.
   - Where flat fees dominate, the immediate danger isn't mid-campaign CPV billing—it's **rate-card inflation at renewal**. When a creator whose pre-August baseline was 100k views now shows a 90-day trailing public average of 175k–185k views, we end up paying 1.75x–1.85x on a flat fee for the exact same audience.
2. **Tier-Specific Haircuts Instead of a Single "57%" Number:**
   - Slide 8 explicitly warns that *"the rise is uneven by channel size. So no single correction fixes it."* Yet Slide 7 gives sponsors a single headline haircut (**57%** of the old CPV, based on the 1.74x pooled average).
   - The underlying data (`lift_by_size_tier.csv`, Slide 5 / Appendix A6) already proves the required haircut depends heavily on channel tier:
     - **Micro (<50k avg views):** 1.85x lift $\rightarrow$ **46%** of views are sub-30s $\rightarrow$ fair public-view rate is **54%** of pre-change CPV.
     - **Mid (50k–300k):** 1.79x lift $\rightarrow$ **44%** sub-30s $\rightarrow$ fair rate is **56%** of pre-change CPV.
     - **Macro (300k+):** 1.49x lift $\rightarrow$ **33%** sub-30s $\rightarrow$ fair rate is **67%** of pre-change CPV.
   - Putting a single "57%" on Slide 7 contradicts Slide 8 and will cause my buyers to under-offer macro creators and overpay micro creators.
3. **Where Sponsor Reads Actually Sit (0:30 vs. 1:00–3:00+ and Mid-Rolls):**
   - Slide 7 argues: *"The added plays ended before 30 seconds, so none reached a sponsor read placed after the 30-second mark, unless the viewer skipped ahead."*
   - While true by definition ($0$ added views reach $\ge 0:30$ without scrubbing), **engaged views ($\ge 0:30$) are not ad-read views either**. Host-read integrations rarely sit at `0:30`; pre-rolls usually start around `0:45–1:30` (after the hook), and standard mid-rolls sit at `2:30–6:00+` in 10–20 minute videos (which make up the bulk of this catalog, per Appendix A5).
   - Framing 30-second "engaged views" as the gold standard for sponsor reach conflates *baseline view qualification* with *integration reach*. Sponsors need **Engaged Views** to normalize top-of-funnel channel sizing, plus **Audience Retention % at the exact read timestamp (`t_read` to `t_read + 60s`)** to price the integration.
4. **What to Ask Creators For (The Exact Verification Spec):**
   - Saying *"ask for engaged views and retention at the read"* (Slide 8) is too vague for an insertion order (IO). Creators will send cropped screenshots of lifetime public views if you don't specify the exact YouTube Studio export.
   - My buyers need a concrete checklist:
     - **YouTube Studio Advanced Mode CSV export** at **Day 28–30 post-publish** showing both `Views` (public) and `Engaged views` side-by-side.
     - **Traffic Source breakdown** (`Browse features` / `Suggested` vs. `Watch page`), because Agentio's data (Appendix A11) shows feed/recommendation plays inflate **5.00x** (only 20% engaged) while watch-page plays inflate **1.18x** (85% engaged).
     - **Audience Retention curve screenshot** highlighting the sponsor segment timestamps (`MM:SS–MM:SS`).

---

## 2. Creator & Platform Perspective: Actionable or Generic?

### Creators: **Generic (and missing their own slide)**
- Creators get a card on Slide 6 and one bullet on Slide 8 (*"report engaged views and watch time when comparing this fall with earlier months, and in pitches"*), while Sponsors get a dedicated Slide 7.
- For a creator I advise, that bullet is generic hygiene. What they actually need to know is:
  - **How to defend their rates in Q4:** Smart sponsors are already demanding a 40%–45% discount on public views. Creators whose traffic comes primarily from subscribers/watch page (1.18x ratio) or macro channels (1.49x ratio) will get unfairly penalized if agencies apply a blanket 1.74x / 43% haircut. Creators should proactively pitch their **Engaged-to-Public View Ratio**, **Average View Duration (AVD)**, and **30-second / Read-Timestamp Retention** to prove audience quality.
  - **Creative packaging trap:** Because Agentio found **5.0x inflation on feed/recommendation plays** (mostly homepage/feed autoplay), creators who optimize thumbnails/titles for passive feed hover-plays will see public views skyrocket while engaged views stagnate—destroying their conversion metrics for affiliate/promo-code sponsors.

### Platform (Spot Sports): **Specific in concept, but operationally incomplete & slightly mismatched with the report**
- The recommendation on Slide 8 (*"trial a ranking that compares each long-form video only with others published the same week, and keep July 27 to August 26 videos in a group of their own. Confirm the cost first"*) is much better than a naive multiplier, but has three gaps a platform PM would immediately flag:
  1. **Deck vs. Report contradiction on the August 24 week:** Slide 8 says *"compares each long-form video only with others published the same week, and keep July 27 to August 26 videos in a group of their own."* In `report.md` (Section 5 & A3/A14), the actual step happens on **August 27** (8/24–8/26 is 1.19x; 8/27–8/30 jumps to 1.99x), so `8/27–8/30` must be a 4-day mini-cohort, and `7/27–8/26` is **excluded/unranked** in the trial—not ranked "in a group of their own" (since 7/27–8/9 is at 1.01x while 8/24–8/26 is at 1.19x/1.29x).
  2. **Cold-start & historical coverage:** Appendix/Report Section 5 admits day-29 readings exist for only **18% to 72%** of old-rule weeks (mid-June to late July) and almost **0% of earlier weeks**, and a video has **no day-29 rank for its first 28 days**. How does a sports app rank trending videos on Day 1–7, or display all-time/seasonal leaderboards across weeks?
  3. **Within-week feed-autoplay bias:** Ranking within publish week fixes the August 24 cliff, but it **rewards feed-autoplay bait** over actual watch-page engagement (since feed plays inflate 5.0x vs. 1.18x on watch page).

---

## 3. Sizing in Managed Units & Claims vs. Data Support

### Are "So Whats" sized in units each group manages?
- **Partially.**
  - **Sponsors:** Sized in *cost per 30-second view (+74%)* and *relative CPV adjustment (57%)*. Missing: **effective CPM ($ eCPM) impact**, **flat-fee rate-card inflation** on 30/60/90-day trailing view averages, and **cost per read-reached view**.
  - **Creators:** Sized in *public view lift (+74% pooled, +113% typical, +85% micro)*. Missing: **engaged-view conversion rate (54%–67% by tier)** as a benchmark to compare their own YouTube Studio dashboard against.
  - **Spot Sports:** Sized in *top-1,000 list share (77% vs. 64% pool share)*. Missing: **how many videos/channels actually swap ranks** or how user click-through/engagement on the app's ranked lists is affected.

### Is anything claimed beyond what the data supports?
The underlying `report.md` is admirably rigorous after two review rounds, but **the deck simplifies several claims beyond what the data supports**:

1. **Slide 1 Headline ("YouTube views jumped 74% overnight") vs. the 3-day lag and catalog total:**
   - First, it wasn't "overnight" on August 24 in this dataset: videos published August 24–26 only rose **+19% pooled** (1.19x, Table A3); the full step didn't hit until **August 27 publishes (+99%, 1.99x)** for reasons the report admits are unknown.
   - Second, +74% is the *per-video cohort lift at day 29*, whereas the total stored catalog views only rose a modeled **~12%** (11%–43% bounds, Table A8). Calling it "YouTube views jumped 74% overnight" conflates new-release velocity with catalog stock.
2. **Slide 2 Event Study Chart plots a mixed-regime week (`8/24` at `+66%`) as a clean step:**
   - The `8/24` point on Slide 2 averages `8/24–8/26` (1.19x) and `8/27–8/30` (1.99x) into `+66%` (1.66x), visually hiding the 3-day lag documented in Table A3 and making the transition look simultaneous with YouTube's announcement date.
3. **Slide 6 & 7 treat inferred cross-cohort lift as direct measurement of sub-30-second plays ("Of a new view count, 43% are plays that ended before 30 seconds"):**
   - Spot Sports has **zero engaged-view or watch-time data**. The 43% (`1 - 1/1.7435`) is derived *entirely* by assuming true underlying viewership per video was 100.0% flat between May–July and September. While cross-checked against Agentio (40%), stating it as a direct measurement without caveat on Slides 6–7 overstates internal data support—especially when autumn sports calendars (NFL, European soccer, college football) start in late August/September (Soccer is 2.14x, Football is 2.12x vs. Golf 1.34x, Tennis 1.44x in Table A5).
4. **Slide 8 ("keep July 27 to August 26 videos in a group of their own"):**
   - Grouping 7/27–8/26 into a single ranking bucket treats a 7/27 video (1.01x lift) as comparable to an 8/25 video (1.19x pooled / 1.29x typical lift). The report leaves this band *out* of the trial; the deck says to group them together.
5. **Within-week rank preservation is assumed, not proven:**
   - The trial check (A9 / A15 / A17) only proves that *mean sport and tier percentiles* don't shift more than null weeks. Because Spot Sports lacks engaged views and traffic-source splits, it cannot test whether high-autoplay videos leapfrog high-retention videos within the same publish week (and Agentio's 5.0x feed vs. 1.18x watch-page split strongly implies they do).

---

## 4. What Would Make This the Deck I Forward to My Team?

Right now, this reads like an **internal Spot Sports methodology case study** (complete with Slide 2's "Spot Sports' +25% line", Slide 9's November re-check triggers, and Slide 10's pitch for `aftergrid` agent skills) that had Creator and Sponsor bullets bolted onto Slides 6–8 at the end.

To make me forward this to my VP of Media, my agency leads, and our partner creators with the note *"Read Slides 5–8 before you sign another Q4 YouTube IO"*, it needs:
1. **A Sponsor Contracting & Rate-Rebasing Playbook (on Slide 7):** Translate the tier ratios into an actionable rate table (Micro: 0.54x public CPV / 54% engaged benchmark; Mid: 0.56x / 56%; Macro: 0.67x / 67%) covering both **flat-fee baseline adjustments** (how to deflate a creator's post-8/24 trailing average when pricing a flat fee) and **CPV/CPM guarantee clauses**.
2. **A Concrete Verification Spec (Slide 8):** Specify the exact deliverable to require in creator IOs: *Day-30 YouTube Studio CSV export (`Views` + `Engaged views`), Traffic Source % from Feeds/Browse, and Retention % at the sponsor read timestamp (`t_read`)*.
3. **A Dedicated Creator Action Card/Slide:** Show creators how to audit their own `Engaged Views / Views` ratio by tier and traffic source so high-retention channels can defend their CPMs against blanket sponsor haircuts.
4. **Intellectual Honesty on the Headline Claims:** Explicitly separate *inferred cohort lift* (+74% in Spot Sports) from *direct same-play measurement* (Agentio's +67% overall / +74% size-matched), note the 3-day lag (8/27 vs. 8/24), and acknowledge the within-week feed-autoplay ranking risk (5.0x feed vs. 1.18x watch page).

---

## 5. The 5 Highest-Value Fixes, Ranked

1. **Rewrite Slide 7 into an operational Sponsor Pricing & IO Playbook (Flat Fee + CPV, Tiered Haircuts, Read Retention):**
   - Replace the single "57%" haircut (which contradicts Slide 8's warning against a single correction) with the **tier-specific adjustments** (`54%` Micro `<50k`, `56%` Mid `50k–300k`, `67%` Macro `300k+`).
   - Address **flat-fee renewals** (deflate post-Aug 24 trailing view averages by tier or require pre-Aug 24 / engaged-view baselines) alongside CPV deals, and distinguish **30-second engaged views** (for channel sizing) from **retention at the read timestamp** (typically `1:00–4:00`, for integration value).
2. **Give Creators and Sponsors concrete, copy-pasteable Monday-morning checklists on Slide 8:**
   - **For Sponsors:** Require (a) YouTube Studio Advanced Mode CSV export showing `Engaged views` at Day 30, (b) `Browse/Suggested` traffic share (flagging the 5.0x feed autoplay inflation vs. 1.18x watch page from A11), and (c) retention graph at the read timestamp.
   - **For Creators:** Show how to benchmark their channel's `Engaged / Public` ratio against their size tier (`54%` micro, `57%` mid, `67%` macro) to defend flat fees when their watch-page retention beats the category average.
3. **Fix the Spot Sports platform recommendation on Slide 8 to match the report and address live-product constraints:**
   - Correct *"keep July 27 to August 26 videos in a group of their own"* (which wrongly ranks 1.01x and 1.29x videos together) to match `report.md`: **split the Aug 24 week at Aug 27** and **flag/exclude the July 27–Aug 26 transition band** from cross-cohort rankings.
   - Explicitly state how the product handles **videos under 29 days old** (where day-29 rankings don't exist) and **within-week feed-autoplay bias** (where 5.0x feed inflation can still distort within-week ranks).
4. **Tighten causal & measurement claims on Slides 1, 2, 6, and 7 to match the data:**
   - On Slide 1 & 2, clarify that `+74%` is **per-video at day 29** (while total catalog views rose a modeled `~12%`), and show or note that the full step in Spot Sports data actually starts with **August 27 publishes** (`1.99x`), not overnight on August 24 (`8/24–8/26` was `1.19x`).
   - On Slides 6 & 7, label `43%` as **inferred from before/after cohort lift assuming flat underlying viewership** (corroborated by Agentio's `40%` direct engaged-view measurement), rather than stating as fact that Spot Sports measured play durations.
5. **Separate the industry playbook from the internal Spot Sports / `aftergrid` meta-pitch:**
   - If this deck is shared on LinkedIn for sponsors, creators, and platforms, move Spot Sports' internal owner threshold (`+25% line` on Slide 2, November reversal triggers on Slide 9) into the Spot Sports section or appendix, and use that main-deck real estate for the **traffic-source inflation split (5.0x feed vs. 1.18x watch page)** and the **Creator/Sponsor negotiation table**.

---

**Verdict:** Strong detective work that proves the August 24 view inflation is real and size-dependent (+85% micro to +49% macro), but Slides 6–8 stop at back-of-the-envelope CPV arithmetic instead of giving sponsors, creators, and product teams the contracting, verification, and ranking mechanics they actually use on Monday.
