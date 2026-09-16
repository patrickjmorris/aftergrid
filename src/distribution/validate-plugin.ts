// `aftergrid plugin validate` (spec story 48, docs/contracts/distribution.md).
//
// The Engine ships its skills three ways at once — as a Claude Code plugin, as directories a skills.sh install
// copies, and as `agents/openai.yaml` files a Codex-style agent reads — and the same fact has to be true in all
// three. The one that matters most is who may start a skill: a skill that writes files and installs a hook is
// started by a human, and if `SKILL.md` says so while `openai.yaml` disagrees, one of the two audiences is
// wrong. Nothing here infers that fact from a default; each file states it, and this checks the statements
// against each other.
//
// What it does NOT establish: that a skill works, that Claude Code or skills.sh accepts the layout (neither
// installer is run here), or that the prose is any good.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { emptyReport, type Problem, type Report } from "../report.ts";
// @ts-ignore: shared path containment (JS module, no types).
import { safePath } from "../../scripts/fixture-safety.mjs";

/** Subdirectories of `skills/` that hold buckets rather than a skill. Nothing here is shipped in the plugin. */
export const BUCKETS = new Set(["in-progress", "deprecated", "misc"]);

export type Invocation = "user" | "model";

export type SkillPolicy = {
  name: string;
  /** Repository-relative directory, e.g. `skills/setup-aftergrid`. */
  dir: string;
  invocation: Invocation | "unstated";
};

export type PluginReport = Report & { skills: SkillPolicy[] };

const rel = (root: string, path: string) => relative(root, path) || ".";

