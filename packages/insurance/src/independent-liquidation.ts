import { createPublicKey, verify } from 'node:crypto';
import { z } from 'zod';
import {
  INDEPENDENT_LIQUIDATION_VERIFIER,
  isSupportedIndependentTerms,
  sameIndependentLiquidationProfile,
  newId,
  ValidationError,
  type IndependentLiquidationProfile,
} from '@arcuex/domain';
import type { InsuranceRepository } from '@arcuex/persistence';
import { assertClaimsRole, claimsActorId, type ClaimsPrincipal } from './claims-auth';
import { canAccessClaimsPolicy, getClaimsCase } from './claims-case-service';
import { isWithinClaimWindow, readClaimChronology } from './claim-chronology';
import { claimVerificationContext, verificationDigest } from './claim-verification';

const hash = z.string().regex(/^0x[0-9a-f]{64}$/);
const artifactDigest = hash.refine((value) => !/^0x0{64}$/.test(value));
const signature = z.string().regex(/^[0-9a-f]{128}$/);
const micros = z.string().regex(/^(0|[1-9][0-9]{0,14})$/);
const ratio = z.number().int().nonnegative().max(1_000_000_000);
const Envelope = z
  .object({
    body: z.string().max(9000),
    replaySignature: signature,
    recoverySignature: signature,
  })
  .strict();
