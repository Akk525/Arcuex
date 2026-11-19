import { generateKeyPairSync, randomUUID, sign, type KeyObject } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  keccak256,
  parseAbi,
  type PublicClient,
} from 'viem';
import {
  INDEPENDENT_LIQUIDATION_PRODUCT,
  INDEPENDENT_LIQUIDATION_VERIFIER,
  type IndependentLiquidationProfile,
} from '@arcuex/domain';
import { ARC_USDC_ERC20_ADDRESS } from '@arcuex/chain';
import { ProcurementService } from '@arcuex/agent-sdk';
import { InsuranceRepository, openDatabase, ProcurementStore } from '@arcuex/persistence';
import { insurancePoolAbi, toPolicyIdBytes32, toClaimIdBytes32 } from '@arcuex/onchain';
import {
  CLAIM_FIXTURE,
  adjudicateClaimsCase,
  attachEvidenceManifest,
  authorizeSettlementPreparation,
  completeEvidenceOrReview,
  independentAttestationMessage,
  intakeClaimsCase,
  verifyClaimFixture,
  verifyIndependentLiquidation,
} from '@arcuex/insurance';
import { procurementPool } from './procurement-chain';
import { reconcilePolicyBinds } from './policy-reconciliation';
import { independentLiquidationSource } from './independent-liquidation-chain';
import {
  configuredIndependentLiquidation,
  recheckIndependentEvidence,
} from './independent-evidence';
import { prepareClaimsTransaction } from './claims-chain';
import { POST as verifyHttp } from '@/app/api/claims/cases/[id]/verification/route';
import { POST as mutateHttp } from '@/app/api/claims/cases/[id]/route';

const testClient = vi.hoisted(() => vi.fn());
vi.mock(import('./procurement-chain'), async (importOriginal) => ({
  ...(await importOriginal()),
  procurementClient: testClient,
}));

const owner = `0x${'11'.repeat(20)}` as const;
const authority = `0x${'22'.repeat(20)}` as const;
const liquidator = `0x${'33'.repeat(20)}` as const;
const signer = `0x${'44'.repeat(20)}` as const;
const emitter = `0x${'55'.repeat(20)}` as const;
const hash = `0x${'ab'.repeat(32)}` as const;
const bindHash = `0x${'ac'.repeat(32)}` as const;
const transactionHash = `0x${'cd'.repeat(32)}` as const;
const position = `0x${'ef'.repeat(32)}` as const;
const bindTx = `0x${'ad'.repeat(32)}` as const;
const code = '0x6000';
const eventRef = `evm:5042002:${transactionHash}:10`;
const claimant = { role: 'claimant' as const, subject: signer, walletAddress: signer };
const reviewer = { role: 'reviewer' as const, subject: 'test-reviewer' };
const operator = { role: 'authority' as const, subject: 'test-operator' };
const liquidationAbi = parseAbi([
  'event CoveredLiquidation(bytes32 indexed positionId, address indexed owner, address indexed liquidator, address asset, uint256 seizedUsdcMicros, uint256 extinguishedDebtUsdcMicros, uint256 adapterRatioBps, uint256 liquidationThresholdBps)',
]);
const tokenAbi = parseAbi([
  'event Transfer(address indexed from,address indexed to,uint256 value)',
]);
const publicHex = (key: KeyObject) =>
  key.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
