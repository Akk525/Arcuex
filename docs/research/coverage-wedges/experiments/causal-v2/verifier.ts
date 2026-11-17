import { createHash } from 'node:crypto';

export const WAD = 10n ** 18n;
export type Outcome = 'VERIFIED' | 'REJECTED' | 'REVIEW';
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
/** Restricted canonical JSON: ASCII keys, safe integer numbers, no bigint/undefined. */
export function canonical(value: Json): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) throw Error('NONCANONICAL_NUMBER');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
    throw Error('NONCANONICAL_OBJECT');
  return (
    '{' +
    Object.keys(value)
      .sort()
      .map((key) => {
        if (!/^[\x20-\x7e]+$/.test(key)) throw Error('NONASCII_KEY');
        return JSON.stringify(key) + ':' + canonical(value[key]!);
      })
      .join(',') +
    '}'
  );
}
export function digest(value: unknown): string {
  return (
    'sha256:' +
    createHash('sha256')
      .update('arcuex-causal-v2\n' + canonical(value as Json), 'utf8')
      .digest('hex')
  );
}
const uint = (value: string) => {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) throw Error('INVALID_UINT');
  const n = BigInt(value);
  if (n >= 2n ** 256n) throw Error('UINT256_OVERFLOW');
  return n;
};
export type Terms = {
  version: 'oracle-causal/2';
  mode: 'SYNTHETIC' | 'HISTORICAL';
  chainId: number;
  pool: string;
  codeHash: string;
  owner: string;
  beneficiary: string;
  registeredAt: number;
  startsAt: number;
  endsAt: number;
  waitSeconds: number;
  collateralDecimals: number;
  debtDecimals: number;
  liquidationThresholdBps: number;
  liquidationBonusBps: number;
  minimumReferenceHealthE18: string;
  maximumReferenceAgeSeconds: number;
  minimumDeviationBps: number;
  deductibleMicros: string;
  participationBps: number;
  policyRemainingMicros: string;
  exposureRemainingMicros: string;
  eventRemainingMicros: string;
};
export type State = {
  method: 'mock-single-pair-v1';
  collateralRaw: string;
  debtRaw: string;
  collateralDecimals: number;
  debtDecimals: number;
  liquidationThresholdBps: number;
  actualRatioE18: string;
  referenceRatioE18: string;
  referenceAt: number;
  referencePath: 'independent-wrapper' | 'shared-adapter' | 'unknown';
  positionUnchangedSinceRegistration: boolean;
  assetCount: number;
  preTransactionIndex: number;
  preLogIndex: number;
};
export type Receipt = {
  chainId: number;
  blockNumber: number;
  blockHash: string;
  transactionHash: string;
  transactionIndex: number;
  logIndex: number;
  timestamp: number;
  status: number;
  address: string;
  event: 'SyntheticLiquidation';
  owner: string;
  liquidator: string;
  seizedRaw: string;
  debtRepaidRaw: string;
};
export type Recovery = { id: string; micros: string };
export type Evidence = {
  mode: 'SYNTHETIC' | 'HISTORICAL';
  termsDigest: string;
  beneficiary: string;
  receipt: Receipt;
  state: State;
  recoveries: Recovery[];
};
/** Authenticated CONTEXT, not claimant fields. Production proof adapter is not implemented. */
export type Context = {
  deployedCodeHash: string;
  finalizedBlockHash: string;
  receiptDigest: string;
  stateDigest: string;
  recoveryDigest: string;
  completeness: 'complete' | 'unknown';
  referenceIntegrity: 'valid' | 'unknown';
  relationship: 'independent' | 'related' | 'unknown';
  recoveriesResolved: boolean;
  priorLossKeys: ReadonlySet<string>;
};
export type Result = {
  outcome: Outcome;
  reason: string;
  candidatePayableMicros: string;
  authorizesPayment: false;
  mode: Evidence['mode'];
  lossKey?: string;
  observedHealthE18?: string;
  referenceHealthE18?: string;
  grossLossMicros?: string;
};
export function health(
  collateral: bigint,
  debt: bigint,
  ratio: bigint,
  cDecimals: number,
  dDecimals: number,
  threshold: number,
): bigint {
  if (debt <= 0n) throw Error('NO_DEBT');
  // Mock contract semantics: floor at each operation. NOT Aave GenericLogic rounding.
  const collateralInDebtUnits =
    (collateral * ratio * 10n ** BigInt(dDecimals)) / (10n ** BigInt(cDecimals) * WAD);
  return (((collateralInDebtUnits * BigInt(threshold)) / 10000n) * WAD) / debt;
}
export function lossKey(receipt: Receipt): string {
  // Policy IDs deliberately absent. Event identity covers the same loss across policies.
  return digest({
    chainId: receipt.chainId,
    pool: receipt.address.toLowerCase(),
    owner: receipt.owner.toLowerCase(),
    transactionHash: receipt.transactionHash.toLowerCase(),
    logIndex: receipt.logIndex,
  });
}
export function verify(terms: Terms, e: Evidence, context: Context): Result {
  const out = (outcome: Outcome, reason: string, extra: Partial<Result> = {}): Result => ({
    outcome,
    reason,
    candidatePayableMicros: '0',
    authorizesPayment: false,
    mode: e.mode,
    ...extra,
  });
  try {
    const r = e.receipt,
      s = e.state;
    digest(e);
    digest(terms); // reject noncanonical / incomplete object encodings
    const times = [
      terms.chainId,
      terms.registeredAt,
      terms.startsAt,
      terms.endsAt,
      terms.waitSeconds,
      r.blockNumber,
      r.timestamp,
      r.chainId,
      r.transactionIndex,
      r.logIndex,
      s.preTransactionIndex,
      s.preLogIndex,
      s.referenceAt,
      terms.maximumReferenceAgeSeconds,
      terms.collateralDecimals,
      terms.debtDecimals,
      terms.minimumDeviationBps,
      terms.participationBps,
      terms.liquidationThresholdBps,
      terms.liquidationBonusBps,
    ];
    if (
      times.some((v) => !Number.isSafeInteger(v) || v < 0) ||
      terms.waitSeconds < 86400 ||
      terms.endsAt <= terms.startsAt ||
      terms.collateralDecimals > 36 ||
      terms.debtDecimals > 36 ||
      terms.liquidationThresholdBps > 10000 ||
      terms.participationBps > 10000 ||
      terms.minimumDeviationBps > 10000 ||
      terms.liquidationBonusBps < 10000 ||
      terms.liquidationBonusBps > 12000
    )
      return out('REJECTED', 'INVALID_TERMS_OR_LOCATOR');
    if (
      terms.version !== 'oracle-causal/2' ||
      e.termsDigest !== digest(terms) ||
      e.mode !== terms.mode ||
      r.chainId !== terms.chainId ||
      r.address !== terms.pool ||
      e.beneficiary !== terms.beneficiary ||
      r.owner !== terms.owner
    )
      return out('REJECTED', 'BINDING_MISMATCH');
    if (
      r.timestamp < Math.max(terms.startsAt, terms.registeredAt) + terms.waitSeconds ||
      r.timestamp >= terms.endsAt ||
      !s.positionUnchangedSinceRegistration
    )
      return out('REJECTED', 'INELIGIBLE_EXPOSURE');
    if (r.liquidator === terms.owner || context.relationship === 'related')
      return out('REJECTED', 'RELATED_LIQUIDATOR');
    if (r.status !== 1 || r.event !== 'SyntheticLiquidation')
      return out('REJECTED', 'INVALID_RECEIPT');
    if (
      !context.receiptDigest ||
      !context.stateDigest ||
      !context.recoveryDigest ||
      !context.deployedCodeHash
    )
      return out('REVIEW', 'UNAUTHENTICATED_EVIDENCE');
    if (context.deployedCodeHash !== terms.codeHash) return out('REJECTED', 'CODE_HASH_MISMATCH');
    if (
      digest(r) !== context.receiptDigest ||
      digest(s) !== context.stateDigest ||
      digest(e.recoveries) !== context.recoveryDigest
    )
      return out('REJECTED', 'EVIDENCE_COMMITMENT_MISMATCH');
    if (
      r.blockHash !== context.finalizedBlockHash ||
      context.completeness !== 'complete' ||
      s.assetCount !== 1
    )
      return out('REVIEW', 'INCOMPLETE_OR_NONFINAL_STATE');
    if (s.preTransactionIndex !== r.transactionIndex || s.preLogIndex !== r.logIndex)
      return out('REJECTED', 'WRONG_EXECUTION_POINT');
    if (
      s.collateralDecimals !== terms.collateralDecimals ||
      s.debtDecimals !== terms.debtDecimals ||
      s.liquidationThresholdBps !== terms.liquidationThresholdBps
    )
      return out('REJECTED', 'SCALING_OR_RISK_MISMATCH');
    if (
      s.referenceAt > r.timestamp ||
      r.timestamp - s.referenceAt > terms.maximumReferenceAgeSeconds ||
      s.referencePath !== 'independent-wrapper' ||
      context.referenceIntegrity !== 'valid'
    )
      return out('REVIEW', 'UNUSABLE_REFERENCE');
    if (context.relationship !== 'independent' || !context.recoveriesResolved)
      return out('REVIEW', 'UNRESOLVED_ECONOMICS');
    const key = lossKey(r);
    if (context.priorLossKeys.has(key))
      return out('REJECTED', 'DUPLICATE_ECONOMIC_LOSS', { lossKey: key });
    // The only implemented method is explicitly synthetic. Historical claims always stop here.
    if (e.mode !== 'SYNTHETIC') return out('REVIEW', 'HISTORICAL_EVM_PROOF_NOT_IMPLEMENTED');
    if (s.method !== 'mock-single-pair-v1') return out('REVIEW', 'UNSUPPORTED_REPLAY_METHOD');
    const c = uint(s.collateralRaw),
      d = uint(s.debtRaw),
      a = uint(s.actualRatioE18),
      ref = uint(s.referenceRatioE18);
    const seized = uint(r.seizedRaw),
      repaid = uint(r.debtRepaidRaw);
    if (
      a === 0n ||
      ref === 0n ||
      c === 0n ||
      d === 0n ||
      seized === 0n ||
      repaid === 0n ||
      seized > c ||
      repaid > d
    )
      return out('REJECTED', 'INVALID_POSITION_OR_FLOWS');
    const expectedSeizure =
      (repaid * BigInt(terms.liquidationBonusBps) * 10n ** BigInt(s.collateralDecimals) * WAD) /
      (10000n * 10n ** BigInt(s.debtDecimals) * a);
    if (seized !== expectedSeizure) return out('REJECTED', 'INCONSISTENT_LIQUIDATION_FLOWS');
    const observed = health(
      c,
      d,
      a,
      s.collateralDecimals,
      s.debtDecimals,
      s.liquidationThresholdBps,
    );
    const correct = health(
      c,
      d,
      ref,
      s.collateralDecimals,
      s.debtDecimals,
      s.liquidationThresholdBps,
    );
    const computed = {
      lossKey: key,
      observedHealthE18: observed.toString(),
      referenceHealthE18: correct.toString(),
    };
    if (observed >= WAD || correct < WAD || correct < uint(terms.minimumReferenceHealthE18))
      return out('REJECTED', 'NO_BUT_FOR_CAUSATION', computed);
    if ((ref - a) * 10000n < ref * BigInt(terms.minimumDeviationBps))
      return out('REJECTED', 'DEVIATION_TOO_SMALL', computed);
    // Synthetic base unit is one USDC; divide collateral/reference into USDC micros.
    const seizedMicros = (seized * ref * 1000000n) / (10n ** BigInt(s.collateralDecimals) * WAD);
    // Round debt benefit UP so rounding cannot inflate loss.
    const debtBenefitMicros =
      (repaid * 1000000n + 10n ** BigInt(s.debtDecimals) - 1n) / 10n ** BigInt(s.debtDecimals);
    const gross = seizedMicros > debtBenefitMicros ? seizedMicros - debtBenefitMicros : 0n;
    const ids = new Set<string>();
    let recoveries = 0n;
    for (const recovery of e.recoveries) {
      if (!recovery.id || ids.has(recovery.id)) return out('REJECTED', 'DUPLICATE_RECOVERY_RECORD');
      ids.add(recovery.id);
      recoveries += uint(recovery.micros);
    }
    const deductible = uint(terms.deductibleMicros);
    const net = gross > recoveries + deductible ? gross - recoveries - deductible : 0n;
    const payable = [
      (net * BigInt(terms.participationBps)) / 10000n,
      uint(terms.policyRemainingMicros),
      uint(terms.exposureRemainingMicros),
      uint(terms.eventRemainingMicros),
    ].reduce((x, y) => (x < y ? x : y));
    return out(
      payable > 0n ? 'VERIFIED' : 'REJECTED',
      payable > 0n ? 'SYNTHETIC_CAUSAL_LOSS' : 'NO_NET_LOSS_OR_CAPACITY',
      {
        ...computed,
        grossLossMicros: gross.toString(),
        candidatePayableMicros: payable.toString(),
      },
    );
  } catch {
    return out('REJECTED', 'MALFORMED_OR_NONCANONICAL_EVIDENCE');
  }
}
