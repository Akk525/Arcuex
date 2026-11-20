import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { confirmCheckoutReceipt } from '../lib/procurement/checkout-recovery';
import { claimStatusLabel, settlementPresentation } from '../lib/claims/settlement-presentation';
import { currentPaymentReceipt } from '../lib/claims/payment-finality';

const hash = `0x${'ab'.repeat(32)}` as const;
const blockHash = `0x${'cd'.repeat(32)}` as const;
const alternate = `0x${'ee'.repeat(32)}` as const;

function fixture(status: 'success' | 'reverted') {
  const receipt = { status, transactionHash: hash, blockNumber: 100n, blockHash };
  return {
    reader: {
      waitForTransactionReceipt: vi.fn().mockResolvedValue(receipt),
      getChainId: vi.fn().mockResolvedValue(5042002),
      getBlockNumber: vi.fn().mockResolvedValue(102n),
      getBlock: vi.fn().mockResolvedValue({ hash: blockHash }),
    },
    receipt,
    confirm: vi.fn().mockResolvedValue(undefined),
  };
}

describe('checkout receipt recovery', () => {
  it('retries the original hash after a wallet timeout and a backend UNCONFIRMED response', async () => {
    const { reader, confirm } = fixture('success');
    reader.waitForTransactionReceipt.mockRejectedValueOnce(new Error('Timed out'));
    confirm.mockRejectedValueOnce(new Error('UNCONFIRMED'));
    await expect(confirmCheckoutReceipt(reader, hash, confirm)).rejects.toThrow('Timed out');
    await expect(confirmCheckoutReceipt(reader, hash, confirm)).rejects.toThrow('UNCONFIRMED');
    await expect(confirmCheckoutReceipt(reader, hash, confirm)).resolves.toBe('confirmed');
    expect(reader.waitForTransactionReceipt.mock.calls).toEqual(
      Array.from({ length: 3 }, () => [{ hash, confirmations: 3, timeout: 20_000 }]),
    );
    expect(confirm.mock.calls).toEqual([[hash], [hash]]);
  });

  it.each(['shallow', 'orphaned', 'wrong-chain'] as const)(
    'does not release the attempt on a %s revert',
    async (state) => {
      const { reader, confirm } = fixture('reverted');
      if (state === 'shallow') reader.getBlockNumber.mockResolvedValueOnce(101n);
      if (state === 'orphaned') reader.getBlock.mockResolvedValueOnce({ hash: alternate });
      if (state === 'wrong-chain') reader.getChainId.mockResolvedValueOnce(1);
      await expect(confirmCheckoutReceipt(reader, hash, confirm)).rejects.toThrow(/same hash/);
      await expect(confirmCheckoutReceipt(reader, hash, confirm)).resolves.toBe('reverted');
      expect(confirm).not.toHaveBeenCalled();
      expect(reader.getBlock.mock.calls).toEqual([
        [{ blockNumber: 100n }],
        [{ blockNumber: 100n }],
      ]);
    },
  );

  it('does not substitute a replacement transaction hash', async () => {
    const { reader, receipt, confirm } = fixture('success');
    reader.waitForTransactionReceipt.mockResolvedValueOnce({
      ...receipt,
      transactionHash: alternate,
    });
    await expect(confirmCheckoutReceipt(reader, hash, confirm)).rejects.toThrow(/replaced/);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('wires the wallet checkout to the recovery adapter before releasing the bind guard', () => {
    const source = readFileSync(
      join(
        process.env.ARCUEX_COMPAT_SNAPSHOT!,
        'apps/web/src/components/coverage/human-procurement-panel.tsx',
      ),
      'utf8',
    );
    const confirm = source.slice(
      source.indexOf('async function confirmPayment('),
      source.indexOf('async function payment('),
    );
    expect(confirm).toContain('confirmCheckoutReceipt');
    expect(confirm).toContain("if (outcome !== 'reverted') return;");
    expect(confirm.indexOf('clearBindAttempt')).toBeGreaterThan(
      confirm.indexOf("if (outcome !== 'reverted') return;"),
    );
  });
});

describe('settlement UI authority and finality', () => {
  it('uses the async v1 settlement projection for dashboard payments', () => {
    const dashboard = readFileSync(
      join(process.env.ARCUEX_COMPAT_SNAPSHOT!, 'apps/web/src/app/api/dashboard/route.ts'),
      'utf8',
    );
    expect(dashboard).toContain('await projectSettlementFinality');
    expect(dashboard).toMatch(/payment\.paymentFinality === 'confirmed'/);
    expect(dashboard).toMatch(
      /claim\.status === 'PAID' && !confirmedPayment \? 'SETTLEMENT_PENDING'/,
    );
    expect(dashboard).toContain('hasConfirmedSettlement: confirmedPayment');
  });

  it('shows intent and reorg states without requiring a signing or callback action', () => {
    expect(
      settlementPresentation({ status: 'SETTLEMENT_PENDING', blocked: false, canPrepare: false })
        .label,
    ).toBe('Intent prepared');
    expect(claimStatusLabel('SETTLEMENT_PENDING', null, 'reorged')).toBe('Payment reorged');
    expect(currentPaymentReceipt('PAID', 'not_paid', hash)).toBeUndefined();
    expect(currentPaymentReceipt('PAID', undefined, hash)).toBeUndefined();
    expect(currentPaymentReceipt('PAID', 'confirmed', hash, true)).toBeUndefined();
    expect(currentPaymentReceipt('PAID', 'confirmed', hash)).toBe(hash);
    const detail = readFileSync(
      join(
        process.env.ARCUEX_COMPAT_SNAPSHOT!,
        'apps/web/src/components/claims/claim-case-detail.tsx',
      ),
      'utf8',
    );
    expect(detail).not.toMatch(
      /authorize_settlement_signing|mark_paid|mark_failed|sendTransaction|signTransaction/,
    );
  });
});
