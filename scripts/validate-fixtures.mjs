// Validate all fixture Findings and report child-process failures without hiding their diagnostics.
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(new URL("../fixtures/instance/analytics/findings/", import.meta.url));
let failed = 0;
for (const d of readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory()).sort((a,b) => a.name.localeCompare(b.name))) {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL("./fixture-tool.mjs", import.meta.url)), "validate", join(root, d.name)], { encoding: "utf8", timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
  let j;
  try { j = JSON.parse(r.stdout); } catch { j = null; }
  const ok = r.status === 0 && j && Array.isArray(j.errors) && j.errors.length === 0;
  console.log(`${ok ? "ok  " : "FAIL"} ${d.name}: ${j?.state ?? "unknown"}/${j?.outcome ?? "unknown"} evidence=${j?.evidence ?? "unknown"} readiness=${j?.readiness ?? "unknown"} errors=${j?.errors?.length ?? "?"}`);
  if (!ok) { failed++; console.error(r.error?.message || r.stderr || r.stdout || "validator returned no report"); }
}
process.exitCode = failed ? 1 : 0;
