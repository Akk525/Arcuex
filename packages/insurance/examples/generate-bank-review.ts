import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { syntheticBankDisputeFixture } from '../src/bank-dispute-fixture';
import { examineBankDisputes } from '../src/bank-dispute-examiner';

// Fixed local outputs in this checkout, never the configured application database.
const directory = new URL('../../../.data/platform-foundation/', import.meta.url);
const samples = new URL('../../../docs/examples/platform/', import.meta.url);
mkdirSync(directory, { recursive: true, mode: 0o700 });
mkdirSync(samples, { recursive: true });
const fixture = syntheticBankDisputeFixture();
const dossier = examineBankDisputes(fixture);
const evidenceJson =
  JSON.stringify(
    {
      ...fixture,
      notice:
        'SYNTHETIC TEST EVIDENCE. Public attestor keys only; ephemeral private keys are not exported.',
    },
    null,
    2,
  ) + '\n';
const dossierJson = JSON.stringify(dossier, null, 2) + '\n';
const evidenceFile = new URL('bank-synthetic-evidence.json', directory);
const dossierFile = new URL('bank-review-dossier.json', directory);
writeFileSync(evidenceFile, evidenceJson, { mode: 0o600 });
writeFileSync(dossierFile, dossierJson, { mode: 0o600 });
const summary = {
  mode: dossier.mode,
  productReference: dossier.productReference,
  inputCounts: dossier.inputCounts,
  summary: dossier.summary,
  evidenceSha256: createHash('sha256').update(evidenceJson).digest('hex'),
  fullDossierSha256: createHash('sha256').update(dossierJson).digest('hex'),
  lossAsset: dossier.lossAsset,
  lossSummary: dossier.lossSummary,
  financialActions: dossier.financialActions,
  review: {
    ...dossier.reviewDossier,
    disputedCaseIds: 'All case-level IDs are in the full local dossier.',
  },
  exampleFindings: [
    dossier.findings[0],
    dossier.findings[1],
    dossier.findings.find((f) => f.recordedAttribution === 'recorded_ai_denial'),
  ],
  reproducibility:
    'Run pnpm --filter @arcuex/insurance example:bank-review. Counts and analyses are deterministic; ephemeral synthetic attestor keys/signatures and file hashes change on each generation.',
};
writeFileSync(
  new URL('bank-dossier-summary.json', samples),
  JSON.stringify(summary, null, 2) + '\n',
);
console.log(
  JSON.stringify(
    {
      evidence: fileURLToPath(evidenceFile),
      dossier: fileURLToPath(dossierFile),
      summary: dossier.summary,
      financialActions: dossier.financialActions,
    },
    null,
    2,
  ),
);
