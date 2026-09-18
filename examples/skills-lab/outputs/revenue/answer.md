# Slight MRR growth masks erosion of the baseline account base

For the founder: month-end contracted MRR rose **$430→$440**, **+$10 / +2.33%** relative to baseline. This alone does not establish healthy growth. Baseline accounts ended at **$350**, down **$80**, while account D added $90 from a zero baseline.

| Mutually exclusive snapshot movement | Account | MRR change |
|---|---|---:|
| Entry from zero | D | +$90 |
| Expansion | A | +$20 |
| Contraction | C | −$20 |
| Churn to zero | B | −$80 |
| Unchanged | E | $0 |
| Net | All | **+$10** |

$430 + $90 + $20 − $20 − $80 = $440. “Entry” can include reactivation; the snapshots do not show whether D is a first-time customer. They also miss any intervening churn or reactivation.

Baseline MRR is the denominator for both retention measures. Gross MRR retention = ($430 − $80 churn − $20 contraction)/$430 = **76.74%**. Net MRR retention = ($430 − $80 − $20 + $20 expansion)/$430 = **81.40%**. One of four baseline active accounts became inactive (25% snapshot account loss); active count stayed four because D entered. Average MRR per active account rose $107.50→$110, but changing account membership means this is not evidence of price increases. These are descriptive values for the whole small supplied population, not estimates of a wider population or benchmarks of acceptable health.

| Ranked explanation | Planned prediction/test | Observation, counterevidence and status | Next useful evidence |
|---|---|---|---|
| 1. Entry offsets existing-base erosion | Existing-account MRR declines while total grows | Observed $80 decline offset by $90 entry; exact bridge supports this arithmetic account | Cancellation/contraction reasons and preventability for B/C; entry cost and sustainability for D |
| 2. Broad retained-base growth | Baseline accounts maintain/grow MRR | A expanded $20 but B/C lost $100 combined; net retention 81.40% contradicts broad growth | More snapshot periods and account tenure to test recurrence |
| 3. Currency/discount/merge or extract errors | Convention changes or invalid/duplicate accounts | Case rules exclude these convention changes; unique/nonnegative/finite and bridge checks pass | Upstream completeness and historical snapshots remain unavailable |

**Put the next week's investigative effort into retention**, specifically understanding the $100 churn/contraction and whether it is preventable. That is a bounded diagnostic priority because existing-base erosion is directly visible; it is not proof retention spending beats acquisition. The evidence cannot choose the ROI-optimal full-week investment. If these losses are unavoidable or inexpensive acquisition produces durable profitable MRR, acquisition could be preferable. Gather loss reasons, tenure, margins, acquisition costs and subsequent retention before committing broadly. No founder decision or outreach has been made.

Scope: USD contracted MRR at two month-end snapshots; same product/currency convention, no discount or merge changes as supplied. Dates/timezone not recorded. MRR is not cash, recognized revenue or profit. Five unique account rows, all included; no joins; numeric finite/nonnegative checks and exact Decimal bridge reconciliation passed. This validates the extract internally, not source completeness or intra-month timing. Cause, seasonality, repeated trend and broader business health remain unknown.

Evidence: [plan](plan.md), [executed Python](calculate.py), [actual stdout](stdout.json), source `data/recurring-revenue.csv` (hash in stdout). Rerun from supplied root: `python3 outputs/revenue/calculate.py`. Planned tests ran once; all observed results are above. Stop: missing cost/history/reason evidence prevents stronger allocation claims.
