import {
  IdempotencyConflictError,
  buildSyntheticTerms,
  createSyntheticCoverageProduct,
  newId,
} from '@arcuex/domain';
import { describe, expect, it } from 'vitest';
import { openDatabase } from './db';
import { InsuranceRepository } from './repository';

describe('InsuranceRepository', () => {
  it('migrates and stores audit + processed events transactionally', () => {
    const db = openDatabase(':memory:');
    const repo = new InsuranceRepository(db);
    const product = createSyntheticCoverageProduct();
    repo.runInTransaction(() => {
      repo.saveProduct(product);
      repo.insertAudit('coverage_product', product.id, 'product.created', { code: product.code });
      expect(repo.tryMarkProcessed('k1', 'test', { a: 1 })).toBe(true);
      expect(repo.tryMarkProcessed('k1', 'test', { a: 1 })).toBe(false);
    });
    expect(repo.getProductByCode(product.code)?.id).toBe(product.id);
    expect(repo.listAudit('coverage_product')).toHaveLength(1);
    expect(() => repo.tryMarkProcessed('k1', 'test', { a: 2 })).toThrow(IdempotencyConflictError);
  });

  it('persists bigint micros as text', () => {
    const repo = new InsuranceRepository(openDatabase(':memory:'));
    const poolId = newId();
    repo.savePool({
      id: poolId,
      name: 't',
      depositedMicros: 123456789012345n,
      outstandingLiabilityMicros: 0n,
      sharesOutstanding: 123456789012345n,
      createdAt: new Date().toISOString(),
    });
    expect(repo.listPools()[0]?.depositedMicros).toBe(123456789012345n);
  });

  it('persists ClaimsCase rows, append-only events, and immutable evidence digests', () => {
    const repo = new InsuranceRepository(openDatabase(':memory:'));
    const policyholderId = newId();
    const agentId = newId();
    const product = createSyntheticCoverageProduct();
    const quoteId = newId();
    const policyId = newId();
    const exposureId = newId();
    const caseId = newId();
    const eventId = newId();
    const manifestId = newId();
    const now = '2026-11-17T17:00:00.000Z';
    const terms = buildSyntheticTerms({
      coverageStartsAt: '2026-11-01T00:00:00.000Z',
      coverageEndsAt: '2026-12-01T00:00:00.000Z',
    });

    repo.saveProduct(product);
    repo.savePolicyholder({ id: policyholderId, displayName: 'Holder', createdAt: now });
    repo.saveAgent({
      id: agentId,
      policyholderId,
      externalRef: 'a1',
      label: 'Agent',
      createdAt: now,
    });
    repo.saveQuote({
      id: quoteId,
      productId: product.id,
      policyholderId,
      agentId,
      status: 'accepted',
      terms,
      idempotencyKey: 'quote-case-fk',
      offeredAt: now,
      expiresAt: '2026-12-01T00:00:00.000Z',
      acceptedAt: now,
      createdAt: now,
    });
    repo.savePolicy({
      id: policyId,
      quoteId,
      productId: product.id,
      policyholderId,
      agentId,
      status: 'active',
      terms,
      fundingVerifiedAt: now,
      boundAt: now,
      activatedAt: now,
      createdAt: now,
    });
    repo.saveExposure({
      id: exposureId,
      policyId,
      exposureKey: 'wallet:0xabc',
      description: 'demo',
      limitMicros: terms.limitMicros,
      createdAt: now,
    });

    const draft = {
      id: caseId,
      schemaVersion: 1,
      status: 'DRAFT',
      policyId,
      exposureId,
      incidentId: null,
      claimId: null,
      claimantRef: 'claimant:demo',
      idempotencyKey: 'case-persist-001',
      syntheticDemo: true,
      evidenceAuthenticity: 'unverified',
      coverageDetermination: 'unknown',
      settlementAuthorization: 'none',
      verifiedLossMicros: null,
      deductibleMicros: 0n,
      priorCompensationMicros: 0n,
      recoveriesMicros: null,
      remainingLimitMicros: terms.limitMicros,
      lossCapMicros: terms.limitMicros,
      payableMicros: null,
      lossKey: null,
      denialReasonCode: null,
      reviewReasonCode: null,
      authorityActor: null,
      settlementPrepId: null,
      payoutTo: '0x2E2Da4311Ea87Cfa31c372D59B4A0d567c15D760',
      evidenceRoot: null,
      adjudicationBindingJson: null,
      rowVersion: 1,
      createdAt: now,
      updatedAt: now,
    };
    repo.saveClaimsCase(draft);
    expect(repo.getClaimsCaseByIdempotencyKey('case-persist-001')?.id).toBe(caseId);

    repo.appendClaimsCaseEvent({
      id: eventId,
      caseId,
      fromStatus: 'DRAFT',
      toStatus: 'SUBMITTED',
      actor: 'claimant:demo',
      reasonCode: 'CASE_SUBMITTED',
      payloadJson: '{}',
      createdAt: now,
    });
    expect(repo.listClaimsCaseEvents(caseId)).toHaveLength(1);

    expect(
      repo.saveEvidenceManifest({
        id: manifestId,
        caseId,
        source: 'fixture',
        chain: 'arc-testnet',
        blockHash: '0xbb',
        transactionHash: '0xaa',
        provenance: 'synthetic-demo',
        rawEvidenceDigest: 'sha256:abc',
        verificationMethod: 'fixture_consistency',
        sourceReliability: 'demo_only',
        syntheticFixture: true,
        createdAt: now,
      }).inserted,
    ).toBe(true);
    expect(
      repo.saveEvidenceManifest({
        id: newId(),
        caseId,
        source: 'fixture',
        chain: 'arc-testnet',
        blockHash: '0xbb',
        transactionHash: '0xaa',
        provenance: 'synthetic-demo',
        rawEvidenceDigest: 'sha256:abc',
        verificationMethod: 'fixture_consistency',
        sourceReliability: 'demo_only',
        syntheticFixture: true,
        createdAt: now,
      }).inserted,
    ).toBe(false);
    expect(repo.listEvidenceManifests(caseId)).toHaveLength(1);
  });

  it('durably dedupes Streams inbox by dedupe_key (replay recovery)', () => {
    const repo = new InsuranceRepository(openDatabase(':memory:'));
    const base = {
      source: 'rpc-backfill',
      eventName: 'ClaimSettled',
      txHash: '0xabc',
      blockNumber: '42',
      logIndex: '1',
      payload: { lossKey: '0x' + '11'.repeat(32) },
      signatureOk: true,
      receivedAt: new Date().toISOString(),
    };
    expect(
      repo.insertStreamsEvent({
        id: newId(),
        dedupeKey: '0xabc:1:ClaimSettled:42',
        ...base,
      }),
    ).toBe(true);
    expect(
      repo.insertStreamsEvent({
        id: newId(),
        dedupeKey: '0xabc:1:ClaimSettled:42',
        ...base,
      }),
    ).toBe(false);
    expect(repo.listStreamsInbox()).toHaveLength(1);
  });
});
