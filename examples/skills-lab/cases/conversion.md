# A conversion decline

Use `diagnose-change` to answer this request with `data/conversion.csv`:

> Our session-to-signup conversion fell between these two comparable weeks. Should we roll back the signup
> experience? Explain what moved, test the strongest competing explanation you can with these data, and
> recommend the next step. Save a short analysis with the calculations and the query or code you actually ran.

Context available to the analyst: these are synthetic aggregate counts, one row per period and acquisition
channel. Every eligible session is counted once in exactly one channel; signups are attributed to that session.
The two periods have the same length and measurement definition. Sessions are not unique people. No random
assignment, change log, user-level events or cost data is supplied. The decision owner is the growth lead.

Use supplied files only. Do not invent a product change or unavailable evidence. No Engine or external data
connection is required. Preserve inputs and write outputs to a separate analysis directory.
