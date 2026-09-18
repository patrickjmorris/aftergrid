# A small growth number

Use `diagnose-change` to answer this request with `data/recurring-revenue.csv`:

> Monthly recurring revenue grew. Is the business growing healthily, and should we put the next week into
> acquisition or retention? Explain the movement and the limits of what this small extract can tell us.
> Save a short analysis with the calculations and the query or code you actually ran.

Context: synthetic month-end contracted MRR snapshots, USD, one row per account, same product and currency
convention in both periods. Zero means the account has no active recurring contract at that snapshot. There
are no discounts, currency changes or account merges in this teaching case. This is MRR, not recognized
revenue, cash collections or profit. No cost, tenure, reason-for-cancellation or intra-month history is given.
The decision owner is the founder. This is the whole supplied population, not a statistical sample.

Use supplied files only. No Engine or external data connection is required. Preserve inputs and write outputs
to a separate analysis directory. Do not pretend the founder has already made a decision.
