import { writeFileSync } from 'node:fs';
import { health, verify, digest } from '../verifier.ts';
import { scenario, authenticateSynthetic } from './scenario.ts';
const happy=scenario();
const rejected=scenario();rejected.evidence.receipt.liquidator=rejected.terms.owner;
const ambiguous=scenario();ambiguous.context.recoveriesResolved=false;
const initial=health(BigInt(happy.evidence.state.collateralRaw),BigInt(happy.evidence.state.debtRaw),BigInt(happy.evidence.state.referenceRatioE18),18,6,8000);
const record={mode:'SYNTHETIC',warning:'Fabricated shadow balances and local event. No real chain transaction, collateral or policy.',
  transitions:[{step:'healthy',healthE18:initial.toString()},{step:'controlled-adapter-error',actualRatioE18:happy.evidence.state.actualRatioE18},{step:'emit-local-liquidation-event',event:happy.evidence.receipt}],
  terms:happy.terms,termsDigest:digest(happy.terms),evidence:happy.evidence,
  cases:{happy:verify(happy.terms,happy.evidence,authenticateSynthetic(happy.terms,happy.evidence)),
    rejected:verify(rejected.terms,rejected.evidence,rejected.context),review:verify(ambiguous.terms,ambiguous.evidence,ambiguous.context)}};
writeFileSync(new URL('./demonstration.json',import.meta.url),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify(record.cases,null,2));
