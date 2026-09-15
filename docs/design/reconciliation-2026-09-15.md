# Reconciliation of the independent review (2026-09-15)

Review: `independent-review-2026-09-15.md` (CobaltSpring). Rulings by Patrick where a finding reversed a settled choice.

| # | Finding | Disposition | Recorded in |
|---|---------|-------------|-------------|
| 1 | Reader persona too passive | Accepted: understand / inspect / continue affordances; Reader can follow up without SQL; no chat surface in v0 | ADR 0001 amendment, CONTEXT.md (Reader), design doc |
| 2 | Checks ≠ trust | Accepted: separate trust facts, Claim type, inconclusive outcomes valid, pre-registered comparison | ADR 0004 amendment, CONTEXT.md (Check, Claim, Finding, relationships) |
| 3 | Snapshot can't reproduce history | **Accepted, reversing morning decision**: retained inputs, three guarantees | ADR 0008, CONTEXT.md (Snapshot) |
| 4 | Evidence model over markdown lint | Accepted: typed results + manifest + references; Vega-Lite subset; wider revision rule. Schema detail open with CobaltSpring | ADR 0004 amendment, design doc |
| 5 | Success test measures repetition | Accepted as two-tier gate; failure fixtures added | design doc |
| 6 | Sharing / exception rules | Accepted; Snap citation narrowed | ADR 0006 amendment |
| 7 | Scope ahead of experiment | **Rejected by Patrick**: v0 scope kept; revisit after first Finding | design doc note |
| 8 | Last-mile positioning is a hypothesis | Accepted as hypothesis; Ramp "no charts" claim independently confirmed by PurpleEagle's full read | ADR 0001 amendment |
| 9 | Governance and vocabulary compress states | Accepted: three definition classes, versioning, Decision record, glossary scope limited to internal docs | ADR 0007 amendment, CONTEXT.md |

Open with CobaltSpring: minimum evidence schema for v0; smallest craft library they would not block given finding 7's rejection.
