# Publication contract

Publication readiness is the separate fact that a **human on a trusted allowlist approved this exact content**. It is not evidence validity, not "the Checks passed" and not a field an author can set. Implementation: `src/publication/` (`policy.ts`, `github.ts`, `readiness.ts`, `outputs.ts`). Tests: `src/publication.test.ts`. Digest envelope and attestation shapes: `docs/contracts/finding-manifest.md`. Instance policy file: `docs/contracts/instance-layout.md`.

Three values, never a boolean:

| Readiness | Meaning |
| --- | --- |
| `ready` | A `publication_approval` attestation bound to the Finding's **current** digest was verified through the GitHub API: an APPROVED, undismissed review at the exact analyzed commit, by a login on the Instance allowlist, on a pull request opened by the Instance's automation identity. |
| `not_ready` | Something is definitely wrong or missing: no attestation, a stale one, an untrusted source, a wrong commit, an unauthorized or dismissed reviewer, an impossible author/approver split, an untrusted policy, or a Finding that is not `complete`. |
| `unknown` | The question could not be answered: no token, no client, or the API could not be read. Only a labelled draft may be produced. `unknown` is never rounded up to `ready` and never down to a silent pass. |

## The trust boundary

The proposed Finding supplies a **pointer**, not a verdict: `attestations[].source` names a repository, pull request, review id and commit sha. Everything that decides the verdict lives outside the Finding directory:

- the **allowlist** and the **automation identity**, in the Instance's `aftergrid.yaml` (`publication.repository`, `publication.trusted_approvers`, `publication.automation_login`);
- the **review itself**, read from the GitHub API;
- the **credential**, read from `GITHUB_TOKEN` or `GH_TOKEN` in the environment — never from a manifest, a memo, a Finding field or any other agent-editable file.

An attestation naming a repository other than `publication.repository` is rejected *before* any network call, so a Finding cannot make the runner talk to a repository its Instance does not trust.

**The policy file must be guarded.** Nothing in the Engine can stop a pull request that edits both the Finding and `aftergrid.yaml` in the same branch. Put `aftergrid.yaml` behind CODEOWNERS and branch protection so a change to it needs its own human review. This is a repository-configuration requirement, not something `check` enforces.

`readPublicationPolicy` reports `policy_untrusted` and yields no policy at all when the policy file is missing, unparsable, has no `publication` section, has a malformed `repository` or login, has an empty or missing `trusted_approvers`, has no `automation_login`, or lists `automation_login` among `trusted_approvers`. An unreadable policy is never treated as permissive.

## What `ready` requires

`assessReadiness({ dir, manifest, instanceRoot, github, now })` requires every one of these, per attestation, and stops at the first failure:

1. The Instance policy is trustworthy (above).
2. `kind: publication_approval` and `content_digest` equal to the digest **recomputed from the directory now** (`digestOf`, the single implementation in `scripts/lib/validate-finding.mjs`). A stale binding is `stale_attestation`.
3. `source.type: github_pr_review`. An `unverified_note` is reported in the reasons as a note that is visibly not an approval; it is not a defect and produces no error.
4. `source.repository` equals the Instance's `publication.repository`.
5. A review with `source.review_id` exists on that pull request and its state is `APPROVED`. A dismissed review comes back as `DISMISSED` and is rejected.
6. `review.commit_id` equals `source.commit_sha` **and** the pull request's `head_sha` equals `source.commit_sha`. An approval counts only for the commit it was given on, and only while that commit is still the head.
7. `review.submitted_at` parses and is not in the future (60s of clock skew allowed).
8. The approval is not superseded: no later `CHANGES_REQUESTED` or `DISMISSED` from the same reviewer, and — deliberately stricter than GitHub's own merge rules — no later unresolved `CHANGES_REQUESTED` from any other trusted approver.
9. `review.user_login` is on `trusted_approvers`.
10. The pull request author is not the approver and is not on `trusted_approvers` (`solo_setup_invalid`), and is the Instance's `automation_login` (`untrusted_attestation` otherwise).
11. `finding.state` is `complete`.

