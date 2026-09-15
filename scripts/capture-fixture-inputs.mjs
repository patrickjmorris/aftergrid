// Capture declared extracts from the synthetic warehouse. All SQL here is fixed, trusted fixture code.
import { DuckDBInstance } from '@duckdb/node-api';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { sqlString } from './fixture-safety.mjs';

const ROOT = fileURLToPath(new URL('../fixtures/instance/', import.meta.url));
const db = await DuckDBInstance.create(':memory:');
const c = await db.connect();
try {
  await c.run("SET TimeZone='UTC'");
  for (const table of ['users','events','subscriptions']) {
    await c.run(`create view ${table} as select * from read_csv(${sqlString(join(ROOT,'data',table+'.csv'))}, header=true, all_varchar=true)`);
  }
  const f1 = join(ROOT,'analytics/findings/2026-07-20-onboarding-checklist-retention/inputs');
  mkdirSync(f1, { recursive: true });
  await c.run(`copy (select * from users where onboarding_variant in ('checklist','control') and signed_up_at >= '2026-05-31' and signed_up_at < '2026-07-14' order by user_id)
    to ${sqlString(join(f1,'users.csv'))} (header, delimiter ',')`);
  await c.run(`copy (select e.* from events e join users u using (user_id)
    where u.onboarding_variant in ('checklist','control') and u.signed_up_at >= '2026-05-31' and u.signed_up_at < '2026-07-14'
      and e."timestamp"::timestamp < u.signed_up_at::timestamp + interval 15 day order by e."timestamp", e.event_id)
    to ${sqlString(join(f1,'events.csv'))} (header, delimiter ',')`);
  const f2 = join(ROOT,'analytics/findings/2026-09-15-price-change-cancellations/inputs');
  mkdirSync(f2, { recursive: true });
  await c.run(`copy (select * from subscriptions order by subscription_id) to ${sqlString(join(f2,'subscriptions.csv'))} (header, delimiter ',')`);
  console.log('captured inputs for both fixture Findings');
} finally { c.closeSync(); db.closeSync(); }
