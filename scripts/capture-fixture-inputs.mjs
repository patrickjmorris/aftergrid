// Captures the bounded extracts each fixture Finding retains under inputs/, from the synthetic warehouse.
// Mimics the adapter's capture step (extract of declared dependency tables). Deterministic given the warehouse.
import { DuckDBInstance } from "@duckdb/node-api";
import { mkdirSync } from "node:fs";

const ROOT = new URL("../fixtures/instance/", import.meta.url).pathname;
const db = await DuckDBInstance.create(":memory:");
const c = await db.connect();
await c.run("SET TimeZone='UTC'");
await c.run(`create view users as select * from read_csv('${ROOT}data/users.csv', header=true, all_varchar=true)`);
await c.run(`create view events as select * from read_csv('${ROOT}data/events.csv', header=true, all_varchar=true)`);
await c.run(`create view subscriptions as select * from read_csv('${ROOT}data/subscriptions.csv', header=true, all_varchar=true)`);

const f1 = `${ROOT}analytics/findings/2026-07-20-onboarding-checklist-retention/inputs/`;
mkdirSync(f1, { recursive: true });
// Experiment-window users (by UTC day of signup, generously bounded) and their app_open events within 15 days.
await c.run(`copy (select * from users where onboarding_variant in ('checklist','control') and signed_up_at >= '2026-05-31' and signed_up_at < '2026-07-14' order by user_id)
  to '${f1}users.csv' (header, delimiter ',')`);
await c.run(`copy (select e.* from events e join users u using (user_id)
  where u.onboarding_variant in ('checklist','control') and u.signed_up_at >= '2026-05-31' and u.signed_up_at < '2026-07-14'
    and e."timestamp"::timestamp < u.signed_up_at::timestamp + interval 15 day order by e."timestamp", e.event_id)
  to '${f1}events.csv' (header, delimiter ',')`);

const f2 = `${ROOT}analytics/findings/2026-09-15-price-change-cancellations/inputs/`;
mkdirSync(f2, { recursive: true });
await c.run(`copy (select * from subscriptions order by subscription_id) to '${f2}subscriptions.csv' (header, delimiter ',')`);
console.log("captured inputs for both fixture Findings");