const Attestation = z
  .object({
    verifier: z.literal(INDEPENDENT_LIQUIDATION_VERIFIER),
    chainId: z.literal(5042002),
    caseId: z.string().uuid(),
    policyId: z.string().uuid(),
    exposureId: z.string().uuid(),
    incidentId: z.string().uuid(),
    termsHash: hash,
    transactionHash: hash,
    logIndex: z.number().int().nonnegative().max(1_000_000),
    blockHash: hash,
    replayDigest: artifactDigest,
    canonicalRatioBps: ratio,
    otherCausesExcluded: z.boolean(),
    accountingDigest: artifactDigest,
    recoveriesResolved: z.boolean(),
    recoveriesMicros: micros,
    priorCompensationMicros: micros,
    accountedThroughMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

export const INDEPENDENT_EVENT_REFERENCE = /^evm:5042002:0x[0-9a-f]{64}:(0|[1-9][0-9]{0,6})$/;
export const INDEPENDENT_MANIFEST_METHOD = 'independent_liquidation_v1';
const FRESH_MS = 300_000;

// The HTTP layer owns this read connection. No claimant-supplied URLs or data-source adapters.
export type IndependentEvidenceSource = {
  readLiquidation(
    transactionHash: `0x${string}`,
    logIndex: number,
    profile: IndependentLiquidationProfile,
  ): Promise<{
    blockNumber: bigint;
    blockHash: string;
    blockTimestamp: bigint;
    positionId: string;
    owner: string;
    seizedUsdcMicros: bigint;
    extinguishedDebtUsdcMicros: bigint;
    adapterRatioBps: bigint;
    liquidationThresholdBps: bigint;
  }>;
};
export type IndependentLiquidationVerification = {
  id: string;
  caseId: string;
  requestDigest: string;
  contextDigest: string;
  actor: string;
  createdAt: string;
  verifierVersion: typeof INDEPENDENT_LIQUIDATION_VERIFIER;
  fixtureReference: null;
  fixtureDigest: null;
  inputs: unknown;
  facts: unknown[];
  findings: string[];
  executionStatus: 'completed' | 'rejected';
  evidenceSufficiency: 'sufficient' | 'missing' | 'invalid' | 'contradictory';
  authenticity: 'verified_independent' | 'unverified';
  independentlyAuthenticated: boolean;
  eventRef?: string;
  profile?: IndependentLiquidationProfile;
  anchor?: { number: string; hash: string; timestamp: string };
  manifestDigest?: string;
  validUntilMs?: number;
  lossAssessment?: {
    grossLossMicros: string;
    recoveriesMicros: string;
    priorCompensationMicros: string;
    recoveriesResolved: true;
    asset: 'USDC';
    scale: 6;
    basis: string;
  };
};

export function independentAttestationMessage(role: 'replay' | 'recovery', body: string) {
  return Buffer.from(`arcuex/${INDEPENDENT_LIQUIDATION_VERIFIER}/${role}\n${body}`);
}
function authentic(role: 'replay' | 'recovery', body: string, key: string, sig: string) {
  const publicKey = createPublicKey({
    key: Buffer.from('302a300506032b6570032100' + key, 'hex'),
    format: 'der',
    type: 'spki',
  });
  return verify(
    null,
    independentAttestationMessage(role, body),
    publicKey,
    Buffer.from(sig, 'hex'),
  );
}

export async function verifyIndependentLiquidation(
  repo: InsuranceRepository,
  caseId: string,
  input: unknown,
  principal: ClaimsPrincipal,
  profile: IndependentLiquidationProfile,
  source: IndependentEvidenceSource,
): Promise<IndependentLiquidationVerification> {
  assertClaimsRole(principal, ['claimant', 'reviewer', 'authority', 'system']);
  const c = getClaimsCase(repo, caseId);
  const policy = c && repo.getProcurementPolicy(c.policyId);
  if (
    !c ||
    c.syntheticDemo ||
    !policy ||
    !isSupportedIndependentTerms(policy.terms) ||
    !sameIndependentLiquidationProfile(policy.terms.independentProfile, profile) ||
    !canAccessClaimsPolicy(repo, principal, c.policyId) ||
    !['COLLECTING_EVIDENCE', 'INVESTIGATING', 'REVIEW'].includes(c.status)
  )
    throw new ValidationError('Independent verification unavailable for this claim or profile');
  const incident = c.incidentId && repo.getIncident(c.incidentId);
  const chronology = readClaimChronology(repo, c);
  const raw = JSON.stringify(input);
  if (!raw || Buffer.byteLength(raw) > 16000)
    throw new ValidationError('Invalid independent envelope');
  const previousContext = claimVerificationContext(repo, caseId);
  const record: IndependentLiquidationVerification = {
    id: newId(),
    caseId,
    requestDigest: verificationDigest(raw),
    contextDigest: previousContext,
    actor: claimsActorId(principal),
    createdAt: new Date().toISOString(),
    verifierVersion: INDEPENDENT_LIQUIDATION_VERIFIER,
    fixtureReference: null,
    fixtureDigest: null,
    inputs: JSON.parse(raw),
    facts: [],
    findings: [],
    executionStatus: 'rejected',
    evidenceSufficiency: 'invalid',
    authenticity: 'unverified',
    independentlyAuthenticated: false,
  };
  const envelope = Envelope.safeParse(input);
  const existing = repo
    .listClaimVerifications(caseId)
    .find(
      ({ recordJson }) =>
        (JSON.parse(recordJson) as { requestDigest: string }).requestDigest ===
        record.requestDigest,
    );
  if (existing) {
    const previous = JSON.parse(existing.recordJson) as IndependentLiquidationVerification;
    if (
      previous.contextDigest !== previousContext ||
      (previous.validUntilMs !== undefined && previous.validUntilMs <= Date.now())
    )
      throw new ValidationError('Independent verification is stale; submit a fresh attestation');
    return previous;
  }

  let body: z.infer<typeof Attestation> | undefined;
  if (envelope.success) {
    try {
      const value = Attestation.safeParse(JSON.parse(envelope.data.body));
      if (
        value.success &&
        JSON.stringify(value.data) === envelope.data.body &&
        authentic(
          'replay',
          envelope.data.body,
          profile.replayPublicKey,
          envelope.data.replaySignature,
        ) &&
        authentic(
          'recovery',
          envelope.data.body,
          profile.recoveryPublicKey,
          envelope.data.recoverySignature,
        )
      )
        body = value.data;
    } catch {
      /* Malformed or unauthenticated evidence is not a claim fact. */
    }
  }
  if (!body) {
    record.findings.push('Independent replay and accounting authentication required');
  } else if (
    !incident ||
    !repo.claimsPolicyContext(c.policyId)?.confirmed ||
    !isWithinClaimWindow(chronology, Date.now()) ||
    !chronology.waitingPeriodSatisfied
  ) {
    record.findings.push('Policy, incident, or chronology is ineligible');
  } else {
    const eventRef = `evm:5042002:${body.transactionHash}:${body.logIndex}`;
    if (
      body.caseId !== c.id ||
      body.policyId !== c.policyId ||
      body.exposureId !== c.exposureId ||
      body.incidentId !== incident.id ||
      body.termsHash !== policy.digest ||
      incident.observedEventRef !== eventRef
    ) {
      record.evidenceSufficiency = 'contradictory';
      record.findings.push(
        'Signed evidence does not match the frozen case, terms or event identity',
      );
    } else if (!body.recoveriesResolved) {
      record.evidenceSufficiency = 'missing';
      record.findings.push('Recovery and prior compensation accounting is incomplete');
    } else {
      try {
        const receipt = await source.readLiquidation(
          body.transactionHash as `0x${string}`,
          body.logIndex,
          profile,
        );
        const timestampMs = Number(receipt.blockTimestamp) * 1000;
        const now = Date.now();
        if (
          receipt.blockHash !== body.blockHash ||
          receipt.positionId !== policy.terms.exposure.position ||
          receipt.owner !== policy.terms.owner ||
          timestampMs !== chronology.incident.epochMs
        ) {
          record.evidenceSufficiency = 'contradictory';
          record.findings.push(
            'Canonical receipt contradicts the signed evidence or recorded incident',
          );
        } else if (
          !body.otherCausesExcluded ||
          receipt.adapterRatioBps < 0n ||
          receipt.liquidationThresholdBps <= 0n ||
          receipt.adapterRatioBps >= receipt.liquidationThresholdBps ||
          BigInt(body.canonicalRatioBps) < receipt.liquidationThresholdBps
        ) {
          record.findings.push('Unsupported covered causation or counterfactual');
        } else if (
          body.accountedThroughMs < timestampMs ||
          body.accountedThroughMs > now ||
          body.accountedThroughMs + FRESH_MS <= now
        ) {
          record.findings.push(
            'Recovery accounting cutoff is stale or outside the admissible interval',
          );
        } else if (
          receipt.extinguishedDebtUsdcMicros < 0n ||
          receipt.seizedUsdcMicros <= receipt.extinguishedDebtUsdcMicros ||
          receipt.seizedUsdcMicros > 999_999_999_999_999n
        ) {
          record.findings.push('No supported positive USDC loss');
        } else {
          record.executionStatus = 'completed';
          record.evidenceSufficiency = 'sufficient';
          record.authenticity = 'verified_independent';
          record.independentlyAuthenticated = true;
          record.eventRef = eventRef;
          record.profile = profile;
          record.anchor = {
            number: receipt.blockNumber.toString(),
            hash: receipt.blockHash,
            timestamp: receipt.blockTimestamp.toString(),
          };
          record.manifestDigest = record.requestDigest;
          record.validUntilMs = body.accountedThroughMs + FRESH_MS;
          record.facts = [
            {
              ...record.anchor,
              ...chronology,
              replayDigest: body.replayDigest,
              accountingDigest: body.accountingDigest,
              adapterRatioBps: receipt.adapterRatioBps.toString(),
              liquidationThresholdBps: receipt.liquidationThresholdBps.toString(),
              canonicalRatioBps: body.canonicalRatioBps,
              accountedThroughMs: body.accountedThroughMs,
              seizedUsdcMicros: receipt.seizedUsdcMicros.toString(),
              extinguishedDebtUsdcMicros: receipt.extinguishedDebtUsdcMicros.toString(),
            },
          ];
          record.lossAssessment = {
            grossLossMicros: (
              receipt.seizedUsdcMicros - receipt.extinguishedDebtUsdcMicros
            ).toString(),
            recoveriesMicros: body.recoveriesMicros,
            priorCompensationMicros: body.priorCompensationMicros,
            recoveriesResolved: true,
            asset: 'USDC',
            scale: 6,
            basis:
              'Canonical Arc USDC liquidation receipt, authenticated independent replay and closed recovery accounting',
          };
          record.findings.push(
            'Independent evidence supports the configured liquidation calculation; human coverage determination required',
          );
        }
      } catch {
        record.findings.push('Canonical liquidation read unavailable or unsupported');
      }
    }
  }

  return repo.runInTransaction(() => {
    const current = repo.getClaimsCase(c.id);
    if (
      !current ||
      current.rowVersion !== c.rowVersion ||
      claimVerificationContext(repo, caseId) !== previousContext
    )
      throw new ValidationError('Investigation changed during independent verification');
    if (record.executionStatus === 'completed') {
      if (!record.validUntilMs || record.validUntilMs <= Date.now())
        throw new ValidationError('Independent accounting expired during verification');
      repo.saveEvidenceManifest({
        id: newId(),
        caseId,
        source: 'independent-liquidation',
        chain: 'arc-testnet',
        blockHash: record.anchor!.hash,
        transactionHash: body!.transactionHash,
        provenance: profile.verifier,
        rawEvidenceDigest: record.requestDigest,
        verificationMethod: INDEPENDENT_MANIFEST_METHOD,
        sourceReliability: 'authenticated_independent',
        syntheticFixture: false,
        createdAt: record.createdAt,
      });
      if (
        !repo.updateClaimsCaseOptimistic(
          {
            ...current,
            evidenceAuthenticity: 'verified_independent',
            rowVersion: current.rowVersion + 1,
            updatedAt: record.createdAt,
          },
          current.rowVersion,
        )
      )
        throw new ValidationError('Independent verification case update conflicted');
      record.contextDigest = claimVerificationContext(repo, caseId);
    }
    repo.saveClaimVerification({
      id: record.id,
      caseId,
      requestDigest: record.requestDigest,
      recordJson: JSON.stringify(record),
    });
    repo.insertAudit('claims_case', caseId, 'independent.verification', {
      verificationId: record.id,
      verifier: record.verifierVersion,
      executionStatus: record.executionStatus,
    });
    return record;
  });
}
