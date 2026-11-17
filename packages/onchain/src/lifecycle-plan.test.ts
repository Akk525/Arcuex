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
    getBlock: vi.fn(async () => ({ timestamp: BigInt(Math.floor(Date.now() / 1000)) })),
    getBalance: vi.fn(async () => (overrides.native as bigint) ?? 1n),
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      if (overrides[functionName] !== undefined) return overrides[functionName];
      switch (functionName) {
        case 'balanceOf':
          return 10_000_000n;
        case 'allowance':
          return 0n;
        case 'sharesOf':
          return 0n;
        case 'losses':
          return ['0x' + '00'.repeat(32), 0n, 0n, false];
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
    expect(plan.blockers.some((b) => b.includes('claimsAuthority signer missing'))).toBe(true);
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

const roles = {
  lp: LP,
  policyholder: PH,
  claimsAuthority: AUTH,
  beneficiary: BENE,
  feeRecipient: FEE,
};
const keys = {
  lpKey: true,
  policyholderKey: true,
  claimsAuthorityKey: true,
  lpUseDeployer: false,
  policyholderUseDeployer: false,
};
const bound = [
  '0x' + '11'.repeat(32),
  BENE,
  PH,
  2_000_000n,
  100_000n,
  0n,
  9_999_999_999n,
  2_000_000n,
  0n,
  true,
  false,
];
const planFor = (overrides: Record<string, unknown>, selectedStepIds: string[], extra = {}) =>
  buildLifecyclePlan({
    client: mockClient(overrides),
    adapter,
    roles,
    keys,
    mode: 'live',
    selectedStepIds,
    ...extra,
  });

it('first run requires selected approvals, deposit and bind prerequisites', async () => {
  const p = await planFor({}, ['lp_deposit', 'bind_policy', 'settle_claim']);
  expect(p.blockers).toContain('deposit requires allowance or selected lp_approve');
  expect(p.blockers).toContain('bind requires allowance or selected policyholder_approve');
});
it('partially completed approvals are satisfied and allow deposit', async () => {
  const p = await planFor({ allowance: 5_000_000n }, ['lp_approve', 'lp_deposit']);
  expect(p.blockers).toEqual([]);
  expect(p.steps.find((s) => s.id === 'lp_approve')?.status).toBe('SATISFIED');
});
it('already deposited skips repeat deposit despite spent balance', async () => {
  const p = await planFor({ sharesOf: 5_000_000n, balanceOf: 0n, native: 0n }, [
    'lp_approve',
    'lp_deposit',
  ]);
  expect(p.blockers).toEqual([]);
  expect(p.steps.filter((s) => s.selected).every((s) => s.status === 'SATISFIED')).toBe(true);
});
it('already bound satisfies bind and approval despite spent premium', async () => {
  const p = await planFor({ policies: bound, balanceOf: 0n }, [
    'policyholder_approve',
    'bind_policy',
    'settle_claim',
  ]);
  expect(p.blockers).toEqual([]);
  expect(p.steps.find((s) => s.id === 'bind_policy')?.status).toBe('SATISFIED');
});
it('selected settlement only uses bound policy without LP or policyholder keys', async () => {
  const p = await planFor({ policies: bound, balanceOf: 0n }, ['settle_claim'], {
    roles: { ...roles, lp: null, policyholder: null, beneficiary: null },
    keys: { ...keys, lpKey: false, policyholderKey: false },
  });
  expect(p.blockers).toEqual([]);
  expect(p.claim.beneficiary).toBe(BENE);
});
it('settlement alone requires a bound policy', async () => {
  const p = await planFor({}, ['settle_claim']);
  expect(p.blockers).toContain('settlement requires bound policy or selected bind_policy');
});
it('already settled is satisfied even without signer or gas', async () => {
  const p = await planFor({ policies: bound, settledClaims: true, native: 0n }, ['settle_claim'], {
    keys: { ...keys, claimsAuthorityKey: false },
  });
  expect(p.blockers).toEqual([]);
  expect(p.steps.find((s) => s.id === 'settle_claim')?.status).toBe('SATISFIED');
});
it.each([
  { losses: ['0x' + '11'.repeat(32), 1_000_000n, 0n, true] },
  { losses: ['0x' + '00'.repeat(32), 2_000_000n, 0n, true] },
  { losses: ['0x' + '00'.repeat(32), 1_000_000n, 1_000_000n, true] },
  { policies: bound.map((v, i) => (i === 10 ? true : v)) },
  { policies: bound.map((v, i) => (i === 6 ? 1n : v)) },
  { policies: bound.map((v, i) => (i === 7 ? 0n : v)) },
])('blocks invalid current settlement state %#', async (overrides) => {
  const p = await planFor({ policies: bound, ...overrides }, ['settle_claim']);
  expect(p.blockers.length).toBeGreaterThan(0);
});

it('shared signer premium approval is not satisfied by allowance consumed in deposit', async () => {
  const p = await planFor(
    { allowance: 5_000_000n },
    ['lp_deposit', 'policyholder_approve', 'bind_policy'],
    { roles: { ...roles, policyholder: LP } },
  );
  expect(p.blockers).toEqual([]);
  expect(p.steps.find((s) => s.id === 'policyholder_approve')?.status).toBe('READY');
  const blocked = await planFor({ allowance: 5_000_000n }, ['lp_deposit', 'bind_policy'], {
    roles: { ...roles, policyholder: LP },
  });
  expect(blocked.blockers).toContain('bind requires allowance or selected policyholder_approve');
});
