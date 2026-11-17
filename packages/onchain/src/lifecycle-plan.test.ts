import { describe, expect, it, vi } from 'vitest';
import type { PublicClient } from 'viem';
import { DEFAULT_LIFECYCLE_AMOUNTS, buildLifecyclePlan } from './lifecycle-plan';
import type { TestnetAdapterSnapshot } from './testnet-adapter';

const POOL = '0x6657974EEdF488380251bDD95A7FFfb0D456E49E' as const;
const USDC = '0x3600000000000000000000000000000000000000' as const;
const AUTH = '0xA6876A60748c638f66b911aaEe03Bd712D85AF36' as const;
const FEE = '0x69797270A2b8B355D55676787a29D2B1057411C7' as const;
const LP = '0x00000000000000000000000000000000000000aa' as const;
const PH = '0x00000000000000000000000000000000000000bb' as const;
const BENE = '0x00000000000000000000000000000000000000cc' as const;

function mockClient(overrides: Record<string, unknown> = {}): PublicClient {
  return {
    getBalance: vi.fn(async () => (overrides.native as bigint) ?? 1n),
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      if (overrides[functionName] !== undefined) return overrides[functionName];
      switch (functionName) {
        case 'balanceOf':
          return 10_000_000n;
        case 'allowance':
          return 0n;
        case 'settledClaims':
          return false;
        case 'policies':
          return [
            ('0x' + '00'.repeat(32)) as `0x${string}`,
            '0x0000000000000000000000000000000000000000',
            '0x0000000000000000000000000000000000000000',
            0n,
            0n,
            0n,
            0n,
            0n,
            0n,
            false,
            false,
          ];
        default:
          throw new Error(functionName);
      }
    }),
  } as unknown as PublicClient;
}

const adapter = {
  chainId: 5042002,
  pool: POOL,
  usdc: USDC,
  claimsAuthority: AUTH,
  feeRecipient: FEE,
  mismatches: [],
  poolSnapshot: {
    totalAssets: 0n,
    totalReserved: 0n,
    totalShares: 0n,
    availableCapital: 0n,
    usdcBalance: 0n,
    claimsAuthority: AUTH,
  },
  manifest: {
    network: 'arc-testnet',
    chainId: 5042002,
    usdc: USDC,
    insurancePool: POOL,
    claimsAuthoritySet: true,
    feeRecipientSet: true,
    rpc: 'https://example',
    verifiedAt: '2026-11-17T00:00:00Z',
  },
} as unknown as TestnetAdapterSnapshot;

describe('buildLifecyclePlan', () => {
  it('plans 5/2/0.1/1 USDC flow and blocks missing authority key + zero gas', async () => {
    const client = mockClient({ native: 0n });
    const plan = await buildLifecyclePlan({
      client,
      adapter,
      roles: {
        lp: LP,
        policyholder: PH,
        claimsAuthority: AUTH,
        beneficiary: BENE,
        feeRecipient: FEE,
      },
      keys: {
        lpKey: true,
        policyholderKey: true,
        claimsAuthorityKey: false,
        lpUseDeployer: false,
        policyholderUseDeployer: false,
      },
    });

    expect(plan.amounts).toMatchObject(DEFAULT_LIFECYCLE_AMOUNTS);
    expect(plan.steps.map((s) => s.id)).toEqual([
      'lp_approve',
      'lp_deposit',
      'policyholder_approve',
      'bind_policy',
      'synthetic_evaluate',
      'settle_claim',
    ]);
    expect(plan.claim.settlementAuthorizedByEvidence).toBe(false);
    expect(plan.readyForLive).toBe(false);
    expect(plan.blockers.some((b) => b.includes('CLAIMS_AUTHORITY_PRIVATE_KEY'))).toBe(true);
    expect(plan.blockers.some((b) => b.includes('native balance is 0'))).toBe(true);
  });

  it('is ready when keys, gas, and balances are present', async () => {
    const client = mockClient({ native: 1n, balanceOf: 50_000_000n });
    const plan = await buildLifecyclePlan({
      client,
      adapter,
      roles: {
        lp: LP,
        policyholder: PH,
        claimsAuthority: AUTH,
        beneficiary: BENE,
        feeRecipient: FEE,
      },
      keys: {
        lpKey: true,
        policyholderKey: true,
        claimsAuthorityKey: true,
        lpUseDeployer: false,
        policyholderUseDeployer: false,
      },
      mode: 'live',
    });
    expect(plan.blockers).toEqual([]);
    expect(plan.readyForLive).toBe(true);
  });
});
