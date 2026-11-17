import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canonical,digest,health,lossKey,verify,WAD} from './verifier.ts';
import {scenario,authenticateSynthetic} from './synthetic/scenario.ts';
test('healthy -> faulty adapter -> emitted liquidation -> causal net loss',()=>{
  const {terms,evidence,context}=scenario();const r=verify(terms,evidence,context);
  assert.equal(r.outcome,'VERIFIED');assert.equal(r.observedHealthE18,'979591836734693877');
  assert.equal(r.referenceHealthE18,'1020408163265306122');
  assert.equal(r.grossLossMicros,'937500');assert.equal(r.candidatePayableMicros,'510000');
  assert.equal(r.authorizesPayment,false);
});
for(const [label,mutate] of [
  ['chain',(x:ReturnType<typeof scenario>)=>{x.evidence.receipt.chainId=1;}],
  ['pool',(x:ReturnType<typeof scenario>)=>{x.evidence.receipt.address='0x'+'44'.repeat(20);} ],
  ['beneficiary',(x:ReturnType<typeof scenario>)=>{x.evidence.beneficiary='0x'+'44'.repeat(20);} ],
  ['owner',(x:ReturnType<typeof scenario>)=>{x.evidence.receipt.owner='0x'+'44'.repeat(20);} ],
  ['postincident registration',(x:ReturnType<typeof scenario>)=>{x.terms.registeredAt=x.evidence.receipt.timestamp+1;x.evidence.termsDigest=digest(x.terms);} ],
  ['increased exposure',(x:ReturnType<typeof scenario>)=>{x.evidence.state.positionUnchangedSinceRegistration=false;} ],
  ['controlled liquidator',(x:ReturnType<typeof scenario>)=>{x.evidence.receipt.liquidator=x.terms.owner;} ],
] as const) test(`rejects ${label}`,()=>{const x=scenario();mutate(x);assert.equal(verify(x.terms,x.evidence,x.context).outcome,'REJECTED');});
test('forged receipt cannot authenticate by rehashing itself',()=>{
  const x=scenario();x.evidence.receipt.seizedRaw=(10n*WAD).toString();
  assert.equal(verify(x.terms,x.evidence,x.context).reason,'EVIDENCE_COMMITMENT_MISMATCH');
});
for(const field of ['preTransactionIndex','preLogIndex'] as const) test(`wrong ${field} even if authentic is rejected`,()=>{
  const x=scenario();x.evidence.state[field]++;x.context=authenticateSynthetic(x.terms,x.evidence);
  assert.equal(verify(x.terms,x.evidence,x.context).reason,'WRONG_EXECUTION_POINT');
});
test('incomplete multiasset state is REVIEW',()=>{
  const x=scenario();x.evidence.state.assetCount=2;x.context=authenticateSynthetic(x.terms,x.evidence);
  assert.equal(verify(x.terms,x.evidence,x.context).outcome,'REVIEW');
});
for(const field of ['collateralDecimals','debtDecimals','liquidationThresholdBps'] as const) test(`wrong ${field} rejected`,()=>{
  const x=scenario();x.evidence.state[field]++;x.context=authenticateSynthetic(x.terms,x.evidence);
  assert.equal(verify(x.terms,x.evidence,x.context).reason,'SCALING_OR_RISK_MISMATCH');
});
for(const mode of ['stale','shared','manipulated','future'] as const) test(`${mode} reference is REVIEW`,()=>{
  const x=scenario();
  if(mode==='stale')x.evidence.state.referenceAt--;
  if(mode==='future')x.evidence.state.referenceAt++;
  if(mode==='shared')x.evidence.state.referencePath='shared-adapter';
  x.context=authenticateSynthetic(x.terms,x.evidence);
  if(mode==='manipulated')x.context.referenceIntegrity='unknown';
  const r=verify(x.terms,x.evidence,x.context);assert.equal(r.outcome,'REVIEW');assert.equal(r.candidatePayableMicros,'0');assert.equal(r.authorizesPayment,false);
});
test('narratively healthy reference must actually prevent liquidation',()=>{
  const x=scenario();x.evidence.state.referenceRatioE18='1210000000000000000';x.context=authenticateSynthetic(x.terms,x.evidence);
  assert.equal(verify(x.terms,x.evidence,x.context).reason,'NO_BUT_FOR_CAUSATION');
});
test('exact HF 1 is not liquidatable in the mock, independent of rounding display',()=>{
  assert.equal(health(100n*WAD,100000000n,1250000000000000000n,18,6,8000),WAD);
});
test('duplicate economic loss across policy IDs rejected',()=>{
  const x=scenario();x.context.priorLossKeys=new Set([lossKey(x.evidence.receipt)]);
  assert.equal(verify(x.terms,x.evidence,x.context).reason,'DUPLICATE_ECONOMIC_LOSS');
});
test('completed compensation offsets the entire gross loss',()=>{
  const x=scenario();x.evidence.recoveries=[{id:'full-reimbursement',micros:'937500'}];x.context=authenticateSynthetic(x.terms,x.evidence);
  assert.equal(verify(x.terms,x.evidence,x.context).candidatePayableMicros,'0');
});
test('duplicate recovery IDs and omitted known recovery are rejected',()=>{
  const x=scenario();x.evidence.recoveries.push({...x.evidence.recoveries[0]!});x.context=authenticateSynthetic(x.terms,x.evidence);
  assert.equal(verify(x.terms,x.evidence,x.context).reason,'DUPLICATE_RECOVERY_RECORD');
  const y=scenario();y.evidence.recoveries=[];assert.equal(verify(y.terms,y.evidence,y.context).reason,'EVIDENCE_COMMITMENT_MISMATCH');
});
test('correlated positions cannot consume more than shared event budget in serial harness',()=>{
  let budget=600000n;let paid=0n;
  for(let i=0;i<3;i++){
    const x=scenario();x.terms.eventRemainingMicros=budget.toString();x.evidence.termsDigest=digest(x.terms);
    x.evidence.receipt.transactionHash='0x'+String(i+1).repeat(64);x.context=authenticateSynthetic(x.terms,x.evidence);
    const r=verify(x.terms,x.evidence,x.context);const p=BigInt(r.candidatePayableMicros);paid+=p;budget-=p;
  }
  assert.equal(paid,600000n);assert.equal(budget,0n);
});
for(const field of ['completeness','relationship','recoveriesResolved','finalizedBlockHash','receiptDigest','deployedCodeHash'] as const) test(`${field} gate fails closed`,()=>{
  const x=scenario();
  if(field==='completeness')x.context.completeness='unknown';
  if(field==='relationship')x.context.relationship='unknown';
  if(field==='recoveriesResolved')x.context.recoveriesResolved=false;
  if(field==='finalizedBlockHash')x.context.finalizedBlockHash='0x'+'cc'.repeat(32);
  if(field==='receiptDigest')x.context.receiptDigest='';
  if(field==='deployedCodeHash')x.context.deployedCodeHash='';
  assert.equal(verify(x.terms,x.evidence,x.context).outcome,'REVIEW');
});
test('cannot label the synthetic method a historical proof',()=>{
  const x=scenario();x.evidence.mode='HISTORICAL';x.terms.mode='HISTORICAL';x.evidence.termsDigest=digest(x.terms);
  const r=verify(x.terms,x.evidence,x.context);assert.equal(r.outcome,'REVIEW');assert.equal(r.candidatePayableMicros,'0');
});
test('noncanonical numeric and integer encodings reject',()=>{
  assert.throws(()=>canonical({n:1.5}));assert.throws(()=>canonical({n:-0}));assert.throws(()=>canonical({n:undefined} as never));
  const x=scenario();x.evidence.state.debtRaw='098000000';x.context=authenticateSynthetic(x.terms,x.evidence);
  assert.equal(verify(x.terms,x.evidence,x.context).outcome,'REJECTED');
});
test('encoding invariant to object key order but sensitive to values',()=>{
  assert.equal(digest({b:'2',a:'1'}),digest({a:'1',b:'2'}));assert.notEqual(digest({a:'1'}),digest({a:'2'}));
});
