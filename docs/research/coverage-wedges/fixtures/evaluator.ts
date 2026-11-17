/** Offline research arithmetic only. No signature verification, EVM replay or settlement. */
export type Verdict = {
  status: 'COVERED' | 'REJECTED' | 'REVIEW';
  reason: string;
  payableMicros: bigint;
  synthetic: true;
};
export type Terms = {
  kind: 'oracle' | 'protocol';
  chainId: number;
  pool: string;
  codeHash: string;
  position: string;
  beneficiary: string;
  startsAt: number;
  endsAt: number;
  registeredAt: number;
  waitingSeconds: number;
  deductibleMicros: bigint;
  policyRemainingMicros: bigint;
  exposureRemainingMicros: bigint;
  reservedEventRemainingMicros: bigint;
};
export type Envelope = {
  synthetic: true;
  chainId: number;
  pool: string;
  codeHash: string;
  position: string;
  beneficiary: string;
  eventAt: number;
  evaluatedAt: number;
  /** Stable event + position identity, independent of webhook delivery IDs. */
  lossKey: string;
  /** Summaries below must originate from an authenticated independent verifier. */
  verifierApproved: boolean;
  canonical: boolean;
  complete: boolean;
  referenceAgrees: boolean;
  relationship: 'independent' | 'related' | 'unknown';
  excludedConduct: boolean;
  exposureUnchanged: boolean;
  recoveriesResolved: boolean;
};
export type OracleEvidence = Envelope & {
  kind: 'oracle';
  liquidation: boolean;
  referenceUsable: boolean;
  actualRatio: bigint;
  referenceRatio: bigint;
  actualHealthE18: bigint;
  referenceHealthE18: bigint;
  seizedValueMicros: bigint;
  debtExtinguishedValueMicros: bigint;
  recoveriesMicros: bigint;
};
export type ProtocolEvidence = Envelope & {
  kind: 'protocol';
  exploitQualified: boolean;
  registeredPrincipalMicros: bigint;
  continuousLotPrincipalMicros: bigint;
  proceedsMicros: bigint;
  residualRightsMicros: bigint;
  recoveriesMicros: bigint;
  rightsResolved: boolean;
};
export type Evidence = OracleEvidence | ProtocolEvidence;
const result = (status: Verdict['status'], reason: string, payableMicros = 0n): Verdict => ({
  status,
  reason,
  payableMicros,
  synthetic: true,
});
const reject = (reason: string) => result('REJECTED', reason);
const review = (reason: string) => result('REVIEW', reason);
const min = (...values: bigint[]) => values.reduce((a, b) => (a < b ? a : b));
const positive = (n: bigint) => (n > 0n ? n : 0n);
const nonnegativeIntegers = (values: unknown[]) =>
  values.every((v) => typeof v === 'bigint' && v >= 0n);
const timestamps = (values: unknown[]) =>
  values.every((v) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0);

