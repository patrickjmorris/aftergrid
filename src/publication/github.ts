// The narrow, read-only GitHub surface publication readiness needs, behind an injectable interface so tests never
// touch the network. Two reads only: the pull request and its reviews. The token comes from the environment
// (GITHUB_TOKEN or GH_TOKEN) and never from a manifest, a Finding field or any agent-editable file: a proposed
// Finding must not be able to name the credential that judges it. Contract: docs/contracts/publication.md.

/** The four states the bead names, plus PENDING, which the API returns to a review's own author. */
export type ReviewState = "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED" | "PENDING";

export type PullRequest = { head_sha: string; user_login: string; state: string; merged: boolean };
export type Review = { id: number; user_login: string; state: ReviewState; commit_id: string; submitted_at: string };

export interface GitHubClient {
  getPullRequest(repo: string, number: number): Promise<PullRequest>;
  listReviews(repo: string, number: number): Promise<Review[]>;
}

/**
 * Anything that stopped a read from answering the question. `errorClass` is the stable word readiness puts in its
 * reason; the point of the class is that an unread answer is reported as unknown, never as approved.
 */
export class GitHubError extends Error {
  readonly errorClass: string;
  readonly status?: number;
  constructor(errorClass: string, message: string, status?: number) {
    super(message);
    this.name = "GitHubError";
    this.errorClass = errorClass;
    this.status = status;
  }
}

export const errorClassOf = (e: unknown): string => (e instanceof GitHubError ? e.errorClass : e instanceof Error ? e.constructor.name : "unknown");

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const STATES = new Set<string>(["APPROVED", "CHANGES_REQUESTED", "COMMENTED", "DISMISSED", "PENDING"]);
const PER_PAGE = 100, MAX_PAGES = 10;

/** GITHUB_TOKEN, then GH_TOKEN. Never a manifest field. Returns null when neither is set. */
export function tokenFromEnv(env: Record<string, string | undefined> = process.env): string | null {
  for (const name of ["GITHUB_TOKEN", "GH_TOKEN"]) {
    const value = env[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export type GitHubClientOptions = {
  token?: string | null;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  userAgent?: string;
};

/**
 * The real client: GET only, against api.github.com by default. Every response is shape-checked before it is
 * believed; a field of the wrong type is a malformed_response, not a default value. The single exception is a
 * PENDING review, which the API returns unsubmitted (no commit_id, no submitted_at) to its own author and which is
 * neither an approval nor an objection.
 */
export function createGitHubClient(options: GitHubClientOptions = {}): GitHubClient {
  const token = options.token === undefined ? tokenFromEnv() : options.token;
  const baseUrl = (options.baseUrl ?? "https://api.github.com").replace(/\/+$/, "");
  const doFetch = options.fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== "function") throw new GitHubError("unsupported_runtime", "no fetch implementation is available in this runtime");

  const get = async (path: string): Promise<unknown> => {
    const headers: Record<string, string> = {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": options.userAgent ?? "aftergrid-publication-check",
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
    catch (e) { throw new GitHubError("malformed_response", `GitHub returned a body that is not JSON for ${path}: ${(e as Error).message}`); }
  };

  const target = (repo: string, number: number) => {
    // Never interpolate an unchecked value into a URL: repo and number come from a manifest the agent can edit.
    if (!REPO_RE.test(repo)) throw new GitHubError("invalid_request", `'${repo}' is not an owner/repo string`);
    if (!Number.isSafeInteger(number) || number < 1) throw new GitHubError("invalid_request", `'${number}' is not a pull request number`);
    return `/repos/${repo}/pulls/${number}`;
  };

  return {
    async getPullRequest(repo, number) {
      const body = await get(target(repo, number)) as any;
      const head = body?.head?.sha, login = body?.user?.login, state = body?.state;
      if (typeof head !== "string" || typeof login !== "string" || typeof state !== "string") {
        throw new GitHubError("malformed_response", `pull request ${repo}#${number} is missing head.sha, user.login or state`);
      }
      return { head_sha: head, user_login: login, state, merged: body?.merged === true };
    },
    async listReviews(repo, number) {
      const base = target(repo, number);
      const out: Review[] = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const body = await get(`${base}/reviews?per_page=${PER_PAGE}&page=${page}`);
        if (!Array.isArray(body)) throw new GitHubError("malformed_response", `reviews for ${repo}#${number} are not a list`);
        for (const r of body as any[]) {
          if (!Number.isSafeInteger(r?.id) || typeof r?.user?.login !== "string" || typeof r?.state !== "string") {
            throw new GitHubError("malformed_response", `a review on ${repo}#${number} is missing id, user.login or state`);
          }
          const state = String(r.state).toUpperCase();
          if (!STATES.has(state)) throw new GitHubError("malformed_response", `review ${r.id} has an unrecognised state '${r.state}'`);
          // A submitted review always carries commit_id and submitted_at. Defaulting them to "" would make a review
          // unorderable against the approval it is meant to supersede, so a missing or non-string field is a
          // malformed_response (read as unknown) and never a value. PENDING is the one state the API legitimately
          // returns unsubmitted, to its own author; it can never be an approval or an objection.
          const pending = state === "PENDING";
          if (!pending && (typeof r.commit_id !== "string" || typeof r.submitted_at !== "string")) {
            throw new GitHubError("malformed_response", `review ${r.id} on ${repo}#${number} is ${state} but is missing a string commit_id or submitted_at`);
          }
          out.push({
            id: r.id,
            user_login: r.user.login,
            state: state as ReviewState,
            commit_id: typeof r.commit_id === "string" ? r.commit_id : "",
            submitted_at: typeof r.submitted_at === "string" ? r.submitted_at : "",
          });
        }
        if (body.length < PER_PAGE) return out;
      }
      // A truncated list could hide the dismissal that matters, so it is an error, never a shorter answer.
      throw new GitHubError("response_truncated", `more than ${PER_PAGE * MAX_PAGES} reviews on ${repo}#${number}; the list cannot be read completely`);
    },
  };
}

export type FakePullRequestState = { repository: string; pull_request: number; pull: PullRequest; reviews: Review[]; throws?: () => never };

/**
 * The test double. It answers only for the pull requests it was given and raises a not_found GitHubError for
 * anything else, so a test cannot accidentally pass by asking for something that does not exist.
 */
export function createFakeGitHub(states: FakePullRequestState | FakePullRequestState[]): GitHubClient & { calls: string[] } {
  const all = Array.isArray(states) ? states : [states];
  const calls: string[] = [];
  const find = (repo: string, number: number, call: string) => {
    calls.push(call);
    const hit = all.find((s) => s.repository.toLowerCase() === repo.toLowerCase() && s.pull_request === number);
    if (!hit) throw new GitHubError("not_found", `fake GitHub has no ${repo}#${number}`, 404);
    if (hit.throws) hit.throws();
    return hit;
  };
  return {
    calls,
    async getPullRequest(repo, number) { return { ...find(repo, number, `pull ${repo}#${number}`).pull }; },
    async listReviews(repo, number) { return find(repo, number, `reviews ${repo}#${number}`).reviews.map((r) => ({ ...r })); },
  };
}
