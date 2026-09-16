// Trusted publication policy. It lives in the Instance's aftergrid.yaml, outside every Finding directory, so a
// proposed Finding cannot widen the allowlist that judges it: the search starts strictly above the Finding and an
// aftergrid.yaml inside the Finding directory is refused rather than believed. The Instance file itself must be
// guarded by CODEOWNERS or branch protection against a pull request that edits it in the same branch; this module
// only refuses to trust a policy that is missing, unreadable, self-defeating or carried by the Finding.
// Contract: docs/contracts/publication.md.
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Problem } from "../report.ts";
import { findInstance } from "../instance.ts";

export type PublicationPolicy = {
  /** `owner/repo` where Finding pull requests are opened. */
  repository: string;
  /** Logins whose APPROVED review counts, lowercased for comparison. */
  trustedApprovers: string[];
  /** The automation identity that opens the pull request, lowercased. Never a trusted approver. */
  automationLogin: string;
  /** Absolute path of the policy file this was read from, for locations and remedies. */
  path: string;
};

export type PolicyResult = { policy: PublicationPolicy | null; problems: Problem[] };

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const LOGIN_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}(?:\[bot\])?$/;
const GUARD = "guard this file with CODEOWNERS or branch protection so a Finding pull request cannot change it";

/** True when `root` strictly contains `dir`. Equal paths are not containment: the policy lives *above* the Finding. */
const strictlyAbove = (root: string, dir: string): boolean => {
  const rel = relative(root, dir);
  return rel !== "" && !isAbsolute(rel) && !rel.split(sep).includes("..");
};

/**
 * Read the publication policy that a Finding at `start` is judged by. `instanceRoot` overrides the search.
 *
 * The policy is always resolved from a directory strictly **above** the Finding: the search starts at the Finding's
 * parent, and an `aftergrid.yaml` at or below the Finding directory is refused outright. A Finding pull request
 * adds files inside the Finding directory, so a policy found there would be the proposed Finding naming the
 * allowlist, the repository and the automation identity that judge it.
 *
 * Returns `{ policy: null, problems: [policy_untrusted] }` whenever the policy cannot be trusted as written:
 * missing file, unparsable file, no publication section, no trusted approvers, a malformed repository or login,
 * a missing automation identity, or an automation identity that is itself a trusted approver. The one defect that
 * belongs to the Finding rather than to the Instance — a policy file inside the Finding directory — is reported as
 * `invalid_artifact`, which readiness raises as an error and not as a warning about the Instance.
 */
export function readPublicationPolicy(start: string, instanceRoot?: string): PolicyResult {
  const problems: Problem[] = [];
  const untrusted = (location: string, message: string, remedy: string): PolicyResult => {
    problems.push({ category: "policy_untrusted", location, message, remedy });
    return { policy: null, problems };
  };

  const findingDir = resolve(start);
  const planted = join(findingDir, "aftergrid.yaml");
  if (existsSync(planted)) {
    problems.push({
      category: "invalid_artifact",
      location: "aftergrid.yaml",
      message: "this Finding directory contains an aftergrid.yaml; a Finding cannot carry the publication policy that judges it",
      remedy: `delete ${planted}; the trusted policy lives in the Instance root above the Finding, where ${GUARD}`,
    });
    return { policy: null, problems };
  }

  let root: string;
  let config: any;
  if (instanceRoot !== undefined) {
    root = resolve(instanceRoot);
    if (!strictlyAbove(root, findingDir)) return untrusted(join(root, "aftergrid.yaml"), `the Instance root ${root} does not contain this Finding as a descendant, so its aftergrid.yaml is not the policy this Finding is judged by`, "pass the Instance root the Finding actually lives under, or omit it and let the Finding's parent directories be searched");
    const file = join(root, "aftergrid.yaml");
    if (!existsSync(file)) return untrusted(file, "no aftergrid.yaml in the Instance root; there is no trusted publication policy", `create ${file} with a publication section and ${GUARD}`);
    try { config = parseYaml(readFileSync(file, "utf8")); }
    catch (e) { return untrusted(file, `aftergrid.yaml could not be parsed: ${(e as Error).message}`, "fix the YAML; an unreadable policy is never treated as permissive"); }
  } else {
    // Start strictly above the Finding: findInstance tests its own start directory first.
    const above = dirname(findingDir);
    let instance: ReturnType<typeof findInstance> = null;
    if (above !== findingDir) {
      try { instance = findInstance(above); }
      catch (e) { return untrusted(findingDir, `the Instance aftergrid.yaml above this Finding could not be parsed: ${(e as Error).message}`, "fix the YAML; an unreadable policy is never treated as permissive"); }
    }
    if (!instance || !strictlyAbove(instance.root, findingDir)) return untrusted(findingDir, "no aftergrid.yaml above this Finding; there is no trusted publication policy", `create the Instance policy file and ${GUARD}`);
    root = instance.root;
    config = instance.config;
  }
  const file = join(root, "aftergrid.yaml");

  if (!config || typeof config !== "object") return untrusted(file, "aftergrid.yaml is not a mapping", "write the Instance policy as documented in docs/contracts/instance-layout.md");
  const pub = config.publication;
  if (!pub || typeof pub !== "object") return untrusted(`${file}#/publication`, "aftergrid.yaml has no publication section, so no approval can be verified", `add publication.repository, publication.trusted_approvers and publication.automation_login, and ${GUARD}`);

  const repository = typeof pub.repository === "string" ? pub.repository.trim() : "";
  if (!REPO_RE.test(repository)) return untrusted(`${file}#/publication/repository`, `publication.repository ${JSON.stringify(pub.repository ?? null)} is not an owner/repo string`, "name the repository where Finding pull requests are opened");

  const raw = pub.trusted_approvers;
  if (!Array.isArray(raw) || raw.length === 0) return untrusted(`${file}#/publication/trusted_approvers`, "publication.trusted_approvers is empty or missing, so no login can approve a Finding", `list the humans whose APPROVED review counts, and ${GUARD}`);
  const bad = raw.find((x: unknown) => typeof x !== "string" || !LOGIN_RE.test(x.trim()));
  if (bad !== undefined) return untrusted(`${file}#/publication/trusted_approvers`, `${JSON.stringify(bad)} is not a GitHub login`, "list plain GitHub logins; nothing else is matched against the API");
  const trustedApprovers = raw.map((x: string) => x.trim().toLowerCase());

  const automation = typeof pub.automation_login === "string" ? pub.automation_login.trim() : "";
  if (!LOGIN_RE.test(automation)) return untrusted(`${file}#/publication/automation_login`, `publication.automation_login ${JSON.stringify(pub.automation_login ?? null)} is not a GitHub login`, "name the distinct identity that opens Finding pull requests");
  const automationLogin = automation.toLowerCase();
  if (trustedApprovers.includes(automationLogin)) {
    return untrusted(`${file}#/publication/automation_login`, `the automation identity ${automation} is also on trusted_approvers; one account cannot both open a Finding pull request and approve it`, "use a separate bot account for automation_login and keep the human reviewers on trusted_approvers; there is no bypass");
  }

  return { policy: { repository, trustedApprovers, automationLogin, path: file }, problems };
}
