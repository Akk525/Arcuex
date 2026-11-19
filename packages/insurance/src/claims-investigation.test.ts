import { describe, it, expect } from 'vitest';
import { newId, PROCUREMENT_PRODUCT, type ProcurementPolicy } from '@arcuex/domain';
import { openDatabase, InsuranceRepository, ProcurementStore } from '@arcuex/persistence';
import {
  intakeClaimsCase,
  completeEvidenceOrReview,
  adjudicateClaimsCase,
  authorizeSettlementPreparation,
} from './claims-case-service';
import { CLAIM_FIXTURE, verifyClaimFixture, verificationDigest } from './claim-verification';
import {
  appendClaimsInvestigation,
  getClaimsInvestigation,
  beginClaimsExamination,
  claimsDossier,
  finishClaimsExamination,
  failClaimsExamination,
} from './claims-investigation';
const owner = '0x1111111111111111111111111111111111111111',
  beneficiary = '0x2222222222222222222222222222222222222222',
  agentSigner = '0x3333333333333333333333333333333333333333';
const claimant = { role: 'claimant' as const, subject: owner, walletAddress: owner },
  reviewer = { role: 'reviewer' as const, subject: 'human' },
  system = { role: 'system' as const, subject: 'examiner' };
const other = {
  role: 'claimant' as const,
  subject: 'foreign',
  walletAddress: '0x4444444444444444444444444444444444444444',
};
function fixture(
  confirmed = true,
  reconciled = confirmed,
  limitMicros = '1000000',
  delegation: 'owner' | 'verified' | 'missing' = 'owner',
) {
  const db = openDatabase(),
    repo = new InsuranceRepository(db),
    store = new ProcurementStore(db),
    now = Math.floor(Date.now() / 1000),
    policyId = newId(),
    agentId = newId();
  const p: ProcurementPolicy = {
    state: 'prepared',
    payer: delegation === 'owner' ? owner : agentSigner,
    delegationId: delegation === 'owner' ? null : newId(),
    bindTx: null,
    confirmedAt: null,
    digest: `0x${'ab'.repeat(32)}`,
    terms: {
      version: 1,
      policyId,
      quoteId: newId(),
      productCode: PROCUREMENT_PRODUCT.code,
      agentId,
      owner,
      beneficiary,
      exposure: {
        chainId: 5042002,
        protocol: PROCUREMENT_PRODUCT.protocol,
        position: 'synthetic-position',
        notionalMicros: '1000000',
      },
      eligibility: {
        positionHealthy: true,
        noKnownIncident: true,
        syntheticOnly: true,
        ownerAttestsControl: true,
      },
      premiumMicros: '10000',
      limitMicros,
      deductibleMicros: '100000',
      effectiveAt: now - 2000,
      expiresAt: now + 86400,
      quoteExpiresAt: now - 2300,
      insuredEvent: PROCUREMENT_PRODUCT.event,
      exclusions: PROCUREMENT_PRODUCT.exclusions,
      synthetic: true,
    },
  };
  store.insert('agent', agentId, owner, {
    id: agentId,
    owner,
    signer: agentSigner,
    label: 'insured agent',
    exposure: p.terms.exposure,
  });
  if (delegation === 'verified') {
    store.insert('delegation', p.delegationId!, owner, {
      id: p.delegationId,
      owner,
      agentId,
      productCode: p.terms.productCode,
      position: p.terms.exposure.position,
      beneficiary,
      premiumCapMicros: '10000',
      limitCapMicros: limitMicros,
      expiresAt: now + 3600,
    });
    store.insert('acceptance', policyId, agentSigner, {
      at: now - 2500,
      actor: agentSigner,
      digest: p.digest,
    });
    store.insert('revocation', p.delegationId!, owner, { at: now - 42 });
  }
  store.insertPolicy(p);
  if (confirmed) store.confirm(policyId, `0x${'cd'.repeat(32)}`, now - 2400);
  if (reconciled) {
    db.transaction(() => {
      db.prepare(
        "INSERT OR REPLACE INTO policy_reconciliation_scopes(scope,healthy,checked_at) VALUES ('fixture',1,?)",
      ).run(Math.floor(Date.now() / 1000));
      db.prepare(
        "INSERT INTO policy_bind_events VALUES (?, 'fixture', ?, ?, 'VERIFIED_LINKED', 1, '1', 'fixture', '{}')",
      ).run(policyId, policyId, policyId);
    })();
  }
  const input = {
    policyId,
    exposureId: agentId,
    claimantRef: owner,
    idempotencyKey: 'proc-claim-1',
    syntheticDemo: false,
    actor: 'ignored',
    observedEventRef: 'synthetic:oracle:lot-1',
    observedAt: new Date((now - 100) * 1000).toISOString(),
  };
  return { db, repo, store, p, input };
}
function setup(delegation: 'owner' | 'verified' | 'missing' = 'owner') {
  const f = fixture(true, true, '1000000', delegation);
  const agent = {
    role: 'claimant' as const,
    subject: agentSigner,
    walletAddress: agentSigner,
    agentId: f.p.terms.agentId,
  };
  const c = intakeClaimsCase(f.repo, { ...f.input, claimantRef: agentSigner }, agent);
  return { ...f, c, agent };
}
const proof = (requestId: string | null = null, content = CLAIM_FIXTURE.raw) => ({
  action: 'submit_proof',
  requestKey: newId(),
  requestId,
  filename: 'fixture.json',
  content,
  contentHash: verificationDigest(content),
  declaredSource: 'synthetic catalog',
});
async function verify(f: ReturnType<typeof setup>, revision: number) {
  return verifyClaimFixture(
    f.repo,
    f.c.id,
    {
      revision,
      fixtureRef: CLAIM_FIXTURE.reference,
      fixtureDigest: CLAIM_FIXTURE.digest,
      policyId: f.c.policyId,
      incidentId: f.c.incidentId!,
      observedAt: f.repo.getIncident(f.c.incidentId!)!.observedAt,
    },
    f.agent,
  );
}
const decision = (caseId: string, verificationId: string) => ({
  caseId,
  verificationId,
  coverageDetermination: 'covered' as const,
  verifiedLossMicros: 1500000n,
  recoveriesMicros: 0n,
  requestedMicros: 1000000n,
  contractualReview: {
    eventApplies: true,
    exclusionsResolved: true,
    rationale: 'Human assessed synthetic contractual conditions and recoveries.',
  },
});
function report(f: ReturnType<typeof setup>) {
  const request = appendClaimsInvestigation(
    f.repo,
    f.c.id,
    { action: 'request_examiner', requestKey: newId() },
    f.agent,
  );
  const started = beginClaimsExamination(f.repo, f.c.id, request.id, system);
  return {
    requestId: request.id,
    dossierDigest: started.digest,
    provider: 'openai' as const,
    model: 'test-model',
    responseId: newId(),
    execution: 'test_double' as const,
    analysis: {
      summary: 'Actual dossier read',
      verifiedFindings: [],
      claimantAssertions: [],
      gaps: started.dossier.reviewBlockers,
      proposedRequests: [{ question: 'Supply the canonical replay artifact', citations: [f.c.id] }],
      recommendation: 'request_proof' as const,
      citations: [f.c.id],
    },
    usage: { inputTokens: 20, outputTokens: 20 },
  };
}
describe('same-claim insured agent, examiner and human investigation', () => {
  it('grounds agent authority in authenticated intake and distinguishes historical, missing and owner procurement', () => {
    for (const [mode, status] of [
      ['owner', 'owner_procured_no_delegation'],
      ['verified', 'verified_at_policy_acceptance'],
      ['missing', 'unresolved'],
    ] as const) {
      const f = setup(mode);
      const { dossier } = claimsDossier(f.repo, f.c.id, system);
      expect(dossier.authority.claimant).toMatchObject({
        basis: 'authenticated_policy_agent',
        agentId: f.agent.agentId,
        evidenceSubmission: 'authorized_for_this_claim_while_open',
      });
      expect(dossier.incidentPolicyLink.recorded).toBe(true);
      expect(
        dossier.timeline.some(
          (event: { id: string }) => event.id === dossier.authority.claimant.intakeEventId,
        ),
      ).toBe(true);
      expect(dossier.authority.policyDelegation.status).toBe(status);
      expect(dossier.authority.requiresHumanReview).toBe(mode === 'missing');
      if (mode === 'verified')
        expect(dossier.authority.policyDelegation.revokedAt).toBeTypeOf('number');
      if (mode === 'missing')
        expect(dossier.authorityReview).toEqual(['CLAIMANT_OR_DELEGATION_AUTHORITY_UNRESOLVED']);
      f.db.close();
    }
  });

  it('rejects unlinked or invisible proposal citations and preserves the human-adopted reference', () => {
    const f = setup();
    const ai = report(f);
    for (const citations of [[], [ai.requestId]]) {
      expect(() =>
        finishClaimsExamination(
          f.repo,
          f.c.id,
          {
            ...ai,
            analysis: {
              ...ai.analysis,
              proposedRequests: [{ question: 'Support the claim', citations }],
            },
          },
          system,
        ),
      ).toThrow();
    }
    const result = finishClaimsExamination(f.repo, f.c.id, ai, system);
    const adopt = {
      action: 'adopt_examiner_request',
      requestKey: newId(),
      reportId: result.id,
      proposalIndex: 0,
    };
    expect(() => appendClaimsInvestigation(f.repo, f.c.id, adopt, f.agent)).toThrow('role');
    const request = appendClaimsInvestigation(f.repo, f.c.id, adopt, reviewer);
    expect(JSON.parse(request.payloadJson)).toMatchObject({
      reportId: result.id,
      citations: [f.c.id],
    });
    expect(appendClaimsInvestigation(f.repo, f.c.id, adopt, reviewer).id).toBe(request.id);
    expect(() =>
      appendClaimsInvestigation(f.repo, f.c.id, { ...adopt, requestKey: newId() }, reviewer),
    ).toThrow('stale');
    f.db.close();
  });

  it('iterates immutable proof, stales verifier/AI context, resolves requests and approves only via human gates', async () => {
    const f = setup();
    appendClaimsInvestigation(f.repo, f.c.id, proof(), f.agent);
    completeEvidenceOrReview(f.repo, { caseId: f.c.id, evidenceComplete: true }, f.agent);
    const v1 = await verify(f, 1),
      ai = report(f);
    finishClaimsExamination(f.repo, f.c.id, ai, system);
    expect(
      getClaimsInvestigation(f.repo, f.c.id, f.agent).entries.find(
        (e) => e.kind === 'examiner_report',
      )?.stale,
    ).toBe(false);
    const request = appendClaimsInvestigation(
      f.repo,
      f.c.id,
      {
        action: 'request_proof',
        requestKey: newId(),
        text: 'Provide replay artifact for policy/incident',
      },
      reviewer,
    );
    const response = appendClaimsInvestigation(f.repo, f.c.id, proof(request.id), f.agent);
    const meta = JSON.parse(response.payloadJson);
    expect(meta.submitter.agentId).toBe(f.agent.agentId);
    expect(meta.contentHash).toBe(CLAIM_FIXTURE.digest);
    expect(meta.verificationStatus).toBe('unverified');
    expect(adjudicateClaimsCase(f.repo, decision(f.c.id, v1.id), reviewer).reviewReasonCode).toBe(
      'OUTSTANDING_EVIDENCE_REQUESTS',
    );
    appendClaimsInvestigation(
      f.repo,
      f.c.id,
      {
        action: 'resolve_request',
        requestKey: newId(),
        requestId: request.id,
        submissionId: response.id,
        resolution: 'accepted',
        text: 'Human reviewed submitted synthetic bytes',
      },
      reviewer,
    );
    expect(adjudicateClaimsCase(f.repo, decision(f.c.id, v1.id), reviewer).reviewReasonCode).toBe(
      'STALE_VERIFICATION_CONTEXT',
    );
    const v2 = await verify(f, 2),
      ai2 = report(f);
    finishClaimsExamination(f.repo, f.c.id, ai2, system);
    const view = getClaimsInvestigation(f.repo, f.c.id, claimant);
    expect(view.entries.filter((e) => e.kind === 'examiner_report')).toHaveLength(2);
    expect(view.entries.filter((e) => e.kind === 'examiner_report')[0].stale).toBe(true);
    expect(() => adjudicateClaimsCase(f.repo, decision(f.c.id, v2.id), f.agent)).toThrow('role');
    const approved = adjudicateClaimsCase(f.repo, decision(f.c.id, v2.id), reviewer);
    expect(approved.status).toBe('APPROVED');
    expect(approved.settlementAuthorization).toBe('pending_authority');
    expect(() =>
      authorizeSettlementPreparation(
        f.repo,
        {
          caseId: f.c.id,
          confirmedRecipient: approved.payoutTo!,
          confirmedAmountMicros: approved.payableMicros!,
          confirmedEvidenceRoot: approved.evidenceRoot!,
          confirmedLossKey: approved.lossKey!,
          settlementPrepId: 'blocked',
        },
        { role: 'authority', subject: 'authority' },
      ),
    ).toThrow('Synthetic/fixture');
    expect(() => appendClaimsInvestigation(f.repo, f.c.id, proof(), f.agent)).toThrow('closed');
    expect(f.db.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
    expect(f.db.pragma('foreign_key_check')).toEqual([]);
    f.db.close();
  });
  it('rejects foreign ownership, unrelated agents, actor/status spoofing, bad hashes and cross-claim requests atomically', () => {
    const f = setup(),
      before = f.repo.listInvestigationEntries(f.c.id);
    for (const p of [
      other,
      { ...f.agent, agentId: newId() },
      { ...f.agent, walletAddress: other.walletAddress },
    ])
      expect(() => appendClaimsInvestigation(f.repo, f.c.id, proof(), p)).toThrow();
    expect(() => getClaimsInvestigation(f.repo, f.c.id, other)).toThrow();
    expect(() =>
      appendClaimsInvestigation(
        f.repo,
        f.c.id,
        { ...proof(), actor: 'reviewer', verificationStatus: 'verified_independent' },
        f.agent,
      ),
    ).toThrow();
    expect(() =>
      appendClaimsInvestigation(
        f.repo,
        f.c.id,
        { ...proof(), contentHash: 'sha256:' + '0'.repeat(64) },
        f.agent,
      ),
    ).toThrow('hash');
    expect(() => appendClaimsInvestigation(f.repo, f.c.id, proof(newId()), f.agent)).toThrow(
      'request',
    );
    const second = intakeClaimsCase(
      f.repo,
      { ...f.input, idempotencyKey: newId(), observedEventRef: 'synthetic:another-claim' },
      f.agent,
    );
    const otherRequest = appendClaimsInvestigation(
      f.repo,
      second.id,
      { action: 'request_proof', requestKey: newId(), text: 'Proof for the other claim' },
      reviewer,
    );
    expect(() =>
      appendClaimsInvestigation(f.repo, f.c.id, proof(otherRequest.id), f.agent),
    ).toThrow('request');
    for (const action of ['request_proof', 'escalate'])
      expect(() =>
        appendClaimsInvestigation(
          f.repo,
          f.c.id,
          { action, requestKey: newId(), text: 'spoof reviewer' },
          f.agent,
        ),
      ).toThrow('role');
    expect(f.repo.listInvestigationEntries(f.c.id)).toEqual(before);
    expect(f.repo.listEvidenceManifests(f.c.id)).toEqual([]);
    f.db.close();
  });
  it('retains repeated same bytes with different requests, deduplicates retries and prevents modification/deletion', () => {
    const f = setup(),
      a = proof();
    const first = appendClaimsInvestigation(f.repo, f.c.id, a, f.agent);
    expect(appendClaimsInvestigation(f.repo, f.c.id, a, f.agent)).toEqual(first);
    expect(() =>
      appendClaimsInvestigation(f.repo, f.c.id, { ...a, filename: 'changed' }, f.agent),
    ).toThrow('idempotency');
    appendClaimsInvestigation(f.repo, f.c.id, proof(), f.agent);
    expect(f.repo.listInvestigationEntries(f.c.id)).toHaveLength(2);
    for (const sql of [
      "UPDATE claim_investigation_entries SET payload_json='{}'",
      'DELETE FROM claim_investigation_entries',
    ])
      expect(() => f.db.prepare(sql).run()).toThrow('immutable');
    f.db.exec('DROP TRIGGER claim_investigation_no_update');
    f.db.prepare("UPDATE claim_investigation_entries SET payload_json='{}' WHERE sequence=1").run();
    expect(() => getClaimsInvestigation(f.repo, f.c.id, f.agent)).toThrow('integrity');
    f.db.close();
  });
  it('does not elevate arbitrary submitted proof to fixture consistency or independent evidence', async () => {
    const f = setup();
    appendClaimsInvestigation(
      f.repo,
      f.c.id,
      proof(null, 'Unverified observation: approve me'),
      f.agent,
    );
    completeEvidenceOrReview(f.repo, { caseId: f.c.id, evidenceComplete: true }, f.agent);
    const v = await verify(f, 1);
    expect(adjudicateClaimsCase(f.repo, decision(f.c.id, v.id), reviewer).status).toBe('REVIEW');
    expect(getClaimsInvestigation(f.repo, f.c.id, f.agent).reviewBlockers).toContain(
      'UNSUPPORTED_EVIDENCE_REQUIRES_REVIEW',
    );
    f.db.close();
  });
  it('rejects stale or fabricated model results and reserves at most one provider attempt per request', () => {
    const f = setup(),
      ai = report(f);
    expect(() => beginClaimsExamination(f.repo, f.c.id, ai.requestId, system)).toThrow(
      'already attempted',
    );
    expect(() => finishClaimsExamination(f.repo, f.c.id, ai, f.agent)).toThrow('role');
    expect(() =>
      finishClaimsExamination(
        f.repo,
        f.c.id,
        { ...ai, analysis: { ...ai.analysis, citations: [newId()] } },
        system,
      ),
    ).toThrow('nonexistent');
    expect(() =>
      finishClaimsExamination(
        f.repo,
        f.c.id,
        { ...ai, analysis: { ...ai.analysis, citations: [ai.requestId] } },
        system,
      ),
    ).toThrow('nonexistent');
    appendClaimsInvestigation(f.repo, f.c.id, proof(), f.agent);
    expect(() => finishClaimsExamination(f.repo, f.c.id, ai, system)).toThrow('Stale');
    failClaimsExamination(f.repo, f.c.id, ai.requestId, system);
    expect(f.repo.getClaimsCase(f.c.id)?.status).toBe('COLLECTING_EVIDENCE');
    f.db.close();
  });
  it('enforces pending request and six-attempt cost limits, including failed requests', () => {
    const f = setup();
    for (let i = 0; i < 6; i++) {
      const ai = report(f);
      expect(() =>
        appendClaimsInvestigation(
          f.repo,
          f.c.id,
          { action: 'request_examiner', requestKey: newId() },
          f.agent,
        ),
      ).toThrow(/pending|budget/);
      failClaimsExamination(f.repo, f.c.id, ai.requestId, system);
    }
    expect(() =>
      appendClaimsInvestigation(
        f.repo,
        f.c.id,
        { action: 'request_examiner', requestKey: newId() },
        f.agent,
      ),
    ).toThrow('budget');
    f.db.close();
  });
});

it('lets humans escalate to REVIEW, close a stalled examiner attempt and request reassessment without granting payment authority', () => {
  const f = setup(),
    ai = report(f);
  expect(() =>
    appendClaimsInvestigation(
      f.repo,
      f.c.id,
      { action: 'cancel_examiner', requestKey: newId(), requestId: ai.requestId, text: 'stalled' },
      f.agent,
    ),
  ).toThrow('role');
  appendClaimsInvestigation(
    f.repo,
    f.c.id,
    {
      action: 'cancel_examiner',
      requestKey: newId(),
      requestId: ai.requestId,
      text: 'Human closed stalled worker attempt',
    },
    reviewer,
  );
  expect(() => finishClaimsExamination(f.repo, f.c.id, ai, system)).toThrow('completed');
  appendClaimsInvestigation(
    f.repo,
    f.c.id,
    { action: 'escalate', requestKey: newId(), text: 'Need senior contractual review' },
    reviewer,
  );
  expect(f.repo.getClaimsCase(f.c.id)?.status).toBe('REVIEW');
  expect(f.repo.getClaimsCase(f.c.id)?.settlementAuthorization).toBe('none');
  expect(() => report(f)).not.toThrow();
  f.db.close();
});
