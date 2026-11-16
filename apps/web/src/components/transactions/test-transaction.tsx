'use client';

import {
  ARC_MIN_MAX_FEE_PER_GAS,
  ARC_TESTNET_FAUCET,
  explorerTxUrl,
} from '@arcuex/chain';
import { useState } from 'react';
import {
  type Hash,
  type TransactionReceipt,
  BaseError,
  UserRejectedRequestError,
} from 'viem';
import { useSendTransaction, useWaitForTransactionReceipt } from 'wagmi';
import { Panel } from '@/components/panel';
import { StatusBadge } from '@/components/status-badge';
import { useWalletStatus } from '@/hooks/use-wallet-status';
import { shortHash } from '@/lib/format';

/** Tiny self-transfer: 0.000001 USDC in native 18-decimal units (1e12 wei). */
const TEST_VALUE = 1_000_000_000_000n;

function classifyError(error: unknown): string {
  if (!error) return 'Unknown error';
  if (error instanceof UserRejectedRequestError) {
    return 'Transaction rejected in wallet.';
  }
  if (error instanceof BaseError) {
    const rejected = error.walk((e) => e instanceof UserRejectedRequestError);
    if (rejected) return 'Transaction rejected in wallet.';
    if (/insufficient funds|exceeds balance/i.test(error.shortMessage + error.message)) {
      return `Insufficient USDC for gas/value. Request testnet USDC from ${ARC_TESTNET_FAUCET}`;
    }
    if (/network|rpc|fetch/i.test(error.shortMessage + error.message)) {
      return `Network error: ${error.shortMessage}`;
    }
    return error.shortMessage || error.message;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

export function TestTransactionPanel() {
  const { address, uiStatus } = useWalletStatus();
  const [localError, setLocalError] = useState<string | null>(null);

  const {
    sendTransaction,
    data: txHash,
    isPending: isSending,
    reset,
    error: sendError,
  } = useSendTransaction();

  const {
    data: receipt,
    isLoading: isConfirming,
    isSuccess,
    isError: isReceiptError,
    error: receiptError,
  } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const ready = uiStatus === 'ready' && Boolean(address);
  const displayError =
    localError ||
    (sendError ? classifyError(sendError) : null) ||
    (isReceiptError ? classifyError(receiptError) : null);

  let statusLabel = 'Idle';
  let tone: 'neutral' | 'pending' | 'ok' | 'error' = 'neutral';
  if (isSending) {
    statusLabel = 'Awaiting wallet approval';
    tone = 'pending';
  } else if (isConfirming) {
    statusLabel = 'Confirming';
    tone = 'pending';
  } else if (isSuccess && receipt) {
    statusLabel = receipt.status === 'success' ? 'Confirmed' : 'Reverted';
    tone = receipt.status === 'success' ? 'ok' : 'error';
  } else if (displayError) {
    statusLabel = 'Error';
    tone = 'error';
  }

  return (
    <Panel title="Testnet transaction">
      <div className="space-y-3 text-sm text-zinc-700">
        <p>
          Sends a tiny self-transfer of native USDC on Arc Testnet. Requires explicit wallet
          approval. Never auto-sends.
        </p>

        <div className="flex items-center gap-2">
          <StatusBadge label={statusLabel} tone={tone} />
        </div>

        {!ready ? (
          <p className="text-zinc-500">Connect a wallet on Arc Testnet to enable this action.</p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!ready || isSending || isConfirming}
            onClick={() => {
              if (!address) return;
              setLocalError(null);
              reset();
              sendTransaction(
                {
                  to: address,
                  value: TEST_VALUE,
                  maxFeePerGas: ARC_MIN_MAX_FEE_PER_GAS,
                  maxPriorityFeePerGas: ARC_MIN_MAX_FEE_PER_GAS,
                },
                {
                  onError: (error) => setLocalError(classifyError(error)),
                },
              );
            }}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSending ? 'Confirm in wallet…' : isConfirming ? 'Confirming…' : 'Send test transfer'}
          </button>
          {txHash || displayError ? (
            <button
              type="button"
              onClick={() => {
                setLocalError(null);
                reset();
              }}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700"
            >
              Clear
            </button>
          ) : null}
        </div>

        <TxDetails hash={txHash} receipt={receipt} />

        {displayError ? <p className="text-rose-700">{displayError}</p> : null}
      </div>
    </Panel>
  );
}

function TxDetails({
  hash,
  receipt,
}: {
  hash?: Hash;
  receipt?: TransactionReceipt;
}) {
  if (!hash) return null;

  return (
    <dl className="grid grid-cols-1 gap-2 rounded-lg bg-zinc-50 p-3">
      <div>
        <dt className="text-xs uppercase tracking-wide text-zinc-500">Transaction hash</dt>
        <dd>
          <a
            className="font-mono text-xs text-sky-700 underline-offset-2 hover:underline"
            href={explorerTxUrl(hash)}
            target="_blank"
            rel="noreferrer"
          >
            {shortHash(hash)}
          </a>
        </dd>
      </div>
      {receipt ? (
        <>
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">Status</dt>
            <dd className="font-mono text-sm">{receipt.status}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">Block</dt>
            <dd className="font-mono text-sm">{receipt.blockNumber.toString()}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">Gas used</dt>
            <dd className="font-mono text-sm">{receipt.gasUsed.toString()}</dd>
          </div>
        </>
      ) : null}
    </dl>
  );
}
