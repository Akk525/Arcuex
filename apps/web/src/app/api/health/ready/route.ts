import { NextResponse } from 'next/server';
import { insurancePoolAbi } from '@arcuex/onchain';
import { ARC_USDC_ERC20_ADDRESS } from '@arcuex/chain';
import { withApiSecurity } from '@/lib/server/api-security';
import { getDb } from '@/lib/server/db';
import { procurementClient, procurementPool } from '@/lib/server/procurement-chain';
import { LAUNCH_CHAIN_ID, getRuntimeConfig } from '@/lib/server/runtime-config';
import { readFixture } from '@/lib/server/fixture-source';

export const dynamic = 'force-dynamic';

export const GET = withApiSecurity(async () => {
  try {
    const db = getDb();
    const integrity = db.pragma('quick_check', { simple: true }) === 'ok';
    const foreignKeys = (db.pragma('foreign_key_check') as unknown[]).length === 0;
    const recovery = db
      .prepare("SELECT value FROM launch_runtime_state WHERE key = 'recovery_hold'")
      .get() as { value: string } | undefined;

    const config = getRuntimeConfig();
    if (config.chainSource === 'fixture') {
      const fixture = readFixture(db, config);
      const ok = integrity && foreignKeys && recovery?.value !== '1';
      return NextResponse.json(
        {
          ok,
          source: fixture.source,
          notice: 'Synthetic snapshot readiness only; no live chain or solvency assertion',
          checks: {
            database: integrity && foreignKeys,
            fixtureCheckpoint: true,
            recoveryHold: recovery?.value === '1',
          },
        },
        { status: ok ? 200 : 503 },
      );
    }
    const c = procurementClient();
    const [chain, code, token, assets, reserved, balance] = await Promise.all([
      c.getChainId(),
      c.getCode({ address: procurementPool }),
      c.readContract({
        address: procurementPool,
        abi: insurancePoolAbi,
        functionName: 'usdc',
      }),
      c.readContract({
        address: procurementPool,
        abi: insurancePoolAbi,
        functionName: 'totalAssets',
      }),
      c.readContract({
        address: procurementPool,
        abi: insurancePoolAbi,
        functionName: 'totalReserved',
      }),
      c.readContract({
        address: ARC_USDC_ERC20_ADDRESS,
        abi: [
          {
            type: 'function',
            name: 'balanceOf',
            stateMutability: 'view',
            inputs: [{ name: 'account', type: 'address' }],
            outputs: [{ type: 'uint256' }],
          },
        ] as const,
        functionName: 'balanceOf',
        args: [procurementPool],
      }),
    ]);

    const ok =
      integrity &&
      foreignKeys &&
      recovery?.value !== '1' &&
      chain === LAUNCH_CHAIN_ID &&
      !!code &&
      code !== '0x' &&
      token.toLowerCase() === ARC_USDC_ERC20_ADDRESS.toLowerCase() &&
      assets >= reserved &&
      balance >= assets;

    return NextResponse.json(
      {
        ok,
        checks: {
          database: integrity && foreignKeys,
          recoveryHold: recovery?.value === '1',
          chain: chain === LAUNCH_CHAIN_ID,
          deployment:
            !!code && code !== '0x' && token.toLowerCase() === ARC_USDC_ERC20_ADDRESS.toLowerCase(),
          solvency: assets >= reserved && balance >= assets,
        },
        chainId: LAUNCH_CHAIN_ID,
        pool: procurementPool,
      },
      { status: ok ? 200 : 503 },
    );
  } catch {
    return NextResponse.json({ ok: false, error: 'Readiness check failed' }, { status: 503 });
  }
});
