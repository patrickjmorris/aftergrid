// Validates every fixture Finding under fixtures/instance/analytics/findings. Exit non-zero if any fails.
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
const root = new URL("../fixtures/instance/analytics/findings/", import.meta.url).pathname;
let failed = 0;
for (const d of readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory())) {
  const r = spawnSync(process.execPath, [new URL("./fixture-tool.mjs", import.meta.url).pathname, "validate", root + d.name], { encoding: "utf8" });
  const j = JSON.parse(r.stdout || "{}");
  console.log(`${r.status === 0 ? "ok  " : "FAIL"} ${d.name}: ${j.state}/${j.outcome} evidence=${j.evidence} readiness=${j.readiness} errors=${j.errors?.length ?? "?"}`);
  if (r.status !== 0) { failed++; console.log(r.stdout); }
}
process.exit(failed ? 1 : 0);
