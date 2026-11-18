/** In-memory example only: no network, signing, or settlement. */
import { InsuranceRepository, openDatabase } from '@arcuex/persistence';
import {
  requestCoverageQuote,
  acceptAndBindPolicy,
  intakeClaimsCase,
  verifyClaimFixture,
  CLAIM_FIXTURE,
} from '../src/index';
const db = openDatabase();
try {
  const repo = new InsuranceRepository(db);
  const wallet = '0x1111111111111111111111111111111111111111';
  const principal = { role: 'claimant' as const, subject: wallet, walletAddress: wallet };
  const quote = requestCoverageQuote(repo, {
    idempotencyKey: 'example-quote',
    policyholder: { displayName: 'Synthetic example', walletAddress: wallet },
    agent: { externalRef: 'example', label: 'Example' },
  });
  const { policy, exposure } = acceptAndBindPolicy(repo, {
    quoteId: quote.id,
    idempotencyKey: 'example-bind',
    fundingVerified: true,
  });
  const observedAt = new Date().toISOString();
  const c = intakeClaimsCase(
    repo,
    {
      policyId: policy.id,
      exposureId: exposure.id,
      idempotencyKey: 'example-claim',
      claimantRef: wallet,
      syntheticDemo: true,
      actor: 'ignored',
      observedEventRef: 'synthetic:example:incident',
      observedAt,
    },
    principal,
  );
  const record = await verifyClaimFixture(
    repo,
    c.id,
    {
      fixtureRef: CLAIM_FIXTURE.reference,
      fixtureDigest: CLAIM_FIXTURE.digest,
      policyId: policy.id,
      incidentId: c.incidentId,
      observedAt,
    },
    principal,
  );
  console.log(JSON.stringify(record, null, 2));
} finally {
  db.close();
}