/** Terms and priorLossKeys are trusted evaluator context, never claimant-selected. */
export function evaluate(terms: Terms, e: Evidence, priorLossKeys: ReadonlySet<string>): Verdict {
  const amounts: unknown[] = [
    terms.deductibleMicros,
    terms.policyRemainingMicros,
    terms.exposureRemainingMicros,
    terms.reservedEventRemainingMicros,
    e.recoveriesMicros,
  ];
  if (e.kind === 'oracle')
    amounts.push(
      e.actualRatio,
      e.referenceRatio,
      e.actualHealthE18,
      e.referenceHealthE18,
      e.seizedValueMicros,
      e.debtExtinguishedValueMicros,
    );
  else if (e.kind === 'protocol')
    amounts.push(
      e.registeredPrincipalMicros,
      e.continuousLotPrincipalMicros,
      e.proceedsMicros,
      e.residualRightsMicros,
    );
  else return reject('UNKNOWN_KIND');
  if (
    !nonnegativeIntegers(amounts) ||
    !timestamps([
      terms.startsAt,
      terms.endsAt,
      terms.registeredAt,
      terms.waitingSeconds,
      e.eventAt,
      e.evaluatedAt,
    ]) ||
    terms.endsAt <= terms.startsAt ||
    terms.waitingSeconds < 86400 ||
    !Number.isSafeInteger(terms.chainId) ||
    !Number.isSafeInteger(e.chainId) ||
    typeof e.lossKey !== 'string' ||
    !e.lossKey.trim()
  )
    return reject('INVALID_INPUT');
  const flags: unknown[] = [
    e.verifierApproved,
    e.canonical,
    e.complete,
    e.referenceAgrees,
    e.excludedConduct,
    e.exposureUnchanged,
    e.recoveriesResolved,
  ];
  flags.push(
    ...(e.kind === 'oracle'
      ? [e.liquidation, e.referenceUsable]
      : [e.exploitQualified, e.rightsResolved]),
  );
  if (flags.some((v) => typeof v !== 'boolean')) return reject('INVALID_INPUT');
  if (e.synthetic !== true) return reject('SYNTHETIC_ONLY');
  if (
    e.kind !== terms.kind ||
    e.chainId !== terms.chainId ||
    e.pool !== terms.pool ||
    e.codeHash !== terms.codeHash ||
    e.position !== terms.position ||
    e.beneficiary !== terms.beneficiary
  )
    return reject('SCOPE_MISMATCH');
  if (
    e.eventAt - terms.startsAt < terms.waitingSeconds ||
    e.eventAt - terms.registeredAt < terms.waitingSeconds ||
    e.eventAt >= terms.endsAt ||
    e.evaluatedAt < e.eventAt
  )
    return reject('OUTSIDE_WINDOW');
  if (priorLossKeys.has(e.lossKey)) return reject('DUPLICATE_LOSS');
  if (e.relationship === 'related' || e.excludedConduct || !e.exposureUnchanged)
    return reject('EXCLUDED_CONDUCT_OR_EXPOSURE');
  if (e.relationship !== 'independent') return review('RELATIONSHIP_UNKNOWN');
  if (!e.verifierApproved || !e.canonical || !e.complete || !e.referenceAgrees)
    return review('EVIDENCE_UNRESOLVED');
  if (!e.recoveriesResolved) return review('RECOVERIES_UNRESOLVED');
  let net: bigint;
  if (e.kind === 'oracle') {
    if (!e.referenceUsable) return review('REFERENCE_UNUSABLE');
    if (e.actualRatio === 0n || e.referenceRatio === 0n) return reject('INVALID_RATIO');
    if (!e.liquidation) return reject('NO_LIQUIDATION');
    if (e.actualHealthE18 >= 10n ** 18n || e.referenceHealthE18 < 102n * 10n ** 16n)
      return reject('NO_BUT_FOR_CAUSATION');
    if ((e.referenceRatio - e.actualRatio) * 10000n < e.referenceRatio * 200n)
      return reject('BELOW_DEVIATION_THRESHOLD');
    net = positive(e.seizedValueMicros - e.debtExtinguishedValueMicros - e.recoveriesMicros);
  } else {
    if (!e.exploitQualified) return review('EXPLOIT_UNQUALIFIED');
    if (e.evaluatedAt - e.eventAt < 30 * 86400) return review('RECOVERY_WINDOW');
    if (!e.rightsResolved) return review('RIGHTS_UNRESOLVED');
    net = positive(
      min(e.registeredPrincipalMicros, e.continuousLotPrincipalMicros) -
        e.proceedsMicros -
        e.residualRightsMicros -
        e.recoveriesMicros,
    );
  }
  const payable = min(
    terms.policyRemainingMicros,
    terms.exposureRemainingMicros,
    terms.reservedEventRemainingMicros,
    (positive(net - terms.deductibleMicros) * 8000n) / 10000n,
  );
  return payable > 0n
    ? result('COVERED', 'SYNTHETIC_RULE_MATCH', payable)
    : reject('NO_PAYABLE_LOSS_OR_CAPACITY');
}
