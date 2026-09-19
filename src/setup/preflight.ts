// Publication preflight: can this Instance's publication policy ever produce a verified approval?
//
// It answers exactly two questions and refuses to answer a third. (1) Is the policy self-consistent — does it
// name a repository, a distinct automation identity and at least one trusted human? (2) If a token is available,
// do those names resolve to a real repository and to distinct real accounts? The third question — has anything
// been approved — is about a Finding and is answered by `src/publication/readiness.ts`, never here.
//
// `src/publication/github.ts` reads pull requests and reviews; it has no user or repository read, and this bead
// does not change it. The two reads preflight needs live behind their own narrow interface so a test can supply
// a fake and no test ever reaches api.github.com.
import { GitHubError, tokenFromEnv } from "../publication/github.ts";
import type { Problem } from "../report.ts";

export type PreflightAccount = { login: string; id: number; type: string };
export type PreflightRepository = { full_name: string; id: number; private: boolean };

export interface PreflightClient {
  getUser(login: string): Promise<PreflightAccount>;
  getRepository(repo: string): Promise<PreflightRepository>;
}

export type PreflightStatus = "ok" | "invalid" | "unknown";
export type PreflightResult = {
  status: PreflightStatus;
  /** Why, in the order it was decided. Always populated, including for `ok`. */
  reasons: string[];
  errors: Problem[];
  warnings: Problem[];
  info: string[];
};

export type PreflightInput = {
  repository?: string;
  trustedApprovers?: string[];
  automationLogin?: string;
  /** Where the policy was read from, for problem locations. */
  policyPath: string;
  client?: PreflightClient | null;
};

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const LOGIN_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}(?:\[bot\])?$/;
export const RUNBOOK = "docs/contracts/publication.md (the solo pilot runbook)";
/** The rule, and the reason there is no flag to get around it. */
export const AUTHOR_CANNOT_APPROVE =
  "GitHub does not let the author of a pull request approve it, so one account cannot both open the Finding pull request and approve it. This is impossible, not discouraged: there is no bypass flag, no environment variable and no override.";
const SEPARATE_BOT = "use a separate automation account (or a GitHub App installation) for --automation-login and keep the human reviewers on --trusted-approver";

/** GET-only client for the two reads preflight needs. Errors carry the class readiness-style reporting uses. */
export function createPreflightClient(options: { token?: string | null; baseUrl?: string; fetchImpl?: typeof fetch; userAgent?: string } = {}): PreflightClient {
  const token = options.token === undefined ? tokenFromEnv() : options.token;
  const baseUrl = (options.baseUrl ?? "https://api.github.com").replace(/\/+$/, "");
  const doFetch = options.fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== "function") throw new GitHubError("unsupported_runtime", "no fetch implementation is available in this runtime");

  const get = async (path: string): Promise<any> => {
    const headers: Record<string, string> = {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": options.userAgent ?? "aftergrid-setup-preflight",
    };
    if (token) headers.authorization = `Bearer ${token}`;
    let response: Response;
    try { response = await doFetch(`${baseUrl}${path}`, { method: "GET", headers, redirect: "error" }); }
    catch (e) { throw new GitHubError("network", `GitHub request failed: ${(e as Error).message}`); }
    if (!response.ok) {
      const remaining = response.headers?.get?.("x-ratelimit-remaining");
      const cls = response.status === 401 ? "unauthorized"
        : response.status === 403 && remaining === "0" ? "rate_limited"
        : response.status === 429 ? "rate_limited"
        : response.status === 403 ? "forbidden"
        : response.status === 404 ? "not_found"
        : response.status >= 500 ? "server_error" : "http_error";
      throw new GitHubError(cls, `GitHub returned ${response.status} for ${path}`, response.status);
    }
    try { return await response.json(); }
    catch (e) { throw new GitHubError("malformed_response", `GitHub returned a body that is not JSON: ${(e as Error).message}`); }
  };

  const num = (v: unknown, what: string): number => {
    if (typeof v !== "number" || !Number.isFinite(v)) throw new GitHubError("malformed_response", `${what} is not a number`);
    return v;
  };
  const str = (v: unknown, what: string): string => {
    if (typeof v !== "string" || !v) throw new GitHubError("malformed_response", `${what} is not a string`);
    return v;
  };

  return {
    async getUser(login) {
      if (!LOGIN_RE.test(login)) throw new GitHubError("bad_request", `'${login}' is not a GitHub login`);
      const b = await get(`/users/${encodeURIComponent(login)}`);
      return { login: str(b?.login, "user.login"), id: num(b?.id, "user.id"), type: typeof b?.type === "string" ? b.type : "unknown" };
    },
    async getRepository(repo) {
      if (!REPO_RE.test(repo)) throw new GitHubError("bad_request", `'${repo}' is not an owner/repo string`);
      const [owner, name] = repo.split("/");
      const b = await get(`/repos/${encodeURIComponent(owner!)}/${encodeURIComponent(name!)}`);
      return { full_name: str(b?.full_name, "repository.full_name"), id: num(b?.id, "repository.id"), private: b?.private === true };
    },
  };
}

/**
 * Local rules first, so a self-defeating policy is refused without a network call. Then, only if a client was
 * supplied, the two reads. An unreadable API is `unknown`, never a rejection and never an approval.
 */