const databases: ReturnType<typeof openDatabase>[] = [];
afterEach(() => {
  databases.splice(0).forEach((db) => db.close());
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function setup() {
  const replay = generateKeyPairSync('ed25519');
  const recovery = generateKeyPairSync('ed25519');
  const profile: IndependentLiquidationProfile = {
    verifier: INDEPENDENT_LIQUIDATION_VERIFIER,
    emitter,
    runtimeCodeHash: keccak256(code),
    replayPublicKey: publicHex(replay.publicKey),
    recoveryPublicKey: publicHex(recovery.publicKey),
  };
  vi.stubEnv('ARCUEX_INDEPENDENT_LIQUIDATION_PROFILE', JSON.stringify(profile));
  const db = openDatabase();
  databases.push(db);
  const repo = new InsuranceRepository(db);
  const store = new ProcurementStore(db);
  const at = Math.floor(Date.now() / 1000);
  const svc = new ProcurementService(
    store,
    procurementPool,
    ARC_USDC_ERC20_ADDRESS,
    () => at - 3600,
    profile,
  );
  const agent = svc.register(owner, {
    idempotencyKey: randomUUID(),
    signer,
    label: 'independent mock position',
    protocol: INDEPENDENT_LIQUIDATION_PRODUCT.protocol,
    position,
    ownerAttestsControl: true,
    exposureMicros: '2000000',
  });
  const quote = svc.quote(owner, {
    idempotencyKey: randomUUID(),
    agentId: agent.id,
    limitMicros: '1000000',
    durationDays: 7,
    eligibility: {
      positionHealthy: true,
      noKnownIncident: true,
      syntheticOnly: false,
      ownerAttestsControl: true,
    },
  });
  const { policy } = svc.prepare(owner, {
    quoteId: quote.terms.quoteId,
    acceptedDigest: quote.digest,
  });
  const t = policy.terms;
  const args = {
    policyId: toPolicyIdBytes32(t.policyId),
    termsHash: policy.digest,
    beneficiary: owner,
    premiumPayer: owner,
    premium: 10000n,
    limit: 1000000n,
    coverageStart: BigInt(t.effectiveAt),
    coverageEnd: BigInt(t.expiresAt),
  };
  const policyRow = [
    policy.digest,
    owner,
    owner,
    args.limit,
    args.premium,
    args.coverageStart,
    args.coverageEnd,
    args.limit,
    0n,
    true,
    false,
  ];
  const bindLog = {
    address: procurementPool,
    removed: false,
    blockNumber: 10n,
    blockHash: bindHash,
    transactionHash: bindTx,
    logIndex: 0,
    transactionIndex: 0,
    topics: encodeEventTopics({ abi: insurancePoolAbi, eventName: 'PolicyBound', args }),
    data: encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'uint64' },
        { type: 'uint64' },
      ],
      [args.termsHash, args.premium, args.limit, args.coverageStart, args.coverageEnd],
    ),
  };
  const occurred = BigInt(at - 60);
  const baseLog = { removed: false, blockHash: hash, blockNumber: 20n, transactionHash };
  const liquidation = {
    ...baseLog,
    address: emitter,
    logIndex: 10,
    topics: encodeEventTopics({
      abi: liquidationAbi,
      eventName: 'CoveredLiquidation',
      args: { positionId: position, owner, liquidator },
    }),
    data: encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'uint256' },
      ],
      [ARC_USDC_ERC20_ADDRESS, 2_000_000n, 500_000n, 100n, 150n],
    ),
  };
  const transfer = {
    ...baseLog,
    address: ARC_USDC_ERC20_ADDRESS,
    logIndex: 11,
    topics: encodeEventTopics({
      abi: tokenAbi,
      eventName: 'Transfer',
      args: { from: emitter, to: liquidator },
    }),
    data: encodeAbiParameters([{ type: 'uint256' }], [2_000_000n]),
  };
  const reads = {
    getChainId: vi.fn(async () => 5042002),
    getBlockNumber: vi.fn(async () => 25n),
    getBlock: vi.fn(async ({ blockNumber }: { blockNumber?: bigint } = {}) =>
      blockNumber === 10n
        ? { hash: bindHash, timestamp: BigInt(at - 3500) }
        : blockNumber === 20n
          ? { hash, timestamp: occurred }
          : { hash, timestamp: BigInt(at) },
    ),
    getCode: vi.fn(async () => code),
    getLogs: vi.fn(async () => [bindLog]),
    getTransactionReceipt: vi.fn(async () => ({
      status: 'success',
      transactionHash,
      blockNumber: 20n,
      blockHash: hash,
      to: emitter,
      logs: [liquidation, transfer],
    })),
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      if (functionName === 'policies') return policyRow;
      if (functionName === 'claimsAuthority') return authority;
      if (functionName === 'losses') return [hash, 0n, 0n, false];
      throw new Error('Unexpected contract read');
    }),
  };
  const client = reads as unknown as PublicClient;
  testClient.mockReturnValue(client);
  expect(store.claimsEligible(t.policyId)).toBe(false);
  await reconcilePolicyBinds(db, 10n, 10n, client as Parameters<typeof reconcilePolicyBinds>[3]);
  expect(store.claimsEligible(t.policyId)).toBe(true);
  const agentPrincipal = { ...claimant, agentId: agent.id };
  const intake = {
    policyId: t.policyId,
    exposureId: agent.id,
    claimantRef: signer,
    syntheticDemo: false,
    actor: 'ignored',
    observedEventRef: eventRef,
    observedAt: new Date(Number(occurred) * 1000).toISOString(),
  };
  const open = () =>
    intakeClaimsCase(repo, { ...intake, idempotencyKey: randomUUID() }, agentPrincipal);
  const claim = open();
  function envelope(caseRow = claim, patch: Record<string, unknown> = {}) {
    const body = JSON.stringify({
      verifier: profile.verifier,
      chainId: 5042002,
      caseId: caseRow.id,
      policyId: t.policyId,
      exposureId: agent.id,
      incidentId: caseRow.incidentId,
      termsHash: policy.digest,
      transactionHash,
      logIndex: 10,
      blockHash: hash,
      replayDigest: `0x${'60'.repeat(32)}`,
      canonicalRatioBps: 200,
      otherCausesExcluded: true,
      accountingDigest: `0x${'70'.repeat(32)}`,
      recoveriesResolved: true,
      recoveriesMicros: '100000',
      priorCompensationMicros: '50000',
      accountedThroughMs: Date.now() - 1000,
      ...patch,
    });
    return {
      body,
      replaySignature: sign(
        null,
        independentAttestationMessage('replay', body),
        replay.privateKey,
      ).toString('hex'),
      recoverySignature: sign(
        null,
        independentAttestationMessage('recovery', body),
        recovery.privateKey,
      ).toString('hex'),
    };
  }
  const verify = (input: unknown = envelope(), caseRow = claim) =>
    verifyIndependentLiquidation(
      repo,
      caseRow.id,
      input,
      agentPrincipal,
      profile,
      independentLiquidationSource(client),
    );
  const approve = (verificationId: string, caseRow = claim) =>
    adjudicateClaimsCase(
      repo,
      {
        caseId: caseRow.id,
        verificationId,
        coverageDetermination: 'covered',
        contractualReview: {
          eventApplies: true,
          exclusionsResolved: true,
          rationale: 'Reviewed authenticated independent sources and policy exclusions.',
        },
        verifiedLossMicros: 1_500_000n,
        recoveriesMicros: 100_000n,
        priorCompensationMicros: 50_000n,
        requestedMicros: 1_000_000n,
      },
      reviewer,
    );
  const complete = (caseRow = claim) =>
    completeEvidenceOrReview(repo, { caseId: caseRow.id, evidenceComplete: true }, agentPrincipal);
  return {
    db,
    repo,
    claim,
    profile,
    reads,
    client,
    verify,
    envelope,
    approve,
    complete,
    open,
    svc,
    intake,
    agentPrincipal,
  };
}

