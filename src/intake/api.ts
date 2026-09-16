// The HTTP seam shared by the Issue source and the pull request target. Publication's client
// (src/publication/github.ts) is deliberately read-only — it judges an approval, so it must not be able to
// create one. Intake is the one place aftergrid *writes* to the GitHub API: labels, comments and its own pull
// request. It still never writes to a data source, and it never submits a review.
//
// The token is read from GITHUB_TOKEN / GH_TOKEN in the environment, never from a file in the repository and
// never from Issue text. It is never logged: only the error class and the status reach a message.
import { GitHubError, tokenFromEnv } from "../publication/github.ts";

export type ApiOptions = {
  token?: string | null;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  userAgent?: string;
};

export type Api = (method: "GET" | "POST" | "PATCH" | "PUT", path: string, body?: unknown) => Promise<unknown>;

export const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** Never interpolate an unchecked value into a URL: the repository can come from a config file or a flag. */
export function assertRepo(repo: string): string {
  if (!REPO_RE.test(repo)) throw new GitHubError("invalid_request", `'${repo}' is not an owner/repo string`);
  return repo;
}

export function assertNumber(n: number, what: string): number {
  if (!Number.isSafeInteger(n) || n < 1) throw new GitHubError("invalid_request", `'${n}' is not a ${what}`);
  return n;
}

export function createApi(options: ApiOptions = {}): Api {
  const token = options.token === undefined ? tokenFromEnv() : options.token;
  const baseUrl = (options.baseUrl ?? "https://api.github.com").replace(/\/+$/, "");
  const doFetch = options.fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== "function") throw new GitHubError("unsupported_runtime", "no fetch implementation is available in this runtime");

  return async function api(method, path, body) {
    const headers: Record<string, string> = {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": options.userAgent ?? "aftergrid-intake",
    };
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`, { method, headers, redirect: "error", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch (e) {
      throw new GitHubError("network", `GitHub request failed: ${(e as Error).message}`);
    }
    if (!response.ok) throw new GitHubError(classify(response), `GitHub returned ${response.status} for ${method} ${path}`, response.status);
    if (response.status === 204) return null;
    try { return await response.json(); }
    catch (e) { throw new GitHubError("malformed_response", `GitHub returned a body that is not JSON for ${method} ${path}: ${(e as Error).message}`); }
  };
}

function classify(response: Response): string {
  const remaining = response.headers?.get?.("x-ratelimit-remaining");
  const status = response.status;
  if (status === 401) return "unauthorized";
  if (status === 403 && remaining === "0") return "rate_limited";
  if (status === 429) return "rate_limited";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 422) return "unprocessable";
  return status >= 500 ? "server_error" : "http_error";
}
