# Conversion diagnosis plan
Authored after reading the small extract, before executing calculations; this is not preregistration.

Scope: session-to-signup conversion = signups / eligible sessions, across the supplied baseline/current comparable weeks, partitioned by channel. Sessions are not people. Dates/timezone are not recorded; equal duration and unchanged definitions are supplied context. Growth lead owns the rollback decision.

First validate unique (period, channel) keys, exact period/channel coverage, positive integer denominators and 0 <= signups <= sessions. No joins or exclusions. Reproduce pooled totals, absolute percentage-point and relative changes. Extract checks cannot verify late arrivals, completeness against an upstream source, or instrumentation history; no change log exists.

Then test two explanations: (1) worsening conversion within comparable channels predicts falling channel rates; (2) acquisition mix predicts shifting session weights toward the lower-rate channel. Compute each channel's rate and share, standardize current rates to baseline weights, and decompose exactly into baseline-weighted rate changes plus current-rate-valued mix changes. If rates decline at fixed weights, mix alone is insufficient; if rates improve but the pooled rate falls, a broad within-channel decline is contradicted and composition is an arithmetic explanation. Interaction belongs to mix in this ordering.

Stop after decomposition and reconciliation: aggregates cannot separate product effects, user selection within channels or external conditions. No rollback recommendation should assume an unobserved product release.