/** A path inside `root`, or `null` when the manifest names something that escapes it. */
function inside(root: string, candidate: string): string | null {
  try {
    return safePath(root, candidate.replace(/^\.\//, "").replace(/\/+$/, ""));
  } catch {
    return null;
  }
}

/** YAML frontmatter delimited by `---` lines, or null when the file does not open with one. */
export function frontmatter(source: string): Record<string, unknown> | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?(?:\n|$)/.exec(source);
  if (!m) return null;
  const parsed = parseYaml(m[1]!);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
}

/**
 * Check the plugin manifest, the promoted skills it names, and the three places each skill's invocation policy
 * is written down. `root` is the repository (or the root of an installed copy of the package).
 */
export function validatePlugin(root: string): PluginReport {
  const report = emptyReport("plugin") as PluginReport;
  report.skills = [];
  report.readiness = "unknown";
  report.readiness_reasons.push("publication readiness is a fact about a Finding, not about the plugin package");
  const err = (p: Problem) => report.errors.push(p);

  const rootDir = resolve(root);
  const manifestPath = join(rootDir, ".claude-plugin", "plugin.json");
  if (!existsSync(manifestPath)) {
    err({ category: "missing_file", location: rel(rootDir, manifestPath), message: "no Claude Code plugin manifest", remedy: "add .claude-plugin/plugin.json with name, description, version and the promoted skill paths" });
    report.syntax = "invalid";
    return report;
  }

  let manifest: Record<string, unknown>;
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("the manifest is not a JSON object");
    manifest = parsed as Record<string, unknown>;
  } catch (e) {
    err({ category: "syntax", location: ".claude-plugin/plugin.json", message: (e as Error).message, remedy: "fix the JSON; nothing else was checked" });
    report.syntax = "invalid";
    return report;
  }

  for (const field of ["name", "description", "version"] as const) {
    const value = manifest[field];
    if (typeof value !== "string" || !value.trim()) {
      err({ category: "incomplete", location: `.claude-plugin/plugin.json#${field}`, message: `${field} is missing or empty`, remedy: `set ${field} in the plugin manifest` });
    }
  }

  const listed = Array.isArray(manifest.skills) ? (manifest.skills as unknown[]) : null;
  if (listed === null) {
    err({ category: "plugin_manifest", location: ".claude-plugin/plugin.json#skills", message: "the manifest lists no skills", remedy: "list each promoted skill path explicitly, e.g. \"./skills/setup-aftergrid\"" });
  }

  const manifestPaths: string[] = [];
  for (const entry of listed ?? []) {
    if (typeof entry !== "string") {
      err({ category: "plugin_manifest", location: ".claude-plugin/plugin.json#skills", message: `skills entries are paths; found ${JSON.stringify(entry)}`, remedy: "use a repository-relative path such as \"./skills/<name>\"" });
      continue;
    }
    const dir = inside(rootDir, entry);
    if (!dir) {
      err({ category: "unsafe_path", location: `.claude-plugin/plugin.json#skills`, message: `${entry} is not a plain relative path inside the package`, remedy: "name skills by a relative path with no '..', absolute segment or symlink" });
      continue;
    }
    manifestPaths.push(rel(rootDir, dir));
    if (!existsSync(join(dir, "SKILL.md"))) {
      err({ category: "plugin_manifest", location: `.claude-plugin/plugin.json#skills`, message: `${entry} is named in the manifest but has no SKILL.md`, remedy: `create ${rel(rootDir, dir)}/SKILL.md, or remove the entry` });
      continue;
    }
    const bucket = rel(rootDir, dir).split("/")[1];
    if (rel(rootDir, dir).split("/").length > 2 && bucket && BUCKETS.has(bucket)) {
      err({ category: "plugin_manifest", location: `.claude-plugin/plugin.json#skills`, message: `${entry} is in the ${bucket} bucket, which is not shipped`, remedy: `promote it to skills/<name>/ before listing it, or remove the entry` });
    }
  }

  // The package.json index skills.sh installs read, mirroring mattpocock-skills. When present it must agree.
  const pkgPath = join(rootDir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      if (Array.isArray(pkg.skills)) {
        const pkgPaths = pkg.skills.map((s: unknown) => String(s).replace(/^\.\//, "").replace(/\/+$/, "")).sort();
        const manifestSorted = [...manifestPaths].sort();
        if (JSON.stringify(pkgPaths) !== JSON.stringify(manifestSorted)) {
          err({ category: "plugin_manifest", location: "package.json#skills", message: `the package.json skills index (${pkgPaths.join(", ") || "empty"}) does not match the plugin manifest (${manifestSorted.join(", ") || "empty"})`, remedy: "list the same promoted skill paths in both files" });
        }
      }
    } catch (e) {
      err({ category: "syntax", location: "package.json", message: (e as Error).message });
    }
  }

  // Promoted skills on disk: the direct children of skills/ that are not buckets.
  const skillsRoot = join(rootDir, "skills");
  const promoted: string[] = [];
  if (existsSync(skillsRoot)) {
    for (const entry of readdirSync(skillsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || BUCKETS.has(entry.name) || entry.name.startsWith(".")) continue;
      if (existsSync(join(skillsRoot, entry.name, "SKILL.md"))) promoted.push(entry.name);
    }
  } else {
    err({ category: "missing_file", location: "skills", message: "there is no skills directory", remedy: "the plugin ships skills/<name>/SKILL.md; see skills/README.md" });
  }

  for (const name of promoted.sort()) {
    const dirRel = `skills/${name}`;
    if (!manifestPaths.includes(dirRel)) {
      err({ category: "plugin_manifest", location: dirRel, message: `${dirRel} is a promoted skill but the manifest does not list it`, remedy: `add "./${dirRel}" to .claude-plugin/plugin.json#skills (and to package.json#skills), or move it to skills/in-progress/` });
    }
    report.skills.push(checkSkill(rootDir, name, err));
  }

  report.content = report.errors.length ? "incomplete" : "complete";
  report.info.push(`plugin ${String(manifest.name ?? "?")} ${String(manifest.version ?? "?")}: ${promoted.length} promoted skill(s) — ${promoted.sort().join(", ") || "none"}`);
  for (const s of report.skills) report.info.push(`skill ${s.name}: ${s.invocation}-invoked`);
  report.info.push("what this did not check: that Claude Code or skills.sh accepts the layout (neither installer was run), and that any skill does what it says");
  return report;
}

/** One promoted skill: frontmatter, the invocation policy in both files, and the docs page. */
function checkSkill(rootDir: string, name: string, err: (p: Problem) => void): SkillPolicy {
  const dirRel = `skills/${name}`;
  const skillPath = join(rootDir, dirRel, "SKILL.md");
  const result: SkillPolicy = { name, dir: dirRel, invocation: "unstated" };

  let fm: Record<string, unknown> | null = null;
  try {
    fm = frontmatter(readFileSync(skillPath, "utf8"));
  } catch (e) {
    err({ category: "syntax", location: `${dirRel}/SKILL.md`, message: (e as Error).message });
    return result;
  }
  if (!fm) {
    err({ category: "syntax", location: `${dirRel}/SKILL.md`, message: "no YAML frontmatter block", remedy: "open the file with a --- delimited frontmatter block carrying name, description and the invocation policy" });
    return result;
  }

  if (typeof fm.name !== "string" || !fm.name.trim()) {
    err({ category: "incomplete", location: `${dirRel}/SKILL.md#name`, message: "frontmatter has no name", remedy: `set name: ${name}` });
  } else if (fm.name !== name) {
    err({ category: "plugin_manifest", location: `${dirRel}/SKILL.md#name`, message: `frontmatter name '${fm.name}' is not the directory name '${name}'`, remedy: "a skill is addressed by its directory name; make the two the same" });
  }
  if (typeof fm.description !== "string" || !fm.description.trim()) {
    err({ category: "incomplete", location: `${dirRel}/SKILL.md#description`, message: "frontmatter has no description", remedy: "describe when to use the skill; this is the line an agent routes on" });
  }

  // Exactly one of the two policy keys. Absent is not "the default is fine": it is unstated, and unstated is an
  // error, because the openai.yaml on the other side has a different default.
  const disablesModel = fm["disable-model-invocation"] === true;
  const hidesFromUser = fm["user-invocable"] === false;
  if (disablesModel && hidesFromUser) {
    err({ category: "invocation_policy", location: `${dirRel}/SKILL.md`, message: "frontmatter says both disable-model-invocation: true and user-invocable: false, so nothing may start the skill", remedy: "keep exactly one: user-invoked skills carry disable-model-invocation: true, model-invoked skills carry user-invocable: false" });
  } else if (disablesModel) {
    result.invocation = "user";
  } else if (hidesFromUser) {
    result.invocation = "model";
  } else {
    err({ category: "invocation_policy", location: `${dirRel}/SKILL.md`, message: "frontmatter states no invocation policy", remedy: "add disable-model-invocation: true (user-invoked) or user-invocable: false (model-invoked); see skills/README.md" });
  }

  const openaiRel = `${dirRel}/agents/openai.yaml`;
  const openaiPath = join(rootDir, openaiRel);
  if (!existsSync(openaiPath)) {
    err({ category: "missing_file", location: openaiRel, message: "no openai.yaml beside the skill", remedy: `create ${openaiRel} with interface.display_name, interface.short_description and policy.allow_implicit_invocation (spec story 48)` });
  } else {
    let doc: any = null;
    try {
      doc = parseYaml(readFileSync(openaiPath, "utf8"));
    } catch (e) {
      err({ category: "syntax", location: openaiRel, message: (e as Error).message });
    }
    if (doc && typeof doc === "object") {
      const allow = doc?.policy?.allow_implicit_invocation;
      if (typeof allow !== "boolean") {
        err({ category: "invocation_policy", location: `${openaiRel}#policy.allow_implicit_invocation`, message: "the invocation policy is not stated", remedy: `state it: false for a user-invoked skill, true for a model-invoked one (SKILL.md says ${result.invocation}-invoked)` });
      } else if (result.invocation !== "unstated" && allow !== (result.invocation === "model")) {
        err({
          category: "invocation_policy",
          location: `${openaiRel}#policy.allow_implicit_invocation`,
          message: `openai.yaml says allow_implicit_invocation: ${allow}, but ${dirRel}/SKILL.md says the skill is ${result.invocation}-invoked`,
          remedy: result.invocation === "user"
            ? "a user-invoked skill sets allow_implicit_invocation: false"
            : "a model-invoked skill sets allow_implicit_invocation: true",
        });
      }
      if (typeof doc?.interface?.display_name !== "string" || typeof doc?.interface?.short_description !== "string") {
        err({ category: "incomplete", location: `${openaiRel}#interface`, message: "interface needs display_name and short_description", remedy: "add both; a Codex-style agent shows them" });
      }
    }
  }

  const docsRel = `docs/skills/${name}.md`;
  if (!existsSync(join(rootDir, docsRel))) {
    err({ category: "missing_file", location: docsRel, message: "a promoted skill has no docs page", remedy: `write ${docsRel}: what it does, its inputs, what it verifies and what it does not` });
  } else if (!statSync(join(rootDir, docsRel)).size) {
    err({ category: "incomplete", location: docsRel, message: "the docs page is empty" });
  }

  return result;
}
