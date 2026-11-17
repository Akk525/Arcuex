/** Read-only chain / local SQLite smoke. Generates ephemeral test identities; never broadcasts. */
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { ProcurementApiClient } from '@arcuex/agent-sdk';
const owner = privateKeyToAccount(generatePrivateKey());
const agent = privateKeyToAccount(generatePrivateKey());
const baseUrl = process.argv[2] ?? 'http://localhost:3002';
const ownerApi = new ProcurementApiClient({ baseUrl });
const agentApi = new ProcurementApiClient({ baseUrl });
const eligibility = {
  positionHealthy: true,
  noKnownIncident: true,
  syntheticOnly: true,
  ownerAttestsControl: true,
};
await ownerApi.authenticate(owner.address, (message) => owner.signMessage({ message }));
const products = await ownerApi.products();
if (products.chainId !== 5042002 || products.products.length !== 1)
  throw new Error('Unexpected product discovery');
const registered = await ownerApi.register({
  idempotencyKey: crypto.randomUUID(),
  signer: agent.address,
  label: 'smoke-test-agent',
  position: `smoke-${crypto.randomUUID()}`,
  exposureMicros: '1000000',
  ownerAttestsControl: true,
});
const delegation = await ownerApi.delegate({
  idempotencyKey: crypto.randomUUID(),
  agentId: registered.id,
  premiumCapMicros: '10000',
  limitCapMicros: '1000000',
  beneficiary: owner.address,
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
});
await agentApi.authenticate(agent.address, (message) => agent.signMessage({ message }));
const identified = await agentApi.agents();
if (!identified.some((a) => a.id === registered.id))
  throw new Error('Agent could not identify its registration');
const authority = await agentApi.authority({ delegationId: delegation.id });
if (authority.revoked || authority.expired || authority.remainingPremiumMicros !== '10000')
  throw new Error('Authority mismatch');
const quote = await agentApi.quote({
  idempotencyKey: crypto.randomUUID(),
  agentId: registered.id,
  delegationId: delegation.id,
  beneficiary: owner.address,
  limitMicros: '1000000',
  durationDays: 1,
  eligibility,
});
const input = {
  quoteId: quote.terms.quoteId,
  acceptedDigest: quote.digest,
  delegationId: delegation.id,
};
const first = await agentApi.procure(input);
const repeated = await agentApi.procure(input);
if (
  first.policy.state !== 'prepared' ||
  first.transactions.length !== 2 ||
  repeated.policy.terms.policyId !== first.policy.terms.policyId
)
  throw new Error('Preparation replay mismatch');
const remaining = await agentApi.authority({ delegationId: delegation.id });
if (remaining.remainingPremiumMicros !== '0') throw new Error('Cap was not reserved exactly once');
const status = await agentApi.policy(first.policy.terms.policyId);
if (status.policy.state !== 'prepared' || status.reconciliation?.bound)
  throw new Error('Unbound policy incorrectly activated');
await ownerApi.revoke(delegation.id);
let revokedRejected = false;
try {
  await agentApi.procure(input);
} catch {
  revokedRejected = true;
}
if (!revokedRejected) throw new Error('Revocation failed');
console.log(
  JSON.stringify({
    result: 'PASS',
    ownerAuthenticated: true,
    agentAuthenticated: true,
    registeredExposure: true,
    delegationCapReservedOnce: true,
    revocationEnforced: true,
    preparedTransactions: 2,
    policyState: status.policy.state,
    chainBound: false,
    financialBroadcasts: 0,
  }),
);
