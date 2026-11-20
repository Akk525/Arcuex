import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { ARC_USDC_ERC20_ADDRESS } from '@arcuex/chain';
import { PROCUREMENT_PRODUCT, type UnderwritingApplicationInput } from '@arcuex/domain';
import { ProcurementApiClient, ProcurementService, procurementDigest } from '@arcuex/agent-sdk';
import { InsuranceRepository, openDatabase, ProcurementStore } from '@arcuex/persistence';
import { intakeClaimsCase, getClaimsInvestigation } from '@arcuex/insurance';
import { toPolicyIdBytes32 } from '@arcuex/onchain';
import { GET, POST } from '@/app/api/underwriting/[[...id]]/route';
import { handle as procurement } from './procurement-api';
import { procurementPool } from './procurement-chain';
import { resetRuntimeConfigCache } from './runtime-config';

const globalStore = globalThis as typeof globalThis & {
  __arcuexDb?: ReturnType<typeof openDatabase>;
  __arcuexRepo?: InsuranceRepository;
};
const now = Math.floor(Date.now() / 1000);
const account = () => privateKeyToAccount(generatePrivateKey());
let db: ReturnType<typeof openDatabase>;
let service: ProcurementService;
let owner: ReturnType<typeof account>;
let signer: ReturnType<typeof account>;
let client: ProcurementApiClient;
let ownerClient: ProcurementApiClient;
let applicationInput: UnderwritingApplicationInput;

function send(request: Request) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/procurement/')) {
    return procurement(request, url.pathname.slice('/api/procurement/'.length));
  }
  const id = url.pathname.split('/').slice(3);
  return (request.method === 'GET' ? GET : POST)(request, { params: Promise.resolve({ id }) });
}

function sdk() {
  return new ProcurementApiClient({
    baseUrl: 'http://localhost',
    request: (url, init) => send(new Request(url, init)),
  });
}

