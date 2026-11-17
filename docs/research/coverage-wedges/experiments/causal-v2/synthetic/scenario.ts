import { digest, health, WAD, type Terms, type State, type Receipt, type Evidence, type Context } from '../verifier.ts';
export function scenario(): { terms: Terms; evidence: Evidence; context: Context } {
  const terms: Terms = {
    version: 'oracle-causal/2', mode: 'SYNTHETIC', chainId: 5042002,
    pool: '0x'+'11'.repeat(20), codeHash: 'synthetic:mock-single-pair-v1',
    owner: '0x'+'22'.repeat(20), beneficiary: '0x'+'22'.repeat(20),
    registeredAt: 100, startsAt: 100, endsAt: 9999999, waitSeconds: 86400,
    collateralDecimals: 18, debtDecimals: 6, liquidationThresholdBps: 8000, liquidationBonusBps:10500,
    minimumReferenceHealthE18: '1020000000000000000', maximumReferenceAgeSeconds: 0,
    minimumDeviationBps: 200, deductibleMicros: '100000', participationBps: 8000,
    policyRemainingMicros: '1000000000', exposureRemainingMicros: '1000000000',eventRemainingMicros: '2000000',
  };
  const state: State = {
    method:'mock-single-pair-v1',collateralRaw:(100n*WAD).toString(),debtRaw:'98000000',
    collateralDecimals:18,debtDecimals:6,liquidationThresholdBps:8000,
    actualRatioE18:'1200000000000000000',referenceRatioE18:'1250000000000000000',referenceAt:100000,
    referencePath:'independent-wrapper',positionUnchangedSinceRegistration:true,assetCount:1,
    preTransactionIndex:3,preLogIndex:7,
  };
  const receipt: Receipt = {
    chainId:5042002,blockNumber:123,blockHash:'0x'+'aa'.repeat(32),transactionHash:'0x'+'bb'.repeat(32),
    transactionIndex:3,logIndex:7,timestamp:100000,status:1,address:terms.pool,event:'SyntheticLiquidation',
    owner:terms.owner,liquidator:'0x'+'33'.repeat(20),debtRepaidRaw:'10000000',
    seizedRaw:(10000000n*10500n*WAD*WAD/(10000n*1000000n*1200000000000000000n)).toString(),
  };
  if(health(BigInt(state.collateralRaw),BigInt(state.debtRaw),BigInt(state.actualRatioE18),18,6,8000)>=WAD) throw Error('SIMULATION_NOT_LIQUIDATABLE');
  const evidence: Evidence = {mode:'SYNTHETIC',termsDigest:digest(terms),beneficiary:terms.beneficiary,receipt,state,recoveries:[{id:'synthetic:grant-1',micros:'200000'}]};
  return {terms,evidence,context:authenticateSynthetic(terms,evidence)};
}
/** Test harness only. MUST NOT be used to authenticate claimant evidence in production. */
export function authenticateSynthetic(terms: Terms, e: Evidence): Context {
  return {deployedCodeHash:terms.codeHash,finalizedBlockHash:e.receipt.blockHash,receiptDigest:digest(e.receipt),stateDigest:digest(e.state),recoveryDigest:digest(e.recoveries),
    completeness:'complete',referenceIntegrity:'valid',relationship:'independent',recoveriesResolved:true,priorLossKeys:new Set()};
}
