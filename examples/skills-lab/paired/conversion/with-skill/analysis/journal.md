# Analysis journal

1. Read case, supplied diagnose-change skill and rigor reference, and CSV. Inputs are synthetic period/channel aggregates; no product release or experiment is documented.
2. Exploratory plan (after seeing raw counts; not preregistered): reproduce pooled conversion, validate period/channel keys and count bounds, then compare channel rates and standardize current conversion to baseline session shares. Lower rates within channels would support a within-channel deterioration; stable/higher rates with a lower pooled rate would favor composition as the arithmetic explanation. Mix alone predicts current conversion using current shares and baseline rates; compare that prediction with observed conversion.
3. Limits known before calculation: no earlier periods, unaffected group, event timestamps, ingestion times, release/exposure record, cost, or person IDs. No historical placebo, causal rollback estimate, or independent-person significance test can be run.

4. Executed calculate.py: all four period/channel keys unique, same channel coverage, positive sessions, bounded signups, no joins/exclusions. Pooled conversion 8.8% → 6.2%; totals 10,000 sessions each, 880 → 620 signups.
5. Exploratory composition test: both channel rates +1 pp; baseline-weighted current rate 9.8%; mix-only prediction 5.2% vs observed 6.2%. Exact within/mix contributions +1/−3.6 pp reconcile to −2.6 pp; interaction zero. Simple within-channel deterioration pattern absent; causal experience effect unidentified.
6. Decision: no rollback based solely on these aggregates. Establish actual change/exposure and audit measurement; conditional randomized comparison is proposed, not executed. Stop: further causal discrimination needs unavailable evidence.
