// GitHub Issues as the request surface (spec story 8, docs/agents/issue-tracker.md). An Operator files an
// Issue and labels it `ready-for-agent`; the runner picks it up, and reports back on the same Issue.
//
// Label discipline is narrow on purpose. The runner adds exactly two labels, and only when the fact behind
// each is true: `needs-info` when a run paused for input it does not have, `ready-for-human` when a draft pull
// request exists. It never removes a label — not even the trigger — and never adds any other one. Removing the
// trigger would be the runner editing its own queue; the claim file is what stops a second run instead.
import { assertNumber, assertRepo, createApi, type Api, type ApiOptions } from "./api.ts";

export type IssueComment = { id: number; author: string; created_at: string; body: string };

export type Issue = {
  number: number;
  title: string;
  body: string;
  updated_at: string;
  labels: string[];
  comments?: IssueComment[];
};

export interface IssueSource {
  listLabelled(repo: string, label: string): Promise<Issue[]>;
  getIssue(repo: string, number: number): Promise<Issue>;
  /** The complete label set the Issue should carry afterwards. Callers pass a superset of what is there. */
  setLabels(repo: string, number: number, labels: string[]): Promise<void>;
  comment(repo: string, number: number, body: string): Promise<void>;
}

export const TRIGGER_LABEL = "ready-for-agent";
export const NEEDS_INFO_LABEL = "needs-info";
export const READY_FOR_HUMAN_LABEL = "ready-for-human";

/** Add `label` while keeping every other label exactly as it is. A no-op when it is already there. */
export async function addLabel(source: IssueSource, repo: string, issue: Issue, label: string): Promise<boolean> {
  if (issue.labels.includes(label)) return false;
  const next = [...issue.labels, label];
  await source.setLabels(repo, issue.number, next);
  issue.labels = next;
  return true;
}

const asIssue = (body: any): Issue => ({
  number: Number(body?.number),
  title: String(body?.title ?? ""),
  body: typeof body?.body === "string" ? body.body : "",
  updated_at: String(body?.updated_at ?? ""),
  labels: Array.isArray(body?.labels) ? body.labels.map((l: any) => (typeof l === "string" ? l : String(l?.name ?? ""))).filter(Boolean) : [],
});

export type FetchIssueSourceOptions = ApiOptions & { api?: Api; withComments?: boolean };

/** The real source: GET the labelled Issues, PUT labels, POST comments. No other write exists. */
export function createFetchIssueSource(options: FetchIssueSourceOptions = {}): IssueSource {
  const api = options.api ?? createApi(options);
  const path = (repo: string, n: number) => `/repos/${assertRepo(repo)}/issues/${assertNumber(n, "issue number")}`;
  const comments = async (repo: string, n: number): Promise<IssueComment[]> => {
    const body = await api("GET", `${path(repo, n)}/comments?per_page=100`);
    if (!Array.isArray(body)) return [];
    return body.map((c: any) => ({
      id: Number(c?.id), author: String(c?.user?.login ?? ""), created_at: String(c?.created_at ?? ""),
      body: typeof c?.body === "string" ? c.body : "",
    }));
  };
  return {
    async listLabelled(repo, label) {
      const body = await api("GET", `/repos/${assertRepo(repo)}/issues?state=open&per_page=100&labels=${encodeURIComponent(label)}`);
      if (!Array.isArray(body)) return [];
      // The Issues endpoint returns pull requests too; a pull request is not a request for an Analysis.
      return body.filter((i: any) => !i?.pull_request && Number.isSafeInteger(Number(i?.number))).map(asIssue);
    },
    async getIssue(repo, number) {
      const issue = asIssue(await api("GET", path(repo, number)));
      issue.comments = await comments(repo, number);
      return issue;
    },
    async setLabels(repo, number, labels) {
      await api("PUT", `${path(repo, number)}/labels`, { labels });
    },
    async comment(repo, number, body) {
      await api("POST", `${path(repo, number)}/comments`, { body });
    },
  };
}

export type FakeIssueSourceOptions = {
  repository: string;
  issues: Issue[];
  /** The login the runner posts as, so a human comment can be told from the runner's own. */
  selfLogin?: string;
  /** Raise on the n-th call of a method, e.g. to rehearse a rate limit. */
  failures?: Partial<Record<keyof IssueSource, (call: number) => void>>;
};

export type FakeIssueSource = IssueSource & {
  readonly issues: Issue[];
  readonly comments: { issue: number; body: string }[];
  readonly labelWrites: { issue: number; labels: string[] }[];
  readonly calls: string[];
  addHumanComment(issue: number, author: string, body: string, created_at: string): IssueComment;
};

/** The test double. It answers only for the repository and Issues it was given. */
export function createFakeIssueSource(options: FakeIssueSourceOptions): FakeIssueSource {
  const self = options.selfLogin ?? "aftergrid-bot";
  const issues = options.issues.map((i) => ({ ...i, labels: [...i.labels], comments: [...(i.comments ?? [])] }));
  const comments: { issue: number; body: string }[] = [];
  const labelWrites: { issue: number; labels: string[] }[] = [];
  const calls: string[] = [];
  const counts: Record<string, number> = {};
  const gate = (method: keyof IssueSource) => {
    counts[method] = (counts[method] ?? 0) + 1;
    options.failures?.[method]?.(counts[method]!);
  };
  const find = (repo: string, number: number): Issue => {
    if (repo.toLowerCase() !== options.repository.toLowerCase()) throw new Error(`fake Issue source holds ${options.repository}, not ${repo}`);
    const hit = issues.find((i) => i.number === number);
    if (!hit) throw new Error(`fake Issue source has no issue #${number}`);
    return hit;
  };
  const copy = (i: Issue): Issue => ({ ...i, labels: [...i.labels], comments: (i.comments ?? []).map((c) => ({ ...c })) });
  let nextCommentId = 1000;
  return {
    issues,
    comments,
    labelWrites,
    calls,
    addHumanComment(issue, author, body, created_at) {
      const c = { id: ++nextCommentId, author, created_at, body };
      find(options.repository, issue).comments!.push(c);
      return c;
    },
    async listLabelled(repo, label) {
      calls.push(`listLabelled ${repo} ${label}`);
      gate("listLabelled");
      if (repo.toLowerCase() !== options.repository.toLowerCase()) throw new Error(`fake Issue source holds ${options.repository}, not ${repo}`);
      return issues.filter((i) => i.labels.includes(label)).map(copy);
    },
    async getIssue(repo, number) {
      calls.push(`getIssue ${repo}#${number}`);
      gate("getIssue");
      return copy(find(repo, number));
    },
    async setLabels(repo, number, labels) {
      calls.push(`setLabels ${repo}#${number} ${labels.join(",")}`);
      gate("setLabels");
      const issue = find(repo, number);
      issue.labels = [...labels];
      labelWrites.push({ issue: number, labels: [...labels] });
    },
    async comment(repo, number, body) {
      calls.push(`comment ${repo}#${number}`);
      gate("comment");
      const issue = find(repo, number);
      issue.comments!.push({ id: ++nextCommentId, author: self, created_at: new Date(0).toISOString(), body });
      comments.push({ issue: number, body });
    },
  };
}