The `attester` string in the manifest is display only. When it disagrees with the verified login, both are reported and the verified login is what counts.

`assessReadiness` returns `{ readiness, reasons, verified, errors, warnings }`, following the same split as `validateDecisionsFor`:

- **errors** are defects in the Finding's own attestations: `stale_attestation`, `untrusted_attestation`, `solo_setup_invalid`. Any of them forces `not_ready`, even when a second attestation verified.
- **warnings** are `policy_untrusted`. An Instance that cannot verify publication is not a defect in the Finding: a draft in such an Instance is still perfectly valid, it simply never reaches `ready`.
- Any read that could not be completed — no client, no token, network failure, HTTP error, rate limit, malformed body, truncated review list — produces `unknown` with the error class named in the reason, and never an error masquerading as a rejection.
- `verified` lists what was actually verified: attestation index, review id, the login the API returned and the commit sha. It is empty unless `readiness` is `ready`.

### Why a single account cannot work

GitHub does not let the author of a pull request approve it. A setup where one account both opens the Finding pull request and approves it is therefore impossible, not merely discouraged, and `solo_setup_invalid` says so with no bypass flag, no environment variable and no override. The remedy is always the same: a separate automation account opens the pull request; a human approves it.

## Definition approvals versus Finding approvals

They bind different things and fail independently:

- a **definition approval** binds the definition file's own content hash (`definitionHash`, front matter minus `approval`, plus body) and is validated by `validateFinding`. This module does not re-implement it.
- a **Finding approval** binds the Finding's digest, which covers the semantic manifest, memo, query, Check, chart-spec and result contents and the pinned renderer versions.

So a cosmetic change excluded from the digest envelope (`finding.generated_at`, `executions[].executed_at`, drift fingerprints, the attestations themselves) invalidates nothing, and an unchanged definition approval survives a Finding revision. A change to a Claim's `type`, `material_caveat` or `exclusions`, or to `export_policy`, changes the digest and invalidates the Finding's attestation while leaving the definition approval intact. `src/publication.test.ts` asserts both directions by recomputing digests.

## Generated outputs are not evidence

`verifyGeneratedOutputs(dir)` copies the Instance (without its sibling Findings and without the cached `render/` directory), re-renders the Finding from its validated source, and compares `render/finding.html` and every chart SVG **byte for byte** with what is on disk. Any difference, extra generated-looking file or missing file is `tampered_output`. The returned `regenerated` map holds the fresh bytes: **publication uses those, never the files on disk.** Hand-authored references in `render/` (`finding.template.html`) are not generated and are not compared.

- PNG previews are excluded. The WASM rasterizer's output depends on the font it finds (`AFTERGRID_FONT`), so a byte comparison would report the machine, not a tamper. The SVG each PNG is made from is compared.
- Vega numbers SVG def ids from a process-global counter, so the canonical output is that of a fresh `aftergrid render`. `verifyGeneratedOutputs` calls `resetSVGDefIds()` before re-rendering to reproduce it. That reset is process-global: do not run an unrelated render concurrently in the same process.
- The re-render uses the offline readiness from `checkArtifact`, which is what `aftergrid render` writes into the draft banner. Rendering deliberately does not call the GitHub API, so the artifact stays reproducible; publication readiness comes from `check`.

## What this does **not** enforce

