import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ORACLE_LIQUIDATION_REPLAY as R, fixedPoint } from './oracle-liquidation';

const artifact = JSON.parse(
  readFileSync(join(__dirname, '../../../../../', R.sources.artifact), 'utf8'),
) as {
  transactionHash: string;
  blockHash: string;
  hardfork: string;
  method: string;
  results: Array<Record<string, unknown> & { account: string[]; counterfactual: boolean }>;
};

describe('historical oracle-liquidation replay values', () => {
  const faulty = artifact.results.find((r) => !r.counterfactual)!;
  const counter = artifact.results.find((r) => r.counterfactual)!;

  it('matches the preserved transaction identity', () => {
    expect(artifact.transactionHash).toBe(R.liquidationTx);
    expect(artifact.blockHash).toBe(R.blockHash);
    expect(artifact.hardfork).toBe(R.hardfork);
    expect(artifact.method).toBe(R.method);
  });

  it('matches faulty and counterfactual execution results', () => {
    expect(faulty.adapterPrice).toBe(R.faulty.adapterPrice);
    expect(faulty.account[5]).toBe(R.faulty.healthFactor);
    expect(faulty.account[0]).toBe(R.faulty.collateralValueUsd);
    expect(faulty.account[1]).toBe(R.faulty.debtValueUsd);
    expect(faulty.executionError).toBeNull();
    expect(faulty.exactReceiptLogMatch).toBe(true);
    expect(counter.adapterPrice).toBe(R.counterfactual.adapterPrice);
    expect(counter.account[5]).toBe(R.counterfactual.healthFactor);
    expect(counter.account[0]).toBe(R.counterfactual.collateralValueUsd);
    expect(counter.executionError).toBe('revert');
    expect(counter.logCount).toBe(0);
  });

  it('matches the conditional gross-loss arithmetic', () => {
    expect(faulty.canonicalRatio).toBe(R.canonicalRatio);
    expect(faulty.totalCollateralReduction).toBe(R.totalCollateralDepletion);
    expect(faulty.actualDebtReduction).toBe(R.debtExtinguished);
    expect(faulty.grossLossBaseWei).toBe(R.grossLossBaseWei);
    const gross =
      (BigInt(R.totalCollateralDepletion) * BigInt(R.canonicalRatio)) / 10n ** 18n -
      BigInt(R.debtExtinguished);
    expect(gross.toString()).toBe(R.grossLossBaseWei);
  });

  it('formats fixed-point values exactly', () => {
    expect(fixedPoint(R.faulty.healthFactor, 18, 6)).toBe('0.994396');
    expect(fixedPoint(R.grossLossBaseWei, 18, 4)).toBe('249.1874');
    expect(fixedPoint(R.faulty.adapterPrice, 8, 2)).toBe('2,462.76');
  });
});
