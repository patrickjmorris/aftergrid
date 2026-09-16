// ag-publication-binding-6r0: publication readiness is decided by a verified human approval at an exact commit,
// read from a trusted source, against the exact content that was approved. Every GitHub read in this file goes
// through the injectable fake: the real API is never called from a test, and no test ever impersonates a reviewer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as toYaml } from "yaml";
import { assessReadiness } from "./publication/readiness.ts";
import { readPublicationPolicy } from "./publication/policy.ts";
import { createFakeGitHub, createGitHubClient, tokenFromEnv, GitHubError, type PullRequest, type Review } from "./publication/github.ts";
import { verifyGeneratedOutputs } from "./publication/outputs.ts";
import { render } from "./commands/render.ts";
// @ts-ignore: shared ESM validation library.
import { digestOf, definitionHash } from "../scripts/lib/validate-finding.mjs";

const SLUG = "2026-07-20-onboarding-checklist-retention";
const REPO = "loop-example/analytics";
const PR = 41;
const REVIEW_ID = 900041;
const SHA = "9f1c2b3a4d5e6f708192a3b4c5d6e7f809a1b2c3";
const HUMAN = "dana-okafor";
const BOT = "loop-aftergrid-bot";
const NOW = new Date("2026-07-21T00:00:00Z");

function copy(): string {
  const root = mkdtempSync(join(tmpdir(), "ag-publication-test-"));
  cpSync(fileURLToPath(new URL("../fixtures/instance/", import.meta.url)), root, { recursive: true });
  return root;
}

/** A Finding whose attestation points at a PR review, bound to its current content digest. */
function setUp(mutate: (m: any) => void = () => {}) {
  const root = copy();
  const dir = join(root, "analytics", "findings", SLUG);
  const manifestPath = join(dir, "manifest.yaml");
  const manifest: any = parseYaml(readFileSync(manifestPath, "utf8"));
  manifest.attestations = [{
    kind: "publication_approval",
    source: { type: "github_pr_review", repository: REPO, pull_request: PR, review_id: REVIEW_ID, commit_sha: SHA },
    attester: HUMAN,
    date: "2026-07-20",
    content_digest: digestOf(manifest, dir),
  }];
  mutate(manifest);
  writeFileSync(manifestPath, toYaml(manifest, { lineWidth: 0 }));
  return { root, dir, manifest, manifestPath };
}

const approvingReview = (over: Partial<Review> = {}): Review =>
  ({ id: REVIEW_ID, user_login: HUMAN, state: "APPROVED", commit_id: SHA, submitted_at: "2026-07-20T15:00:00Z", ...over });
const botPull = (over: Partial<PullRequest> = {}): PullRequest =>
  ({ head_sha: SHA, user_login: BOT, state: "open", merged: false, ...over });
const github = (pull: PullRequest, reviews: Review[], throws?: () => never) =>
  createFakeGitHub({ repository: REPO, pull_request: PR, pull, reviews, throws });

const categories = (r: { errors: { category: string }[] }) => r.errors.map((p) => p.category);
const warnings = (r: { warnings: { category: string }[] }) => r.warnings.map((p) => p.category);

test("a current approval by a trusted human at the exact head commit, on a pull request the bot opened, is ready", async () => {
  const { dir, manifest } = setUp();
  const r = await assessReadiness({ dir, manifest, github: github(botPull(), [approvingReview()]), now: NOW });
  assert.equal(r.readiness, "ready", JSON.stringify(r.reasons));
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.verified, [{ attestation: 0, review_id: REVIEW_ID, login: HUMAN, commit_sha: SHA }]);
  assert.match(r.reasons.join("\n"), /verified APPROVED review 900041 by dana-okafor/);
});

test("an approval bound to an older digest is stale, never ready", async () => {
  // The attestation is written first, then a Claim exclusion changes: the same words, different content.
  const { dir, manifest } = setUp((m) => m.claims[0].exclusions.push("Users who deleted their account before day 7."));
  const r = await assessReadiness({ dir, manifest, github: github(botPull(), [approvingReview()]), now: NOW });
  assert.equal(r.readiness, "not_ready");
  assert.deepEqual(categories(r), ["stale_attestation"]);
  assert.match(r.reasons.join("\n"), /current content digest/);
});

