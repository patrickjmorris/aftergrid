# A pooled conversion decline can coexist with improvement in every channel

Status: **proposed**. Source observation dates/version: not recorded; supplied teaching extract `data/conversion.csv`, content hash in referenced stdout. This is a local proposed lesson, not an approved definition or global memory. Review owner: not supplied.

Retrieval terms: session-to-signup conversion; acquisition channel; period/channel aggregate grain; pooled rate; denominator weights; mix shift; within-channel comparison.

Context/prior assumption to challenge: a lower overall session-to-signup rate might be read as deterioration of the signup experience. The actual completed analysis found 880/10,000→620/10,000 (8.8%→6.2%) while direct rose 10%→11% and paid rose 4%→5%. Paid's session share rose 20%→80%. Baseline-weighted current conversion was 9.8%. The exact −2.6 pp change split into +1.0 pp rate and −3.6 pp mix contributions, with interaction assigned to mix.

Supporting artifacts: [completed answer](../../conversion/answer.md), [actual calculation](../../conversion/calculate.py), [stdout with source hash](../../conversion/stdout.json). These support the arithmetic observation; they do not verify the cause of traffic or behavior changes.

Changed practice: before diagnosing aggregate conversion movement, reproduce pooled numerator/denominator, compare channel-specific rates and denominator shares, then perform an exact common-support decomposition. This extract demonstrates why the aggregate alone could prompt an unjustified rollback.

Applicability: exhaustive mutually exclusive channel assignment, same eligibility/attribution definitions, comparable complete periods and session unit; sessions are not unique people. Schema/definition version dates are not supplied. Match channel support and validate counts before reuse. Common weights require observed rates in both periods; entry/exit channels need separate treatment. Internal count checks do not verify source completeness.

Counterexample/invalidating condition: a new period can recover because rates improve while channel shares stay constant, or both effects can act together. Unchanged weights would reject reversal of the previous mix shift. Changed definitions, attribution or channel support invalidate a naive comparison. Do not assume the earlier mechanism repeats.

Uncertainty: no experiment, release log, costs or user-level evidence identifies cause. No conflicting completed analysis is currently in the designated local outputs. A search of existing outputs for conversion/mix/session/grain found the first diagnosis and plans but no prior lesson store; this separate local lesson is saved at the user's request.

Next-task retrieval cue: for comparable session-to-signup movement, retrieve this proposed note and check current channel weights and within-channel rates before applying a mix explanation. Treat the practice as applicable, and the old explanation as a hypothesis to test.
