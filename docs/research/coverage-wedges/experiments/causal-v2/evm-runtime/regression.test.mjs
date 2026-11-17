import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url));
function run(extra=[]){const p=spawnSync(process.execPath,['replay.mjs','--check',...extra],{cwd:dir,encoding:'utf8'});assert.equal(p.status,0,p.stderr);return JSON.parse(p.stdout);}
const replay=run();
test('historical witness reproduces exact observed receipt logs',()=>{assert.equal(replay.status,'REPLAY_COMPLETED');assert.equal(replay.results[0].exactReceiptLogMatch,true);assert.equal(replay.missing.length,0);});
test('observed eligibility and correct-reference ineligibility from deployed EVM code',()=>{
 assert.equal(replay.results[0].account[5],'994396636472242223');assert.equal(replay.results[1].account[5],'1023465425310963254');
 assert.equal(replay.results[0].executionError,null);assert.equal(replay.results[1].executionError,'revert');assert.equal(replay.results[1].logCount,0);
});
test('counterfactual changes only snapshot ratio bits',()=>{
 const i=replay.intervention,mask=(1n<<104n)-1n;
 assert.equal(BigInt(i.old)&~mask,BigInt(i.new)&~mask);assert.equal(BigInt(i.new)&mask,BigInt(i.replacement));
 assert.equal(replay.results[0].canonicalRatio,replay.results[1].canonicalRatio);assert.equal(replay.results[0].debtBalance,replay.results[1].debtBalance);
});
test('real collateral depletion includes protocol fee and debt reduction',()=>{
 const r=replay.results[0];assert.equal(r.totalCollateralReduction,'5333244853672323854639');assert.equal(r.actualDebtReduction,'6304565167623755951957');
 assert.equal(r.grossLossBaseWei,'249187405918649252451');
 assert.equal(BigInt(r.totalCollateralReduction)-5327964413223143335971n,5280440449180518668n);
});
test('missing witness slot cannot silently become zero or a verified historical claim',()=>{
 const broken=run(['--omit-adapter-slot']);assert.equal(broken.status,'REVIEW');assert.equal(broken.blocker,'Error: INCOMPLETE_STORAGE_WITNESS');
});
