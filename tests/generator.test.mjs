import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, symlinkSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
test('synthetic generation is deterministic, respects the capture cutoff, and captures from quoted paths',t=>{
  const root=mkdtempSync(join(tmpdir(),"aftergrid-generator ' "));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  mkdirSync(join(root,'scripts'));
  for(const file of ['gen-fixture-data.mjs','capture-fixture-inputs.mjs','fixture-safety.mjs'])cpSync(join(ROOT,'scripts',file),join(root,'scripts',file));
  symlinkSync(join(ROOT,'node_modules'),join(root,'node_modules'),'dir');
  const run=name=>{const r=spawnSync(process.execPath,[join(root,'scripts',name)],{encoding:'utf8',timeout:15000});assert.equal(r.status,0,r.stderr+r.stdout);};
  const data=name=>readFileSync(join(root,'fixtures/instance/data',name+'.csv'),'utf8');
  run('gen-fixture-data.mjs');
  const before=Object.fromEntries(['users','events','subscriptions'].map(n=>[n,data(n)]));
  run('gen-fixture-data.mjs');
  for(const name of Object.keys(before))assert.equal(data(name),before[name]);
  const cutoff=Date.parse('2026-09-15T04:00:00Z');
  for(const [name,cols] of [['users',['signed_up_at']],['events',['timestamp']],['subscriptions',['started_at','canceled_at']]]){
    const lines=data(name).trim().split('\n');const header=lines.shift().split(',');
    for(const line of lines){const cells=line.split(',');for(const col of cols){const value=cells[header.indexOf(col)];if(value)assert.ok(Date.parse(value)<cutoff,`${name}.${col} exceeds capture: ${value}`);}}
  }
  run('capture-fixture-inputs.mjs');
  const retained=readFileSync(join(root,'fixtures/instance/analytics/findings/2026-09-15-price-change-cancellations/inputs/subscriptions.csv'),'utf8');
  assert.ok(retained.includes('s_000006b5'), 'excluded-cohort regression row remains in retained inputs');
});
