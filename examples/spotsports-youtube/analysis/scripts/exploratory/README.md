# Exploratory probes

First-look probes run during explore-data and early diagnose-change, kept as a record of what ran. They print to stdout and write nothing to `results/`. Every number in the report comes from `scripts/run_all.py`, except the first-look figures in `skill-outputs/02-explore-data.md` that cite `probe1.py`.

`review_probe1.py` to `review_probe5.py` re-check the analysis-review findings against the data. Probes 1 to 4 ran before any code changed; probe 5 ran after `metric.py` was revised and before `diagnose.py` was (`skill-outputs/06-analysis-review.md`). Probes that import `metric.py` (`try_metric.py` and the review probes) now run against definition version 2, so their output differs from what they printed when first run. `try_metric.py` also prints the per-channel tables that `lift()` now returns. Checks that informed the revision were then built into `scripts/diagnose.py` and `scripts/review.py`, which `run_all.py` runs.

Run any probe with `python3 -I scripts/exploratory/<name>.py` from `examples/spotsports-youtube/analysis`.

`round2_probe1.py` to `round2_probe4.py` re-check the round-2 review findings (2026-10-28). Probe 1 reproduces the contrast inside the 08-24 publish week and the same split in every week. Probe 2 traces the 06-22 week's high split to one channel's zero-view uploads. Probe 3 prototypes the trial's success check. Probe 4 reproduces the crossing accrual scenarios, the reviewer's example video, and the widest accrual range the timestamps allow. Probes 1, 3 and 4 were then built into `scripts/review.py` and `scripts/diagnose.py`.

`external_probe1.py` and `external_probe2.py` support the comparison with published estimates (2026-10-28). Probe 1 compares ways to put channels in Agentio's size tiers using pre-switch counts. Probe 2 confirms that `external.cohort_percentiles` reproduces the trial check's sport spread in `results/trial_rank_check.csv`. The comparison itself is in `scripts/external.py`.
