---
finding: fnd_sz3jbe3thahp
revision: 1
---

# New users who got the onboarding checklist came back more often

## Answer

Yes. New users who saw the onboarding checklist came back within a week more often than new users who did not, and the difference is big enough to keep the checklist.

<!-- material_caveat -->
This is a fair comparison only because the two groups were assigned at random. If the checklist had gone to a particular kind of user (for example only iPhone users), the difference could be about those users, not the checklist. And the gap is one experiment's measurement: the {{ext:keep_threshold}} bar is a rule the team agreed in advance for acting on it, not a promise that the gap stays that size.

## Decision it informs

Whether to keep the onboarding checklist for all new users or remove it. Dana owns the decision. Before the experiment, the team agreed the checklist earns its place if it lifts the share of new users who come back within a week by at least {{ext:keep_threshold}}.

## Evidence

### New users who saw the checklist came back within a week more often than new users who did not: {{ref:retention_by_arm.checklist.retained_7d_rate}} compared with {{ref:retention_by_arm.control.retained_7d_rate}}. <!-- claim: c1 -->

<!-- chart: retention_by_arm_chart -->

Who is counted: every person who signed up between the first of June and the twelfth of July (New York time) and was randomly given one of the two onboardings, {{derived:total_signups}} people in all. "Came back" means they opened the app on at least one of the seven days after the day they signed up.

Compared with what: the people who were randomly given the old onboarding at the same time.

The gap is {{derived:lift}}, above the {{ext:keep_threshold}} the team agreed on before the experiment. Out of {{ref:retention_by_arm.checklist.signups}} people who saw the checklist, {{ref:retention_by_arm.checklist.retained}} came back. Out of {{ref:retention_by_arm.control.signups}} who saw the old onboarding, {{ref:retention_by_arm.control.retained}} came back.

<!-- table: retention_by_arm_table -->

Left out: people who signed up before the first of June or after the twelfth of July were not part of the experiment and are not counted.

Limits: "came back" says nothing about what they did in the app. Six weeks of early-summer signups; a different season could behave differently.

### The difference shows up on phones and not on the web: {{derived:mobile_lift}} on mobile against {{derived:web_lift}} on the web. <!-- claim: c2 -->

<!-- table: retention_by_platform_arm_table -->

This split was not planned before the experiment. It is a follow-up look, so treat it as a lead to test, not a settled fact. On phones, {{ref:retention_by_platform_arm.mobile_checklist.retained_7d_rate}} of checklist users came back against {{ref:retention_by_platform_arm.mobile_control.retained_7d_rate}} of the others. On the web the two groups are small, so the web number moves a lot with a handful of people: {{ref:retention_by_platform_arm.web_checklist.retained_7d_rate}} against {{ref:retention_by_platform_arm.web_control.retained_7d_rate}}.

## How we checked

- No user is counted twice (Check unique_users).
- The two groups are about the same size, as random assignment should produce (Check arm_balance).
- The count of people who came back matches the approved definition of "came back within a week" computed a second way (Check retained_7d_reconcile).
- Definition used: retained_7d v2. An approval by Dana dated the twenty-eighth of May is recorded in the team's records; this draft has not verified it.
- Data: the saved results can be replayed. The retained inputs here are trimmed stubs, so the queries cannot be rerun against them.
- Method review: none was performed. This is a generated negative fixture; the recorded review entry says so. No human has approved this Finding for publication; it is a draft.

## What would change our mind

If the checklist group were not at least {{ext:keep_threshold}} ahead of the other group, with at least five hundred people in each group, the checklist did not help enough to keep (Check falsifier_lift, expected to pass).

On a re-check, the main claim is re-tested on the same six weeks of signups with the same definition; it holds if the gap is still at least {{ext:keep_threshold}}. It cannot be re-tested if the definition changes or if there is no longer a group without the checklist. The phone-versus-web claim is a judgement for the next experiment, not a number to re-test; Dana decides.

## Appendix

- Queries: retention_by_arm (primary comparison), retention_by_platform_arm (exploratory split), under queries/.
- Results: retention_by_arm, retention_by_platform_arm, under results/.
- Retained inputs: inputs/users.csv, inputs/events.csv, hashes in the manifest. Both are trimmed stubs in this fixture.
- Parameters: analytical timezone America/New_York; window first of June to twelfth of July.
- This directory is a generated negative fixture for the evidence seam (fixtures/negatives). It is not a real Analysis, and nothing in it was reviewed or approved.