test("an unverified_note is visible and is never an approval", async () => {
  const { dir, manifest } = setUp((m) => { m.attestations[0].source = { type: "unverified_note", note: "looks good to me" }; m.attestations[0].attester = "someone"; });
  const r = await assessReadiness({ dir, manifest, github: github(botPull(), [approvingReview()]), now: NOW });
  assert.equal(r.readiness, "not_ready");
  assert.deepEqual(r.errors, [], "a note is not a defect in the Finding; it simply does not approve it");
  assert.match(r.reasons.join("\n"), /never an approval/);
  assert.deepEqual(r.verified, []);
});

test("an approval given on a different commit than the attestation claims is rejected", async () => {
  const { dir, manifest } = setUp();
  const other = "0".repeat(39) + "f";
  const r = await assessReadiness({ dir, manifest, github: github(botPull(), [approvingReview({ commit_id: other })]), now: NOW });
  assert.equal(r.readiness, "not_ready");
  assert.deepEqual(categories(r), ["untrusted_attestation"]);
  assert.match(r.reasons.join("\n"), /was submitted on commit/);
});

test("an approval that is no longer at the pull request head is rejected", async () => {
  const { dir, manifest } = setUp();
  const r = await assessReadiness({ dir, manifest, github: github(botPull({ head_sha: "b".repeat(40) }), [approvingReview()]), now: NOW });
  assert.equal(r.readiness, "not_ready");
  assert.deepEqual(categories(r), ["stale_attestation"]);
  assert.match(r.reasons.join("\n"), /no longer the analyzed commit/);
});

test("an approval by a login that is not on the Instance allowlist is rejected", async () => {
  const { dir, manifest } = setUp();
  const r = await assessReadiness({ dir, manifest, github: github(botPull(), [approvingReview({ user_login: "mallory" })]), now: NOW });
  assert.equal(r.readiness, "not_ready");
  assert.deepEqual(categories(r), ["untrusted_attestation"]);
  assert.match(r.reasons.join("\n"), /not on the Instance trusted_approvers allowlist/);
});

test("a dismissed review is rejected", async () => {
  const { dir, manifest } = setUp();
  const r = await assessReadiness({ dir, manifest, github: github(botPull(), [approvingReview({ state: "DISMISSED" })]), now: NOW });
  assert.equal(r.readiness, "not_ready");
  assert.deepEqual(categories(r), ["untrusted_attestation"]);
  assert.match(r.reasons.join("\n"), /is DISMISSED, not APPROVED/);
});

test("a later CHANGES_REQUESTED by the same reviewer supersedes the approval", async () => {
  const { dir, manifest } = setUp();
  const reviews = [approvingReview(), { id: REVIEW_ID + 1, user_login: HUMAN, state: "CHANGES_REQUESTED" as const, commit_id: SHA, submitted_at: "2026-07-20T18:00:00Z" }];
  const r = await assessReadiness({ dir, manifest, github: github(botPull(), reviews), now: NOW });
  assert.equal(r.readiness, "not_ready");
  assert.deepEqual(categories(r), ["untrusted_attestation"]);
  assert.match(r.reasons.join("\n"), /was superseded: dana-okafor left CHANGES_REQUESTED/);
});

test("an earlier CHANGES_REQUESTED that the same reviewer then resolved does not block", async () => {
  const { dir, manifest } = setUp();
  const reviews = [{ id: 1, user_login: HUMAN, state: "CHANGES_REQUESTED" as const, commit_id: SHA, submitted_at: "2026-07-20T09:00:00Z" }, approvingReview()];
  const r = await assessReadiness({ dir, manifest, github: github(botPull(), reviews), now: NOW });
  assert.equal(r.readiness, "ready", JSON.stringify(r.reasons));
});

test("one account cannot both open the pull request and approve it", async () => {
  const { dir, manifest } = setUp();
  const r = await assessReadiness({ dir, manifest, github: github(botPull({ user_login: HUMAN }), [approvingReview()]), now: NOW });
  assert.equal(r.readiness, "not_ready");
  assert.deepEqual(categories(r), ["solo_setup_invalid"]);
  const text = r.reasons.join("\n") + r.errors.map((p) => p.remedy).join("\n");
  assert.match(text, /GitHub does not let the author of a pull request approve it/);
  assert.match(text, /there is no bypass/);
});