function ops(id: string, body?: unknown) {
  return send(
    new Request(`http://localhost/api/underwriting/${id}`, {
      method: body ? 'POST' : 'GET',
      headers: { authorization: 'Bearer underwriting-test-reviewer', origin: 'http://localhost' },
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
}

beforeEach(async () => {
  vi.stubEnv('ARCUEX_CHAIN_SOURCE', 'arc-testnet');
  vi.stubEnv('CLAIMS_REVIEWER_API_TOKEN', 'underwriting-test-reviewer');
  resetRuntimeConfigCache();
  db = openDatabase();
  globalStore.__arcuexDb = db;
  globalStore.__arcuexRepo = new InsuranceRepository(db);
  service = new ProcurementService(
    new ProcurementStore(db),
    procurementPool,
    ARC_USDC_ERC20_ADDRESS,
  );
  owner = account();
  signer = account();
  const agent = service.register(owner.address.toLowerCase(), {
    idempotencyKey: 'register',
    signer: signer.address,
    label: 'Oracle Position',
    position: 'synthetic-position',
    exposureMicros: '10000000',
    ownerAttestsControl: true,
  });
  const grant = service.delegate(owner.address.toLowerCase(), {
    idempotencyKey: 'delegate',
    agentId: agent.id,
    expiresAt: now + 86400,
    premiumCapMicros: '1000000',
    limitCapMicros: '10000000',
  });
  applicationInput = {
    idempotencyKey: 'application',
    agentId: agent.id,
    delegationId: grant.id,
    productCode: PROCUREMENT_PRODUCT.code,
    limitMicros: '10000000',
    durationDays: 7,
    operation: 'manage_position',
    activity: 'Changes position collateral using an approved adapter.',
    attestEligible: true,
  };
  client = sdk();
  ownerClient = sdk();
  await client.authenticate(signer.address, (message) => signer.signMessage({ message }));
  await ownerClient.authenticate(owner.address, (message) => owner.signMessage({ message }));
});

afterEach(() => {
  db.close();
  delete globalStore.__arcuexDb;
  delete globalStore.__arcuexRepo;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetRuntimeConfigCache();
});

it('links SDK responses, insurer review, exact acceptance and the bound policy evidence in the claim dossier', async () => {
  const { application: applied } = await client.applyForUnderwriting(
    applicationInput,
    applicationInput.agentId,
  );
  const id = applied.application.id;
  const request = applied.entries[0];
  expect(request.kind).toBe('request');
  expect(applied.status).toBe('needs_evidence');
  expect(applied.findings[0].source).toBe('Owner attestation on file');
  expect((await client.applyForUnderwriting(applicationInput)).application.application.id).toBe(id);
  expect((await ownerClient.underwritingApplications()).applications).toHaveLength(1);
  expect(await (await ops(id)).json()).toMatchObject({ application: { status: 'needs_evidence' } });
  await expect(
    client.updateUnderwriting(id, { action: 'quote', idempotencyKey: 'early' }),
  ).rejects.toThrow('needs a decision or evidence');
  await expect(
    client.updateUnderwriting(id, {
      action: 'decision',
      outcome: 'approve',
      text: 'forged',
      idempotencyKey: 'forged',
    }),
  ).rejects.toThrow('Only an insurer');
  expect(
    (
      await ops(id, {
        action: 'decision',
        outcome: 'approve',
        text: 'too early',
        idempotencyKey: 'early-review',
      })
    ).status,
  ).toBe(409);

  const response = {
    action: 'response',
    requestId: request.id,
    text: 'Fixture snapshot at block 100 with owner-approved collateral limits.',
    idempotencyKey: 'proof',
  } as const;
  expect((await client.updateUnderwriting(id, response)).application.status).toBe('needs_review');
  expect((await client.updateUnderwriting(id, response)).application.entries).toHaveLength(2);
  await expect(
    client.updateUnderwriting(id, { ...response, text: 'changed retry' }),
  ).rejects.toThrow('different input');
  const decision = await ops(id, {
    action: 'decision',
    outcome: 'approve',
    text: 'Reviewed the synthetic response.',
    idempotencyKey: 'approve',
  });
  expect(decision.status).toBe(200);
  const { application: underwritten } = await client.updateUnderwriting(
    id,
    { action: 'quote', idempotencyKey: 'quote' },
    applicationInput.agentId,
  );
  const quote = underwritten.quote!;
  expect(quote.terms).toMatchObject({
    premiumMicros: '175000',
    deductibleMicros: '2000000',
    underwriting: { applicationId: id, ruleVersion: 'synthetic-oracle-underwriting-v1' },
  });
  expect(quote.terms.underwriting?.claimEvidence).toHaveLength(4);
  expect(quote.digest).toBe(procurementDigest(quote.terms));
  expect(
    (await client.updateUnderwriting(id, { action: 'quote', idempotencyKey: 'quote-again' }))
      .application.quote?.digest,
  ).toBe(quote.digest);
  await expect(
    ownerClient.accept({ quoteId: quote.terms.quoteId, acceptedDigest: quote.digest }),
  ).rejects.toThrow('different payer');
  const { policy } = await client.accept({
    quoteId: quote.terms.quoteId,
    acceptedDigest: quote.digest,
    delegationId: applicationInput.delegationId,
  });
  expect(policy.terms.underwriting).toEqual(quote.terms.underwriting);

  // Insert only a disposable, simulated receipt and checkpoint for the claims integration.
  const acceptedAt = policy.terms.effectiveAt - 899;
  service.store.confirm(policy.terms.policyId, `0x${'ab'.repeat(32)}`, acceptedAt);
  db.prepare(
    'INSERT INTO policy_reconciliation_scopes(scope,healthy,checked_at,through_block,through_hash) VALUES (?,?,?,?,?)',
  ).run('underwriting-test', 1, policy.terms.effectiveAt, '1', 'fixture');
  db.prepare("INSERT INTO policy_bind_events VALUES (?,?,?,?,'VERIFIED_LINKED',1,'1',?,?)").run(
    'underwriting-test-event',
    'underwriting-test',
    toPolicyIdBytes32(policy.terms.policyId),
    policy.terms.policyId,
    'fixture',
    '{}',
  );
  const claimant = {
    role: 'claimant',
    subject: 'signed-agent',
    walletAddress: signer.address.toLowerCase(),
    agentId: applicationInput.agentId,
  } as const;
  const repo = globalStore.__arcuexRepo!;
  vi.spyOn(Date, 'now').mockReturnValue((policy.terms.effectiveAt + 1) * 1000);
  const claim = intakeClaimsCase(
    repo,
    {
      policyId: policy.terms.policyId,
      exposureId: applicationInput.agentId,
      claimantRef: 'signed-agent',
      idempotencyKey: 'fixture-claim',
      syntheticDemo: true,
      actor: 'ignored',
      observedEventRef: 'synthetic:underwriting',
      observedAt: new Date(policy.terms.effectiveAt * 1000).toISOString(),
    },
    claimant,
  );
  expect(
    getClaimsInvestigation(repo, claim.id, { role: 'reviewer', subject: 'reviewer' }).underwriting,
  ).toEqual(quote.terms.underwriting);
});

it('offers different terms for lower exposure and keeps applications private', async () => {
  const { application } = await ownerClient.applyForUnderwriting({
    ...applicationInput,
    delegationId: undefined,
    limitMicros: '1000000',
    operation: 'monitor',
    activity: 'Watches the registered position for changes.',
  });
  expect(application.status).toBe('ready');
  const { application: priced } = await ownerClient.updateUnderwriting(application.application.id, {
    action: 'quote',
    idempotencyKey: 'baseline',
  });
  expect(priced.quote?.terms).toMatchObject({ premiumMicros: '10000', deductibleMicros: '100000' });
  const stranger = account();
  const outsider = sdk();
  await outsider.authenticate(stranger.address, (message) => stranger.signMessage({ message }));
  expect((await outsider.underwritingApplications()).applications).toEqual([]);
  await expect(outsider.underwritingApplication(application.application.id)).rejects.toThrow(
    'Application not found',
  );
  await expect(
    outsider.underwritingApplication(application.application.id, applicationInput.agentId),
  ).rejects.toThrow('identity does not match');
});
