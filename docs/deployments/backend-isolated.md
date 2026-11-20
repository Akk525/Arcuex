# Isolated Arc Testnet backend candidate

Reviewed November 19, 2026 (America/Chicago). The candidate is deployable only after separate authorization and hosted acceptance. Configure the separate Railway service with the settings in `deploy/backend/railway.toml`. Verify the effective Dockerfile builder, start command, one replica, zero rollout overlap, and liveness check on that service before uploading the release. It uses the existing Next.js API and indexer supervisor with a single writer volume. The existing root Railway config and frozen release refs are outside the candidate startup path.

## Runtime contract

- Use a distinct project, environment, service, HTTPS origin and persistent volume mounted at `/data`, with one replica. Set `ARCUEX_BACKEND_ISOLATED=1`, `ARCUEX_BACKEND_VOLUME_ID=<verified volume UUID>`, `ARCUEX_DEPLOYMENT_MODE=public-beta`, `ARCUEX_CHAIN_SOURCE=arc-testnet`, `ARCUEX_DATA_DIR=/data`, `ARCUE_X_SQLITE_PATH=/data/backend.sqlite`, `ARCUEX_STORAGE_ID=backend-<volume UUID>`, and a fresh session epoch. The startup guard rejects Plan A project, environment, service and volume IDs before bootstrap. Record the attached volume UUID from Railway metadata. Railway injects the mount path and volume name. Confirm the mount and the storage marker during hosted acceptance. [Railway volume documentation](https://docs.railway.com/volumes), [Railway variables reference](https://docs.railway.com/variables/reference)
- Use fresh server-side reviewer, authority, optional system, rate and ingress-gate credentials. Supply dedicated testnet RPC URLs and pin chain ID `5042002` and the deployment manifest's pool. Disable synthetic settlement preparation and leave the independent profile absent until the actual protocol and authorities have been approved. Keep the separate OpenAI examiner worker's key off the web/indexer environment. Its egress needs the dedicated API host and `api.openai.com`. The web/indexer needs the approved Arc RPC providers. Restrict ingress to the configured HTTPS origin and known operator access. Verify actual egress controls before opening the gate.
- Enable reconciliation with an operator-verified start block at or before the first candidate policy bind. Supply an RPC that can serve historical logs, blocks, receipts, transaction calldata, bytecode and block-tagged contract calls at the full candidate backfill depth. A healthy process probe only verifies liveness. Check gated `/api/health/ready`, backfill completion, checkpoint freshness and canonical links through `/api/policies/reconciliation`.
- Build from a clean reviewed SHA and record the resulting image digest. The Dockerfile pins the Node base digest and pnpm version and uses a frozen dependency lockfile. Debian packages still resolve from package repositories at build time. A repeated build may yield a different digest. Local source build and startup guard tests are recorded in the verification report.

## Public access (no acceptance gate)

`ARCUEX_PUBLIC_ACCESS=1` removes only the acceptance gate, so a reviewed Arc Testnet deployment can
be reached anonymously, for example by hackathon judges.

- Don't set `ARCUEX_ACCEPTANCE_GATE_TOKEN` alongside it. Startup rejects the combination.
- Fixture mode rejects it.
- Everything else stays enforced: Railway edge/origin/host checks, rate limits, secure cookies,
  distinct operator credentials, the pinned chain and pool, and
  `CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP=0`.

The website, API routes, MCP endpoint and reconciliation worker all run in the one container
started by `start-isolated.sh`.

## Storage and recovery

The candidate inherits 14 migrations including claim verification and investigation tables. The isolated startup validates runtime configuration before shared volume bootstrap. After verifying the volume marker and backing up any existing candidate database, it migrates and verifies the database source before launching Next.js or the indexer. A failure exits startup before either child starts. Test migration from the intended source snapshot on an isolated copy before any approved use of existing data.

Use the existing SQLite backup script to create a consistent snapshot and checksum. Store and periodically verify a separate encrypted backup copy. Before an authorized restore, stop both writers, preserve a current snapshot and cursor, validate the restored copy's integrity and foreign keys, enforce the recovery hold, and compare the restored journal and checkpoint against Arc for all activity since the backup. Start the indexer from a checkpoint consistent with the restored database or replay from the appropriate earlier block. Clear the hold only after verifying policy and payment reconciliation. Railway volume backups are a second recovery layer within their project and environment. [Railway backup documentation](https://docs.railway.com/volumes/backups)

The off-chain ledger and evidence records are held in the candidate volume. The independent parties must retain the replay and accounting artifacts referenced by signed digests. The evidence verifier records those digests, signatures and extracted facts. Artifact retrieval and retention from an external source require an appointed operator and provider.

See the [backend readiness report](../verification/2026-11-19-backend-live-readiness.md) for the deployment gate and frontend contract.

The integration candidate records signing authorizations in the existing case event journal. The indexer uses a separate SQLite cursor lock under `/data/reconciliation`. Preserve the journal during recovery and reconcile the external authority's outstanding nonces before lifting a recovery hold. See the [integration handoff](../integrations/backend-integration-v1.md).

## Local release rehearsal

From the candidate checkout, install the frozen dependencies with `pnpm install --frozen-lockfile` and run `pnpm build`. Point `PLAYWRIGHT_MODULE` to the absolute path of an installed Playwright `index.mjs`. The harness uses Google Chrome by default. Set `ARCUEX_ACCEPTANCE_CHROMIUM_EXECUTABLE` if using a different Chromium binary.

```sh
ARCUEX_BROWSER_EVIDENCE_DIR="$(mktemp -d)" \
  pnpm --filter @arcuex/onchain exec tsx ../../apps/web/scripts/premium-phase-d-acceptance.mts
```

The harness runs the production app on localhost:3062 with disposable seeded SQLite. It exercises the insured agent's claim, extra proof, deterministic reverification, two advisory examiner passes with a transport double, and human approval. Its ephemeral wallets sign local login messages only. The result must say **Approved · not reimbursed**. Fixture mode uses a pre-established policy and rejects quote acceptance and settlement preparation. The examiner worker is run separately for an explicit case/request, with the provider key confined to the worker when live inference is authorized.