test("a pull request opened by someone other than the Instance automation identity is rejected", async () => {
  const { dir, manifest } = setUp();
  const r = await assessReadiness({ dir, manifest, github: github(botPull({ user_login: "some-other-human" }), [approvingReview()]), now: NOW });
  assert.equal(r.readiness, "not_ready");
  assert.deepEqual(categories(r), ["untrusted_attestation"]);
  assert.match(r.reasons.join("\n"), /expects the automation identity loop-aftergrid-bot/);
});

test("an attestation naming a repository the Instance does not trust is rejected without any API call", async () => {
  const { dir, manifest } = setUp((m) => { m.attestations[0].source.repository = "attacker/forge"; });
  const client = github(botPull(), [approvingReview()]);
  const r = await assessReadiness({ dir, manifest, github: client, now: NOW });
  assert.equal(r.readiness, "not_ready");
  assert.deepEqual(categories(r), ["untrusted_attestation"]);
  assert.deepEqual(client.calls, [], "a Finding cannot make the runner talk to a repository the Instance does not trust");
});

test("a missing Instance policy file is policy_untrusted, not a permissive default", async () => {
  const { root, dir, manifest } = setUp();
  rmSync(join(root, "analytics", "aftergrid.yaml"));
  const r = await assessReadiness({ dir, manifest, github: github(botPull(), [approvingReview()]), now: NOW });
  assert.equal(r.readiness, "not_ready");
  assert.deepEqual(categories(r), [], "an Instance that cannot verify publication is not a defect in the Finding");
  assert.deepEqual(warnings(r), ["policy_untrusted"]);
  assert.match(r.reasons.join("\n"), /no trusted publication policy/);
});

test("a policy that is unparsable, has no trusted approvers, or lists the bot as an approver is untrusted", () => {
  const { root, dir } = setUp();
  const policyPath = join(root, "analytics", "aftergrid.yaml");
  const config: any = parseYaml(readFileSync(policyPath, "utf8"));

  writeFileSync(policyPath, "publication: [this is not: a mapping\n");
  assert.equal(readPublicationPolicy(dir).policy, null);
  assert.deepEqual(readPublicationPolicy(dir).problems.map((p) => p.category), ["policy_untrusted"]);

  writeFileSync(policyPath, toYaml({ ...config, publication: { ...config.publication, trusted_approvers: [] } }));
  assert.match(readPublicationPolicy(dir).problems[0]!.message, /trusted_approvers is empty or missing/);

  writeFileSync(policyPath, toYaml({ ...config, publication: { ...config.publication, trusted_approvers: [HUMAN, BOT] } }));
  const bot = readPublicationPolicy(dir);
  assert.equal(bot.policy, null);
  assert.match(bot.problems[0]!.message, /one account cannot both open a Finding pull request and approve it/);
  assert.match(bot.problems[0]!.remedy!, /no bypass/);

  writeFileSync(policyPath, toYaml(config));
  const good = readPublicationPolicy(dir).policy!;
  assert.deepEqual([good.repository, good.trustedApprovers, good.automationLogin], [REPO, [HUMAN], BOT]);
});

test("a policy that lists the bot as an approver keeps readiness at not_ready even with a perfect review", async () => {
  const { root, dir, manifest } = setUp();
  const policyPath = join(root, "analytics", "aftergrid.yaml");
  const config: any = parseYaml(readFileSync(policyPath, "utf8"));
  config.publication.trusted_approvers = [HUMAN, BOT];
  writeFileSync(policyPath, toYaml(config));
  const r = await assessReadiness({ dir, manifest, github: github(botPull(), [approvingReview()]), now: NOW });
  assert.equal(r.readiness, "not_ready");
  assert.deepEqual(warnings(r), ["policy_untrusted"]);
  assert.deepEqual(r.verified, []);
});

test("an API failure is unknown, never approved, and names the error class", async () => {
  const { dir, manifest } = setUp();
  const client = github(botPull(), [approvingReview()], () => { throw new GitHubError("network", "socket hang up"); });
  const r = await assessReadiness({ dir, manifest, github: client, now: NOW });
  assert.equal(r.readiness, "unknown");
  assert.deepEqual(r.verified, []);
  assert.deepEqual(r.errors, []);
  assert.match(r.reasons.join("\n"), /\(network: socket hang up\); readiness is unknown, never approved/);
});

