import { generateKeyPairSync, sign } from 'node:crypto';
import { bankDisputeProductTemplate } from '@arcuex/domain';
import {
  BankObservationSchema,
  observationSigningBytes,
  type BankObservation,
  type BankCaseSubmission,
  type SignedBankObservation,
  type SyntheticEvidenceSource,
  type LossCategory,
} from './bank-dispute-evidence';

/** Ephemeral fixture attestors; private keys never leave this closure or reach disk. Not wallet signers. */
export function createSyntheticBankAttestors() {
  const audit = generateKeyPairSync('ed25519'),
    finance = generateKeyPairSync('ed25519');
  const pairs = new Map([
    ['synthetic-bank-audit', audit],
    ['synthetic-finance', finance],
  ]);
  const trustedSources: SyntheticEvidenceSource[] = [...pairs].map(([id, pair]) => ({
    id,
    publicKeyPem: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    syntheticOnly: true,
    permittedKinds:
      id === 'synthetic-bank-audit' ? ['recommendation', 'final_decision'] : ['loss_assessment'],
  }));
  return {
    trustedSources,
    attest(input: BankObservation): SignedBankObservation {
      const observation = BankObservationSchema.parse(input),
        pair = pairs.get(observation.sourceId);
      if (!pair) throw new Error('Unknown synthetic source');
      return {
        observation,
        signature: sign(null, observationSigningBytes(observation), pair.privateKey).toString(
          'base64',
        ),
      };
    },
  };
}

export function syntheticBankDisputeFixture(caseCount = 1800, humanOverrides = 1350) {
  if (
    !Number.isSafeInteger(caseCount) ||
    caseCount < 1 ||
    caseCount > 5000 ||
    !Number.isSafeInteger(humanOverrides) ||
    humanOverrides < 0 ||
    humanOverrides > caseCount
  )
    throw new Error('Invalid synthetic fixture dimensions');
  const attestors = createSyntheticBankAttestors();
  const template = bankDisputeProductTemplate(),
    claims: BankCaseSubmission[] = [],
    observations: SignedBankObservation[] = [];
  for (let i = 0; i < caseCount; i++) {
    const caseId = `dispute-${String(i + 1).padStart(5, '0')}`,
      override = i < humanOverrides;
    claims.push({ caseId, assertedCause: 'ai_only' });
    const rec: BankObservation = {
      kind: 'recommendation',
      eventId: `${caseId}-recommendation`,
      caseId,
      sourceId: 'synthetic-bank-audit',
      decision: override ? 'approve' : 'deny',
      actingPrincipal: { id: 'dispute-agent', kind: 'ai' },
      modelVersion: 'synthetic-model-v1',
      occurredAt: '2026-11-01T12:00:00.000Z',
      recordedAt: '2026-11-01T12:00:01.000Z',
    };
    observations.push(
      attestors.attest(rec),
      attestors.attest({
        kind: 'final_decision',
        eventId: `${caseId}-decision`,
        caseId,
        sourceId: 'synthetic-bank-audit',
        recommendationEventId: rec.eventId,
        decision: 'deny',
        actingPrincipal: override
          ? { id: `analyst-${(i % 20) + 1}`, kind: 'human' }
          : rec.actingPrincipal,
        modelVersion: rec.modelVersion,
        occurredAt: '2026-11-01T12:01:00.000Z',
        recordedAt: '2026-11-01T12:01:01.000Z',
      }),
    );
    const amounts: Record<LossCategory, number> = {
      compensation: 10000 + i * 100,
      expenses: 200 + i * 3,
      recoveries: (i % 4) * 25,
      regulatory_fines: 500 + i,
    };
    for (const category of [
      'compensation',
      'expenses',
      'recoveries',
      'regulatory_fines',
    ] as const) {
      observations.push(
        attestors.attest({
          kind: 'loss_assessment',
          eventId: `${caseId}-${category}`,
          caseId,
          sourceId: 'synthetic-finance',
          category,
          amount: {
            units: String(amounts[category]),
            asset: { kind: 'currency', code: 'USD', scale: 2 },
          },
          basis: category === 'regulatory_fines' ? 'claimed_only' : 'synthetic_assessed',
          supportingEvidenceRefs: [`synthetic-document:${caseId}:${category}`],
          occurredAt: '2026-11-02T12:00:00.000Z',
          recordedAt: '2026-11-02T12:00:01.000Z',
        }),
      );
    }
  }
  return { template, claims, observations, trustedSources: attestors.trustedSources };
}
