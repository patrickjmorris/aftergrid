// Make the package's own TypeScript sources loadable from inside `node_modules`.
//
// Node strips types from `.ts` files by default on 22.18+ and 24+ — but **not** under `node_modules`. Loading an
// installed package's `.ts` file throws `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`, and no flag turns that
// off (verified on Node 26: plain, `--experimental-strip-types` and `--no-experimental-detect-module` all
// throw). Since aftergrid ships sources and has no build step, the `aftergrid` bin registers the module load
// hook below, which strips the types itself for this package's files and nothing else.
//
// Importing this module registers the hook. It is a **side effect**, so a consumer that wants to import
// aftergrid's modules directly must let it run first and then use dynamic `import()`:
//
//     await import("aftergrid/bin/strip-types.mjs");
//     const { intake } = await import("aftergrid/src/commands/intake.ts");
//
// A static `import` of a `.ts` module in the same file would not work: ESM links the whole graph before any
// module body runs, so the `.ts` file would be translated before this hook exists.
//
// Stripping is erasure only (`mode: "strip"`): types are replaced by whitespace, so line and column numbers in
// stack traces stay true, and TypeScript that is not erasable (enums, namespaces, parameter properties) is a
// syntax error here exactly as it is under Node's own stripping. The Engine is written in erasable TypeScript.
import { readFileSync } from "node:fs";
import module from "node:module";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = new URL("../", import.meta.url).href;
const REGISTERED = Symbol.for("aftergrid.strip-types.registered");

/** Register the hook once per process. Returns what happened, so a caller can report it rather than assume it. */
export function register() {
  if (globalThis[REGISTERED]) return { registered: true, already: true };
  if (typeof module.registerHooks !== "function" || typeof module.stripTypeScriptTypes !== "function") {
    return {
      registered: false,
      already: false,
      reason:
        `this Node (${process.versions.node}) has no module.registerHooks/module.stripTypeScriptTypes, so the ` +
        `TypeScript sources in an installed copy of aftergrid cannot be loaded. Install Node 22.18 or newer on ` +
        `the 22 line, or Node 24 or newer.`,
    };
  }

  // `stripTypeScriptTypes` emits an ExperimentalWarning on first use. Keep it off the CLI's stderr, where it
  // would look like a problem with the Operator's Instance, and leave every other warning alone.
  const warned = process.listeners("warning");
  process.removeAllListeners("warning");
  process.on("warning", (w) => {
    if (w?.name === "ExperimentalWarning" && /stripTypeScriptTypes|registerHooks/.test(w.message ?? "")) return;
    for (const listener of warned) listener(w);
  });

  module.registerHooks({
    load(url, context, nextLoad) {
      if (url.startsWith(PACKAGE_ROOT) && url.endsWith(".ts")) {
        const source = readFileSync(fileURLToPath(url), "utf8");
        return { format: "module", shortCircuit: true, source: module.stripTypeScriptTypes(source, { mode: "strip" }) };
      }
      return nextLoad(url, context);
    },
  });
  globalThis[REGISTERED] = true;
  return { registered: true, already: false };
}

export const result = register();