test("no GitHub client at all is unknown, and a review in the future is rejected", async () => {
  const { dir, manifest } = setUp();
  const none = await assessReadiness({ dir, manifest, github: null, now: NOW });
  assert.equal(none.readiness, "unknown");
  assert.match(none.reasons.join("\n"), /no API client or token configured/);

  const future = await assessReadiness({ dir, manifest, github: github(botPull(), [approvingReview({ submitted_at: "2027-01-01T00:00:00Z" })]), now: NOW });
  assert.equal(future.readiness, "not_ready");
  assert.deepEqual(categories(future), ["untrusted_attestation"]);
});

test("a Finding with no publication_approval attestation, and a draft, are both not ready", async () => {
  const empty = setUp((m) => { m.attestations = []; });
  const r1 = await assessReadiness({ dir: empty.dir, manifest: empty.manifest, github: github(botPull(), [approvingReview()]), now: NOW });
  assert.equal(r1.readiness, "not_ready");
  assert.match(r1.reasons.join("\n"), /no publication_approval attestation/);

  const draft = setUp((m) => { m.finding.state = "draft"; });
  const r2 = await assessReadiness({ dir: draft.dir, manifest: draft.manifest, github: github(botPull(), [approvingReview()]), now: NOW });
  assert.equal(r2.readiness, "not_ready");
  assert.equal(r2.reasons[0], "not complete");
});

test("a cosmetic change keeps the Finding approval and the definition approval; a Claim or export-policy change invalidates the Finding approval only", async () => {
  const { dir, manifest } = setUp();
  const before = digestOf(manifest, dir).value;
  const definition = manifest.definitions[0];
  const definitionFile = join(dir, "..", "..", definition.path);
  const definitionNow = definitionHash(readFileSync(definitionFile, "utf8")).value;
  assert.equal(definitionNow, definition.approval.content_hash.value, "the definition approval binds the definition's own content");

  // Cosmetic: excluded from the digest envelope by contract.
  const cosmetic = JSON.parse(JSON.stringify(manifest));
  cosmetic.finding.generated_at = "2026-07-20T18:30:00Z";
  cosmetic.executions[0].executed_at = "2026-07-20T18:31:00Z";
  assert.equal(digestOf(cosmetic, dir).value, before, "a regenerated timestamp is not a content change");
  const stillReady = await assessReadiness({ dir, manifest: cosmetic, github: github(botPull(), [approvingReview()]), now: NOW });
  assert.equal(stillReady.readiness, "ready", JSON.stringify(stillReady.reasons));
  assert.equal(definitionHash(readFileSync(definitionFile, "utf8")).value, definition.approval.content_hash.value, "an unchanged definition approval survives a cosmetic Finding revision");

  // Semantic: each of these is a different Finding and must invalidate the Finding's approval.
  for (const change of [
    (m: any) => { m.claims[0].type = "associational"; },
    (m: any) => { m.claims[0].material_caveat = "Rewritten caveat."; },
    (m: any) => { m.claims[0].exclusions.push("Accounts flagged as internal."); },
    (m: any) => { m.export_policy.allowed_fields.pop(); },
  ]) {
    const changed = JSON.parse(JSON.stringify(manifest));
    change(changed);
    assert.notEqual(digestOf(changed, dir).value, before);
    const r = await assessReadiness({ dir, manifest: changed, github: github(botPull(), [approvingReview()]), now: NOW });
    assert.equal(r.readiness, "not_ready");
    assert.deepEqual(categories(r), ["stale_attestation"]);
    assert.equal(definitionHash(readFileSync(definitionFile, "utf8")).value, changed.definitions[0].approval.content_hash.value, "the definition's own approval is untouched");
  }
});

