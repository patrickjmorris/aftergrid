---
id: platform_group
version: 1
kind: diagnostic
lifecycle: proposed
grain: user
population: users with a recorded signup platform
denominator: not applicable; this is a grouping, not a rate
window: not applicable; the grouping does not depend on a window
owner: Dana Okafor
---
Which kind of device a user signed up on, grouped into two: **mobile** (the iPhone or Android app) and **web**
(a browser). Anything else is left out of the grouping rather than folded into one of the two.

This is a Diagnostic calculation, not a Metric definition: it exists so an exploratory split can be described,
and nothing a Reader decides on rests on it. It has no approval block, and `lifecycle: proposed` is a display
field, not an approval — a published decision metric would need an Operator's approval attestation bound to this
file's content hash (`docs/contracts/instance-layout.md`).

## SQL (duckdb)

```sql
select user_id,
       case when platform in ('ios', 'android') then 'mobile'
            when platform = 'web' then 'web'
       end as platform_group
from users
```
