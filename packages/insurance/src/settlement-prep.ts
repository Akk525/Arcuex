/**
 * Settlement preparation boundary for ClaimsCase.
 *
 * This module intentionally does **not** broadcast transactions.
 * When Codex A / onchain lifecycle exposes a live settle path, wire
 * `prepareSettleClaim` from `@arcuex/onchain` here behind explicit
 * authority + confirmation — never from claimant UI, LLM, or webhook alone.
 *
 * Required integration (document only; do not edit shared onchain modules here):
 * - `prepareSettleClaim({ policyId, claimId, lossKey, amount, lossCap, payoutTo })`
 * - Read-only verify via existing `verify-settlement` / pool reads
 * - Broadcast only with separate `mode=live` + per-step confirm in onchain runner
 */

export type PreparedSettlementIntent = {
  caseId: string;
  settlementPrepId: string;
  policyEntityId: string;
  claimEntityId: string | null;
  lossKey: string;
  amountMicros: string;
  lossCapMicros: string;
  payoutTo: string;
  authorityActor: string;
  broadcast: false;
  notice: string;
};

export function buildSettlementIntent(input: {
  caseId: string;
  settlementPrepId: string;
  policyEntityId: string;
  claimEntityId: string | null;
  lossKey: string;
  amountMicros: bigint;
  lossCapMicros: bigint;
  payoutTo: string;
  authorityActor: string;
  syntheticDemo: boolean;
}): PreparedSettlementIntent {
  return {
    caseId: input.caseId,
    settlementPrepId: input.settlementPrepId,
    policyEntityId: input.policyEntityId,
    claimEntityId: input.claimEntityId,
    lossKey: input.lossKey,
    amountMicros: input.amountMicros.toString(),
    lossCapMicros: input.lossCapMicros.toString(),
    payoutTo: input.payoutTo,
    authorityActor: input.authorityActor,
    broadcast: false,
    notice: input.syntheticDemo
      ? 'SYNTHETIC DEMO settlement intent — fixture consistency only; not independently verified real-world loss. No broadcast.'
      : 'Settlement intent prepared. Broadcast requires separate explicit authorization.',
  };
}
