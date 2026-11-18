const { test } = require('node:test'); const assert = require('node:assert/strict');
const { validateState, planRange, commitSuccess, atomicJson } = require('./reconciliation-state.cjs');
const config={pool:'pool',startBlock:'100'};
const state={version:1,chainId:5042002,pool:'pool',startBlock:'100',confirmations:2,nextBlock:'100',backfillComplete:false};
test('bounded confirmed backfill is contiguous across a crash/redelivery',()=>{
 const a=planRange(state,5000n);assert.deepEqual(a,{from:100n,to:2100n,complete:false});
 assert.equal(state.nextBlock,'100'); // failure never commits
 const s=commitSuccess(state,a,5000n,10);assert.equal(s.nextBlock,'2101');assert.equal(planRange(s,5000n).from,2101n);
});
test('finished history polls overlap with two descendant confirmations',()=>{
 const s=commitSuccess(state,planRange(state,1000n),1000n,10);assert.equal(s.backfillComplete,true);
 assert.deepEqual(planRange(s,1020n),{from:967n,to:1018n,complete:true});
});
test('cursor corruption, wrong pool/depth and regressed heads fail closed',()=>{
 for(const patch of [{chainId:1},{pool:'foreign'},{confirmations:1},{nextBlock:'NaN'},{nextBlock:'99'}])assert.throws(()=>validateState({...state,...patch},config));
 assert.throws(()=>planRange({...state,nextBlock:'9999'},1000n));
});
test('cursor snapshot is durable, parseable and identity checked after reopening',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'arcuex-cursor-'));const file=path.join(dir,'cursor.json');
 atomicJson(file,state);assert.deepEqual(validateState(JSON.parse(fs.readFileSync(file)),config),state);assert.equal(fs.statSync(file).mode&0o777,0o600);
});
