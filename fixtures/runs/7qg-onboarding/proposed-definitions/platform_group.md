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
(everything else). In this Instance's data every other recorded signup platform is a browser, so "web" reads as
"a browser" — but the rule is *not ios and not android*, and a platform added later would be counted as web
without anyone revisiting the grouping. The Instance's `platforms` table already carries a fourth value, `tv`.

That imprecision is why this is a Diagnostic calculation backing an exploratory Claim and not a Metric: the
grouping is honest about what it does, and nothing a Reader decides on rests on it. Splitting `tv` out, or
leaving an unknown platform out of the grouping entirely, is a version 2 of this definition and a change to the
query that produces the table — not a wording change here.

This is a Diagnostic calculation, not a Metric definition: it exists so an exploratory split can be described,
and nothing a Reader decides on rests on it. It has no approval block, and `lifecycle: proposed` is a display
field, not an approval — a published decision metric would need an Operator's approval attestation bound to this
file's content hash (`docs/contracts/instance-layout.md`).

## SQL (duckdb)

The same expression the query that produced the exploratory table uses
(`queries/retention_by_platform_arm.sql` in the Finding), so the definition and the numbers cannot drift apart:

```sql
select user_id,
       case when platform in ('ios', 'android') then 'mobile' else 'web' end as platform_group
from users
```