describe('independent liquidation pilot with no live chain writes', () => {
  it('requires explicit enrollment and leaves fixture deployment scope closed', async () => {
    const f = await setup();
    const disabled = new ProcurementService(f.svc.store, procurementPool, ARC_USDC_ERC20_ADDRESS);
    expect(() =>
      disabled.register(owner, {
        idempotencyKey: randomUUID(),
        protocol: INDEPENDENT_LIQUIDATION_PRODUCT.protocol,
        position,
        signer,
        label: 'disabled',
        ownerAttestsControl: true,
        exposureMicros: '1000000',
      }),
    ).toThrow('provisioned');
    expect(() =>
      f.svc.delegate(owner, { idempotencyKey: randomUUID(), agentId: f.claim.exposureId }),
    ).toThrow('owner-purchased');
    expect(configuredIndependentLiquidation()).toEqual(f.profile);
    const id = 'candidate-12345678-1234-4234-8234-123456789abc';
    for (const [key, value] of Object.entries({
      ARCUEX_CHAIN_SOURCE: 'fixture',
      ARCUEX_FIXTURE_ID: id,
      ARCUEX_FIXTURE_DIGEST: 'a'.repeat(64),
      ARCUEX_STORAGE_ID: id,
      ARCUEX_SESSION_EPOCH: id,
      ARCUEX_DATA_DIR: '/tmp/candidate-independent',
      ARCUE_X_SQLITE_PATH: `/tmp/candidate-independent/${id}.sqlite`,
    }))
      vi.stubEnv(key, value);
    expect(configuredIndependentLiquidation()).toBeUndefined();
  });
  it('binds the same independent record through adjudication and unsigned settlement preparation', async () => {
    const f = await setup();
    expect(f.claim.syntheticDemo).toBe(false);
    await expect(verifyClaimFixture(f.repo, f.claim.id, CLAIM_FIXTURE, reviewer)).rejects.toThrow(
      'Synthetic fixture',
    );
    expect(() =>
      attachEvidenceManifest(
        f.repo,
        {
          caseId: f.claim.id,
          source: 'caller',
          provenance: 'claim',
          rawEvidence: 'asserted',
          verificationMethod: 'independent_chain_verify',
          sourceReliability: 'asserted',
          syntheticFixture: false,
        },
        reviewer,
      ),
    ).toThrow('authenticated verifier');
    const v = await f.verify();
    expect(v).toMatchObject({
      executionStatus: 'completed',
      evidenceSufficiency: 'sufficient',
      authenticity: 'verified_independent',
      independentlyAuthenticated: true,
      eventRef,
      lossAssessment: {
        grossLossMicros: '1500000',
        recoveriesMicros: '100000',
        priorCompensationMicros: '50000',
      },
    });
    expect(f.repo.listEvidenceManifests(f.claim.id)).toHaveLength(1);
    f.complete();
    await recheckIndependentEvidence(f.repo, f.claim, v.id, f.client);
    const approved = f.approve(v.id);
    expect(approved.status).toBe('APPROVED');
    expect(approved.payableMicros).toBe(1_000_000n);
    expect(JSON.parse(approved.adjudicationBindingJson!)).toMatchObject({
      verificationId: v.id,
      verificationContextDigest: v.contextDigest,
      netCoveredLossMicros: '1250000',
    });
    await recheckIndependentEvidence(f.repo, approved, v.id, f.client);
    const unsigned = await prepareClaimsTransaction(approved, f.client);
    expect(unsigned.account).toBe(authority);
    expect(decodeFunctionData({ abi: insurancePoolAbi, data: unsigned.data })).toMatchObject({
      functionName: 'settleClaim',
      args: [
        toPolicyIdBytes32(approved.policyId),
        toClaimIdBytes32(approved.id),
        approved.lossKey,
        1_000_000n,
        1_000_000n,
        owner,
      ],
    });
    const prep = {
      caseId: approved.id,
      confirmedRecipient: owner,
      confirmedAmountMicros: 1_000_000n,
      confirmedLossKey: approved.lossKey!,
      confirmedEvidenceRoot: approved.evidenceRoot!,
      settlementPrepId: 'unsigned-offline',
    };
    expect(() => authorizeSettlementPreparation(f.repo, prep, reviewer)).toThrow('requires role');
    const settled = authorizeSettlementPreparation(f.repo, prep, operator);
    expect(settled.status).toBe('SETTLEMENT_PENDING');
    expect(f.repo.listClaimsCaseEvents(approved.id).at(-1)?.reasonCode).toBe('SETTLEMENT_PREPARED');
    expect(f.repo.listClaimsCases(50, 'PAID')).toEqual([]);
  });
  it('dispatches independent verification and human approval through the secured API', async () => {
    const f = await setup();
    const staffToken = '23'.repeat(32);
    vi.stubEnv('CLAIMS_REVIEWER_API_TOKEN', staffToken);
    const globals = globalThis as typeof globalThis & {
      __arcuexDb?: typeof f.db;
      __arcuexRepo?: InsuranceRepository;
    };
    const previousDb = globals.__arcuexDb;
    const previousRepo = globals.__arcuexRepo;
    globals.__arcuexDb = f.db;
    globals.__arcuexRepo = f.repo;
    try {
      const path = `http://localhost:3000/api/claims/cases/${f.claim.id}`;
      const ctx = { params: Promise.resolve({ id: f.claim.id }) };
      const post = (suffix: string, input: unknown, token?: string) =>
        new Request(path + suffix, {
          method: 'POST',
          headers: {
            origin: 'http://localhost:3000',
            'content-type': 'application/json',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(input),
        });
      expect((await verifyHttp(post('/verification', f.envelope()), ctx)).status).toBe(401);
      const response = await verifyHttp(post('/verification', f.envelope(), staffToken), ctx);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({
        dataClass: 'independent_liquidation_verification',
        verification: { authenticity: 'verified_independent', executionStatus: 'completed' },
      });
      f.complete();
      const request = {
        action: 'adjudicate',
        coverageDetermination: 'covered',
        verificationId: body.verification.id,
        contractualReview: {
          eventApplies: true,
          exclusionsResolved: true,
          rationale: 'Checked both sources',
        },
        requestedUsdc: '1',
        verifiedLossUsdc: '1.5',
        recoveriesUsdc: '0.1',
        priorCompensationUsdc: '0.05',
      };
      f.reads.getBlock.mockResolvedValueOnce({ hash: bindHash, timestamp: 1n });
      expect((await mutateHttp(post('', request, staffToken), ctx)).status).toBe(409);
      const approval = await mutateHttp(post('', request, staffToken), ctx);
      expect(approval.status).toBe(200);
      expect(await approval.json()).toMatchObject({ case: { status: 'APPROVED' } });
      expect(
        (await mutateHttp(post('', { action: 'prepare_settlement' }, staffToken), ctx)).status,
      ).toBe(403);
    } finally {
      globals.__arcuexDb = previousDb;
      globals.__arcuexRepo = previousRepo;
    }
  });
  it.each([
    ['missing authentication', {}, 'Independent replay'],
    ['unsupported causation', { canonicalRatioBps: 149 }, 'Unsupported covered causation'],
    ['incomplete recovery accounting', { recoveriesResolved: false }, 'accounting is incomplete'],
    ['contradictory block', { blockHash: bindHash }, 'Canonical receipt contradicts'],
    ['expired accounting', { accountedThroughMs: 0 }, 'cutoff is stale'],
  ] as const)('fails closed for %s', async (name, patch, finding) => {
    const f = await setup();
    const proof = f.envelope(f.claim, patch);
    const v = await f.verify(
      name === 'missing authentication' ? { ...proof, recoverySignature: '00'.repeat(64) } : proof,
    );
    expect(v.executionStatus).toBe('rejected');
    expect(v.findings.join(' ')).toContain(finding);
    expect(f.repo.listEvidenceManifests(f.claim.id)).toEqual([]);
    expect(f.repo.getClaimsCase(f.claim.id)?.evidenceAuthenticity).toBe('unverified');
  });
  it('rejects unsupported receipts and out-of-coverage canonical time', async () => {
    const f = await setup();
    const receipt = await f.reads.getTransactionReceipt();
    f.reads.getTransactionReceipt.mockResolvedValueOnce({ ...receipt, logs: [receipt.logs[0]] });
    expect((await f.verify()).findings.join(' ')).toContain(
      'Canonical liquidation read unavailable',
    );
    const policy = f.repo.getProcurementPolicy(f.claim.policyId)!;
    const before = BigInt(policy.terms.effectiveAt - 1);
    expect(() =>
      intakeClaimsCase(
        f.repo,
        {
          ...f.intake,
          idempotencyKey: randomUUID(),
          observedAt: new Date(Number(before) * 1000).toISOString(),
        },
        f.agentPrincipal,
      ),
    ).toThrow('coverage window');
    f.reads.getBlock.mockResolvedValue({ hash, timestamp: before });
    const wrongTime = await f.verify(f.envelope(f.claim, { accountingDigest: hash }));
    expect(wrongTime.findings.join(' ')).toContain('Canonical receipt contradicts');
  });
  it('holds duplicate event claims and rejects a reorged or stale approved record', async () => {
    const f = await setup();
    const first = await f.verify();
    f.complete();
    const approved = f.approve(first.id);
    expect(approved.status).toBe('APPROVED');
    const duplicate = f.open();
    expect(duplicate.incidentId).toBe(f.claim.incidentId);
    const second = await f.verify(f.envelope(duplicate), duplicate);
    f.complete(duplicate);
    expect(f.approve(second.id, duplicate)).toMatchObject({
      status: 'REVIEW',
      reviewReasonCode: 'INDEPENDENT_EVENT_ALREADY_COMMITTED',
    });
    f.reads.getBlock.mockResolvedValueOnce({ hash: bindHash, timestamp: 0n });
    await expect(recheckIndependentEvidence(f.repo, approved, first.id, f.client)).rejects.toThrow(
      'no longer canonical',
    );
    vi.spyOn(Date, 'now').mockReturnValue(first.validUntilMs!);
    await expect(recheckIndependentEvidence(f.repo, approved, first.id, f.client)).rejects.toThrow(
      'Current independent verification',
    );
    expect(() =>
      authorizeSettlementPreparation(
        f.repo,
        {
          caseId: approved.id,
          confirmedRecipient: owner,
          confirmedAmountMicros: approved.payableMicros!,
          confirmedLossKey: approved.lossKey!,
          confirmedEvidenceRoot: approved.evidenceRoot!,
          settlementPrepId: 'stale',
        },
        operator,
      ),
    ).toThrow();
    expect(f.repo.getClaimsCase(approved.id)?.status).toBe('APPROVED');
  });
});