test("cached render outputs are re-rendered and compared byte for byte; a tampered file is discarded", async () => {
  const { dir } = setUp();
  const { resetSVGDefIds } = await import("vega");
  resetSVGDefIds();
  const first = await render({ dir });
  assert.deepEqual(first.errors, []);

  const clean = await verifyGeneratedOutputs(dir);
  assert.equal(clean.status, "verified", JSON.stringify(clean.problems));
  assert.deepEqual(clean.problems, []);
  assert.deepEqual(clean.compared, ["render/finding.html", "render/retention_by_arm_chart.svg"]);
  assert.ok(clean.regenerated.get("render/finding.html")!.includes("Generated 2026-07-20T14:05:00Z"));

  const htmlPath = join(dir, "render", "finding.html");
  const original = readFileSync(htmlPath);
  writeFileSync(htmlPath, readFileSync(htmlPath, "utf8").replace("Publication approval has not been verified", "Approved for publication"));
  const tampered = await verifyGeneratedOutputs(dir);
  assert.equal(tampered.status, "tampered");
  assert.deepEqual(tampered.problems.map((p) => p.category), ["tampered_output"]);
  assert.equal(tampered.problems[0]!.location, "render/finding.html");
  assert.match(tampered.problems[0]!.remedy!, /regenerate/);
  assert.ok(tampered.regenerated.get("render/finding.html")!.equals(original), "publication uses the regenerated bytes, not the file on disk");

  writeFileSync(htmlPath, original);
  writeFileSync(join(dir, "render", "planted.svg"), "<svg xmlns='http://www.w3.org/2000/svg'></svg>");
  const planted = await verifyGeneratedOutputs(dir);
  assert.equal(planted.status, "tampered");
  assert.equal(planted.problems[0]!.location, "render/planted.svg");
  assert.match(planted.problems[0]!.message, /the renderer does not produce it/);

  rmSync(join(dir, "render", "planted.svg"));
  rmSync(join(dir, "render", "retention_by_arm_chart.svg"));
  const missing = await verifyGeneratedOutputs(dir);
  assert.equal(missing.status, "tampered");
  assert.match(missing.problems[0]!.message, /missing from the cached outputs/);
});

test("the token is read from the environment only, and the real client makes read-only GitHub calls", async () => {
  assert.equal(tokenFromEnv({}), null);
  assert.equal(tokenFromEnv({ GH_TOKEN: "gh-abc" }), "gh-abc");
  assert.equal(tokenFromEnv({ GITHUB_TOKEN: "gha-1", GH_TOKEN: "gh-abc" }), "gha-1", "GITHUB_TOKEN wins");

  const seen: { url: string; init: any }[] = [];
  const body = (json: unknown) => ({ ok: true, status: 200, headers: new Headers(), json: async () => json }) as unknown as Response;
  const client = createGitHubClient({
    token: "gha-1",
    fetchImpl: (async (url: any, init: any) => {
      seen.push({ url: String(url), init });
      return String(url).endsWith("/reviews?per_page=100&page=1")
        ? body([{ id: 7, user: { login: HUMAN }, state: "approved", commit_id: SHA, submitted_at: "2026-07-20T15:00:00Z" }])
        : body({ head: { sha: SHA }, user: { login: BOT }, state: "open", merged: false });
    }) as unknown as typeof fetch,
  });
  assert.deepEqual(await client.getPullRequest(REPO, PR), { head_sha: SHA, user_login: BOT, state: "open", merged: false });
  assert.deepEqual(await client.listReviews(REPO, PR), [{ id: 7, user_login: HUMAN, state: "APPROVED", commit_id: SHA, submitted_at: "2026-07-20T15:00:00Z" }]);
  assert.deepEqual(seen.map((s) => s.url), [`https://api.github.com/repos/${REPO}/pulls/${PR}`, `https://api.github.com/repos/${REPO}/pulls/${PR}/reviews?per_page=100&page=1`]);
  for (const s of seen) {
    assert.equal(s.init.method, "GET");
    assert.equal(s.init.headers.authorization, "Bearer gha-1");
  }

  // A repository or number the Finding could have forged never reaches the network.
  await assert.rejects(() => client.getPullRequest("../../etc/passwd", 1), (e: any) => e instanceof GitHubError && e.errorClass === "invalid_request");
  await assert.rejects(() => client.getPullRequest(REPO, 0), (e: any) => e instanceof GitHubError && e.errorClass === "invalid_request");
  assert.equal(seen.length, 2, "no extra request was made");

  const rateLimited = createGitHubClient({
    token: null,
    fetchImpl: (async () => ({ ok: false, status: 403, headers: new Headers({ "x-ratelimit-remaining": "0" }), json: async () => ({}) })) as unknown as typeof fetch,
  });
  await assert.rejects(() => rateLimited.getPullRequest(REPO, PR), (e: any) => e.errorClass === "rate_limited");
});
