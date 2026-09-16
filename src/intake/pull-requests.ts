// One pull request per run, keyed by the run id. Everything here exists to make that "one" true across an
// interruption: the target is asked `findByRun` before a create is attempted and again before a create is
// retried, so a crash after the pull request landed — or a 429 on a call that had already succeeded — updates
// the existing pull request instead of opening a second one.
//
// The runner opens a DRAFT pull request and never approves it. Publication still requires a human APPROVED
// review from a trusted login, verified at the reviewed commit (docs/contracts/publication.md).
import { assertNumber, assertRepo, createApi, type Api, type ApiOptions } from "./api.ts";

export type PullRequestRef = {
  number: number;
  url?: string;
  title: string;
  body: string;
  head: string;
  base: string;
  draft: boolean;
};

export type PullRequestInput = { title: string; body: string; head: string; base: string; draft?: boolean };

export interface PullRequestTarget {
  /** The pull request this run already owns, or null. Never a guess: matched on the run's own head branch or title key. */
  findByRun(repo: string, runId: string): Promise<PullRequestRef | null>;
  create(repo: string, input: PullRequestInput): Promise<PullRequestRef>;
  update(repo: string, number: number, patch: { title?: string; body?: string }): Promise<PullRequestRef>;
}

/** The branch a run's pull request is opened from. The run id is the key, in the branch and in the title. */
export const branchFor = (runId: string): string => `aftergrid/${runId}`;
export const titleKey = (runId: string): string => `(run ${runId})`;

const asRef = (body: any): PullRequestRef => ({
  number: Number(body?.number),
  url: typeof body?.html_url === "string" ? body.html_url : undefined,
  title: String(body?.title ?? ""),
  body: typeof body?.body === "string" ? body.body : "",
  head: String(body?.head?.ref ?? ""),
  base: String(body?.base?.ref ?? ""),
  draft: body?.draft === true,
});

export type FetchPullRequestTargetOptions = ApiOptions & { api?: Api };

export function createFetchPullRequestTarget(options: FetchPullRequestTargetOptions = {}): PullRequestTarget {
  const api = options.api ?? createApi(options);
  return {
    async findByRun(repo, runId) {
      const owner = assertRepo(repo).split("/")[0]!;
      const body = await api("GET", `/repos/${repo}/pulls?state=all&per_page=100&head=${encodeURIComponent(`${owner}:${branchFor(runId)}`)}`);
      if (!Array.isArray(body) || !body.length) return null;
      const key = titleKey(runId);
      const hit = body.find((p: any) => String(p?.head?.ref ?? "") === branchFor(runId)) ?? body.find((p: any) => String(p?.title ?? "").includes(key));
      return hit ? asRef(hit) : null;
    },
    async create(repo, input) {
      return asRef(await api("POST", `/repos/${assertRepo(repo)}/pulls`, {
        title: input.title, body: input.body, head: input.head, base: input.base, draft: input.draft ?? true,
      }));
    },
    async update(repo, number, patch) {
      return asRef(await api("PATCH", `/repos/${assertRepo(repo)}/pulls/${assertNumber(number, "pull request number")}`, patch));
    },
  };
}

export type FakePullRequestTargetOptions = {
  repository: string;
  /** Raise on the n-th call, e.g. a 429 on the first two creates. */
  failures?: Partial<Record<keyof PullRequestTarget, (call: number) => void>>;
  /** Run after a create has been recorded, before it is returned: the seam for "the runner died right here". */
  afterCreate?: (ref: PullRequestRef) => void;
};

export type FakePullRequestTarget = PullRequestTarget & {
  readonly pulls: PullRequestRef[];
  readonly created: PullRequestRef[];
  readonly updates: { number: number; title?: string; body?: string }[];
  readonly calls: string[];
};

/**
 * The test double. `created` records every pull request that really came into existence, so a test can assert
 * "exactly one" rather than "the last call did not throw".
 */
export function createFakePullRequestTarget(options: FakePullRequestTargetOptions): FakePullRequestTarget {
  const pulls: PullRequestRef[] = [];
  const created: PullRequestRef[] = [];
  const updates: { number: number; title?: string; body?: string }[] = [];
  const calls: string[] = [];
  const counts: Record<string, number> = {};
  const gate = (method: keyof PullRequestTarget) => {
    counts[method] = (counts[method] ?? 0) + 1;
    options.failures?.[method]?.(counts[method]!);
  };
  const check = (repo: string) => {
    if (repo.toLowerCase() !== options.repository.toLowerCase()) throw new Error(`fake pull request target holds ${options.repository}, not ${repo}`);
  };
  let next = 100;
  return {
    pulls, created, updates, calls,
    async findByRun(repo, runId) {
      calls.push(`findByRun ${repo} ${runId}`);
      check(repo);
      gate("findByRun");
      const hit = pulls.find((p) => p.head === branchFor(runId) || p.title.includes(titleKey(runId)));
      return hit ? { ...hit } : null;
    },
    async create(repo, input) {
      calls.push(`create ${repo} ${input.head}`);
      check(repo);
      gate("create");
      const ref: PullRequestRef = {
        number: ++next, url: `https://github.com/${repo}/pull/${next}`,
        title: input.title, body: input.body, head: input.head, base: input.base, draft: input.draft ?? true,
      };
      pulls.push(ref);
      created.push({ ...ref });
      options.afterCreate?.({ ...ref });
      return { ...ref };
    },
    async update(repo, number, patch) {
      calls.push(`update ${repo}#${number}`);
      check(repo);
      gate("update");
      const hit = pulls.find((p) => p.number === number);
      if (!hit) throw new Error(`fake pull request target has no #${number}`);
      if (patch.title !== undefined) hit.title = patch.title;
      if (patch.body !== undefined) hit.body = patch.body;
      updates.push({ number, ...patch });
      return { ...hit };
    },
  };
}