- **That the policy file is protected.** CODEOWNERS and branch protection are repository configuration. `check` cannot see them.
- **That the approver read the Finding.** An APPROVED review is evidence of a click by a trusted account, nothing more.
- **Branch protection, required reviews, merge state.** The pull request's `state` and `merged` are reported in the reason text and never required; readiness is about the review at the commit, not about the merge.
- **Commit signing, or that `commit_sha` is the commit the evidence was produced on.** The attestation names it and the review must match it; nothing here re-derives it from git history.
- **Organisation membership, SAML, or whether a trusted login is still an employee.** The allowlist is whatever the Instance file says.
- **Token scope.** A token with write access works exactly like a read-only one; only reads are ever issued (see the runbook).
- **PNG previews, and any output other than `finding.html` and `*.svg`.**
- **Concurrency.** Two runners verifying and publishing at once is not coordinated here.
- **Anything about a source that is not `github_pr_review`.** No other trust source exists in v0.

## Wiring into `check`

`src/commands/check.ts` is not changed by this contract's own bead; the readiness block it ships with is the
offline, conservative one from `validateFinding`, which can never reach `ready`. The maintainer wires this module
in by calling `assessReadiness` from the async `check()` (not from the sync `checkArtifact`, which `render` uses
and which must stay offline and reproducible), passing `github: null` when no token is configured so readiness
stays `unknown`. The exact snippet is in the bead's hand-off. Two rules the wiring must keep:

- `check` never mutates hashed content. Nothing here writes to the Finding directory.
- evidence validity and publication readiness stay separate axes in the report. Evidence errors force `not_ready`,
  but a `not_ready` or `unknown` readiness never makes evidence invalid.

## Human round trip: the solo pilot runbook

One person, one bot, no reviewer credentials on the runner.

1. **Create the bot identity once.** A second GitHub account (or a GitHub App installation) that is *not* the human. Give it write access to the Instance repository so it can open pull requests. Put its login in `publication.automation_login`. Put the human's login in `publication.trusted_approvers`. Commit `aftergrid.yaml` and protect it with CODEOWNERS + branch protection so only the human can change it.
2. **The bot opens the pull request.** The agent (running as the bot) commits the Finding directory to a branch and opens a pull request in `publication.repository`. Record the branch head sha.
3. **The human reviews and approves at that exact sha.** Open the pull request, read the Finding, and submit an **Approve** review. GitHub records it against the current head commit. If anything is pushed afterwards, the approval no longer sits at the head and readiness drops back to `not_ready`; ask for a fresh review.
4. **Write the attestation.** Add to `manifest.yaml`:
   ```yaml
   attestations:
     - kind: publication_approval
       source: { type: github_pr_review, repository: owner/repo, pull_request: 41, review_id: 900041, commit_sha: <the approved head sha> }
       attester: the-human-login       # display only
       date: "2026-07-20"
       content_digest: { algorithm: sha256, value: <the Finding's current digest> }
   ```
   Attestations are excluded from the digest, so adding one does not change the digest it binds.
5. **The runner verifies with a read-only token.** Export `GITHUB_TOKEN` (or `GH_TOKEN`) holding a token with read access to the repository — a fine-grained token with *Pull requests: read* is enough. It must not be the human reviewer's session or anything that could submit a review. Run `aftergrid check <finding-dir>`; readiness becomes `ready` only if every rule above holds.
6. **Regenerate before publishing.** Run `aftergrid render <finding-dir>` (or `verifyGeneratedOutputs`) so the published HTML and SVG are the ones the validated source produces, not whatever is cached beside it.

The agent never approves, never holds reviewer credentials and never writes to the API. If the human is unavailable, the honest outcome is a labelled draft.

## Not verified in this repo

The GitHub path in this bead is exercised only through the injectable fake in `src/publication.test.ts` and through a fake `fetch` for the real client's URLs, headers, method and error classes. **No test calls api.github.com.** The end-to-end sandbox smoke described in the runbook — a real repository, a real bot account opening a real pull request, a real human approval at a real sha — has **not** been run: it needs Patrick to create the bot identity. Until that happens, treat "the real API path works" as untested, not as passing. Nothing in this repository may stand in for the human reviewer or open a pull request under a human's name to make the smoke test appear to pass.
