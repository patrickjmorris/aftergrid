// Locating and reading an Instance (docs/contracts/instance-layout.md).
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

export type InstanceConfig = {
  schema_version: string;
  instance_root?: string;
  owner?: { name?: string; contact?: string };
  publication?: { repository?: string; trusted_approvers?: string[]; automation_login?: string };
  export_defaults?: { recipient_scope?: string; granularity?: string };
  connection?: { adapter?: string };
  render?: { font?: { preset?: "system" | "geist"; family?: string; files?: { path: string; weight?: string | number; style?: "normal" | "italic" }[]; fallback?: string } };
};

export type Instance = { root: string; config: InstanceConfig };

/** Walks up from `start` to find the directory holding aftergrid.yaml. */
export function findInstance(start: string): Instance | null {
  let cur = resolve(start);
  for (let i = 0; i < 8; i++) {
    const p = join(cur, "aftergrid.yaml");
    if (existsSync(p)) return { root: cur, config: parseYaml(readFileSync(p, "utf8")) as InstanceConfig };
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}

export function readerProfileIds(instance: Instance): string[] {
  const p = join(instance.root, "readers.md");
  if (!existsSync(p)) return [];
  return [...readFileSync(p, "utf8").matchAll(/^## ([a-z][a-z0-9_]{0,63})\s*$/gm)].map((m) => m[1]!);
}