export async function publicationPreflight(input: PreflightInput): Promise<PreflightResult> {
  const r: PreflightResult = { status: "unknown", reasons: [], errors: [], warnings: [], info: [] };
  const at = (suffix: string) => `${input.policyPath}#/publication/${suffix}`;
  const repository = input.repository?.trim() ?? "";
  const automation = input.automationLogin?.trim() ?? "";
  const trusted = (input.trustedApprovers ?? []).map((t) => t.trim()).filter(Boolean);

  if (!repository && !automation && !trusted.length) {
    r.reasons.push("publication is not configured: no repository, no automation identity and no trusted approvers, so no Finding in this Instance can reach readiness `ready`");
    r.warnings.push({
      category: "incomplete", location: `${input.policyPath}#/publication`,
      message: "the publication policy is empty; drafts still render and are labeled as drafts, but nothing here can ever be verified as approved",
      remedy: `rerun setup with --repository owner/repo --automation-login <bot> --trusted-approver <human>, then read ${RUNBOOK}`,
    });
    return r;
  }

  let invalid = false;
  const reject = (location: string, message: string, remedy: string, category: Problem["category"] = "policy_untrusted") => {
    r.errors.push({ category, location, message, remedy });
    r.reasons.push(message);
    invalid = true;
  };

  if (!REPO_RE.test(repository)) reject(at("repository"), `publication.repository ${JSON.stringify(input.repository ?? null)} is not an owner/repo string`, "name the repository where Finding pull requests are opened, as owner/repo");
  if (!LOGIN_RE.test(automation)) reject(at("automation_login"), `publication.automation_login ${JSON.stringify(input.automationLogin ?? null)} is not a GitHub login`, `name the distinct identity that opens Finding pull requests; ${SEPARATE_BOT}`);
  if (!trusted.length) reject(at("trusted_approvers"), "publication.trusted_approvers is empty, so no login can approve a Finding", "list the humans whose APPROVED review counts");
  for (const t of trusted) if (!LOGIN_RE.test(t)) reject(at("trusted_approvers"), `${JSON.stringify(t)} is not a GitHub login`, "list plain GitHub logins; nothing else is matched against the API");

  const lowerTrusted = trusted.map((t) => t.toLowerCase());
  if (automation && lowerTrusted.includes(automation.toLowerCase())) {
    reject(at("automation_login"), `${automation} is both the automation identity and a trusted approver. ${AUTHOR_CANNOT_APPROVE}`, SEPARATE_BOT, "solo_setup_invalid");
  }
  const dupes = lowerTrusted.filter((t, i) => lowerTrusted.indexOf(t) !== i);
  if (dupes.length) r.warnings.push({ category: "duplicate_id", location: at("trusted_approvers"), message: `${[...new Set(dupes)].join(", ")} is listed more than once; the duplicate adds no second reviewer`, remedy: "list each trusted login once" });

  if (invalid) { r.status = "invalid"; return r; }
  r.reasons.push(`policy is self-consistent: ${automation} opens Finding pull requests in ${repository}; ${trusted.join(", ")} may approve them; the automation identity is not among them`);

  if (!input.client) {
    r.status = "unknown";
    r.reasons.push(`no GitHub client or token (GITHUB_TOKEN / GH_TOKEN), so the repository and these logins were not verified against the API: whether they exist, and whether they are distinct accounts, is unknown. Runbook: ${RUNBOOK}`);
    r.info.push(`publication preflight: unknown. Nothing was checked against GitHub. Export a read-only token and rerun setup to verify the repository and the identities; ${RUNBOOK} explains the whole round trip.`);
    return r;
  }

  const seen = new Map<number, string>();
  try {
    const repo = await input.client.getRepository(repository);
    r.info.push(`repository ${repo.full_name} exists (${repo.private ? "private" : "public"})`);
    if (repo.full_name.toLowerCase() !== repository.toLowerCase()) {
      r.warnings.push({ category: "unresolved_reference", location: at("repository"), message: `GitHub resolved ${repository} to ${repo.full_name}; a redirected or renamed repository is not the name an attestation will be matched against`, remedy: `write ${repo.full_name} in aftergrid.yaml` });
    }
    const bot = await input.client.getUser(automation);
    seen.set(bot.id, `${bot.login} (automation)`);
    r.info.push(`automation identity ${bot.login} resolves to account ${bot.id} (${bot.type})`);
    for (const t of trusted) {
      const user = await input.client.getUser(t);
      const already = seen.get(user.id);
      if (already) {
        reject(at("trusted_approvers"), `${t} and ${already} resolve to the same GitHub account (id ${user.id}). ${AUTHOR_CANNOT_APPROVE}`, SEPARATE_BOT, "solo_setup_invalid");
      } else {
        seen.set(user.id, `${user.login} (trusted approver)`);
        r.info.push(`trusted approver ${user.login} resolves to account ${user.id} (${user.type})`);
      }
    }
  } catch (e) {
    const cls = e instanceof GitHubError ? e.errorClass : e instanceof Error ? e.constructor.name : "unknown";
    r.status = "unknown";
    r.reasons.push(`the GitHub API could not be read (${cls}: ${(e as Error).message}), so the repository and the identities are unverified. This is unknown, not a rejection and not a pass. Runbook: ${RUNBOOK}`);
    r.warnings.push({ category: "unresolved_reference", location: at("repository"), message: `preflight could not read GitHub (${cls})`, remedy: `check the token's read access to ${repository}, then rerun setup; ${RUNBOOK}` });
    return r;
  }

  if (invalid) { r.status = "invalid"; return r; }
  r.status = "ok";
  r.reasons.push(`the repository exists and every configured login resolves to a distinct GitHub account. This says the policy can work; it says nothing about any Finding being approved — that is checked per Finding by \`aftergrid check\`.`);
  return r;
}
