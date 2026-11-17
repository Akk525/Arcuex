#!/usr/bin/env node
/**
 * Arc Testnet InsurancePool lifecycle CLI.
 * Default: dry-run / preflight only — no broadcasts.
 *
 * Usage:
 *   pnpm --filter @arcuex/onchain lifecycle:preflight
 *   pnpm --filter @arcuex/onchain lifecycle:preflight -- --mode=live --confirm=lp_approve
 *
 * Never prints private keys. Secrets stay in env / .env (gitignored).
 */
import { resolve } from 'node:path';
import { runTestnetLifecycle } from '../lifecycle-runner';

function parseArgs(argv: string[]) {
  let mode: 'dry-run' | 'live' = 'dry-run';
  const confirm: Array<
    'lp_approve' | 'lp_deposit' | 'policyholder_approve' | 'bind_policy' | 'settle_claim'
  > = [];
  let manifestPath: string | undefined;
  let policyEntityId: string | undefined;

  for (const arg of argv) {
    if (arg === '--mode=live' || arg === '--live') mode = 'live';
    else if (arg === '--mode=dry-run' || arg === '--dry-run') mode = 'dry-run';
    else if (arg.startsWith('--confirm=')) {
      const id = arg.slice('--confirm='.length);
      confirm.push(id as (typeof confirm)[number]);
    } else if (arg.startsWith('--manifest=')) {
      manifestPath = resolve(arg.slice('--manifest='.length));
    } else if (arg.startsWith('--policy-entity-id=')) {
      policyEntityId = arg.slice('--policy-entity-id='.length);
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return { mode, confirm, manifestPath, policyEntityId };
}

function printHelp() {
  console.log(`Arcuex Arc Testnet lifecycle

Default is dry-run (no broadcasts).

  pnpm --filter @arcuex/onchain lifecycle:preflight
  pnpm --filter @arcuex/onchain lifecycle:preflight -- --mode=live --confirm=lp_approve

Env (never commit):
  ARC_TESTNET_RPC_URL
  ARCUE_X_POOL_ADDRESS (cross-checked vs manifest)
  DEPLOYER_PRIVATE_KEY (optional; only if LIFECYCLE_*_USE_DEPLOYER=1)
  LP_PRIVATE_KEY / LIFECYCLE_LP_USE_DEPLOYER=1
  POLICYHOLDER_PRIVATE_KEY / LIFECYCLE_POLICYHOLDER_USE_DEPLOYER=1
  CLAIMS_AUTHORITY_PRIVATE_KEY (must match on-chain claimsAuthority)
  BENEFICIARY_ADDRESS
  CLAIMS_AUTHORITY / FEE_RECIPIENT (address cross-checks)
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  // Resolve manifest from monorepo root when run via pnpm filter (cwd=package).
  const manifestPath =
    args.manifestPath ??
    resolve(process.cwd(), '../../docs/deployments/arc-testnet-insurance-pool.json');

  const result = await runTestnetLifecycle({
    mode: args.mode,
    confirmStepIds: args.confirm,
    manifestPath,
    policyEntityId: args.policyEntityId,
  });

  console.log(result.report);
  if (result.executions.length) {
    console.log('--- executions ---');
    for (const e of result.executions) {
      if (e.skipped) console.log(`SKIP ${e.stepId}: ${e.reason}`);
      else
        console.log(
          `${e.status ?? 'UNKNOWN'} ${e.stepId}: hash=${e.hash ?? e.tx?.hash ?? 'n/a'} block=${e.tx?.blockNumber ?? 'n/a'} events=${e.reason ?? ''}`,
        );
    }
  }
  if (result.reconciliation) {
    console.log('--- reconciliation ---');
    console.log(
      JSON.stringify(
        result.reconciliation,
        (_, v) => (typeof v === 'bigint' ? v.toString() : v),
        2,
      ),
    );
  }

  console.log(
    `Process outcome: ${result.outcome}; broadcast hashes: ${result.executions.filter((e) => e.hash || e.tx).length}`,
  );
  if (result.outcome === 'runtime_failure') {
    console.log(result.runtimeError ?? 'Reconciliation mismatch (see above).');
    process.exitCode = 1;
    return;
  }
  if (result.outcome === 'preflight_blocked') {
    console.log(
      '\nPreflight blocked before execution — no transactions broadcast by this invocation.',
    );
    process.exitCode = 2;
    return;
  }
  if (args.mode === 'dry-run') {
    console.log('\nSelected-step dry-run OK; no transactions broadcast.');
  }
}

main().catch(() => {
  console.error(
    'Lifecycle failed; inspect any recorded transaction hashes before retrying. Error details suppressed to protect credentials.',
  );
  process.exitCode = 1;
});
