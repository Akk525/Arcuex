'use client';

import {
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_FAUCET,
  ARC_USDC_ERC20_ADDRESS,
  explorerAddressUrl,
} from '@arcuex/chain';
import { erc20Abi, formatUnits } from 'viem';
import { useReadContract } from 'wagmi';
import { Panel } from '@/components/panel';
import { StatusBadge } from '@/components/status-badge';
import { useWalletStatus, walletStatusLabel } from '@/hooks/use-wallet-status';
import { shortAddress } from '@/lib/format';

function statusTone(status: ReturnType<typeof useWalletStatus>['uiStatus']) {
  switch (status) {
    case 'ready':
      return 'ok' as const;
    case 'connecting':
    case 'switching':
      return 'pending' as const;
    case 'wrong_network':
      return 'warn' as const;
    case 'connected':
      return 'neutral' as const;
    default:
      return 'neutral' as const;
  }
}

export function WalletPanel() {
  const {
    address,
    chainId,
    uiStatus,
    hasInjectedConnector,
    connectError,
    switchError,
    connectInjected,
    disconnect,
    switchToArc,
  } = useWalletStatus();

  const balanceQuery = useReadContract({
    address: ARC_USDC_ERC20_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address) && uiStatus === 'ready',
      refetchInterval: 15_000,
    },
  });

  const usdc =
    balanceQuery.data !== undefined
      ? formatUnits(balanceQuery.data, 6)
      : null;

  return (
    <Panel title="Wallet">
      <div className="space-y-3 text-sm text-zinc-700">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label={walletStatusLabel(uiStatus)} tone={statusTone(uiStatus)} />
          {chainId ? (
            <span className="font-mono text-xs text-zinc-500">chain {chainId}</span>
          ) : null}
        </div>

        {uiStatus === 'disconnected' ? (
          <p className="text-zinc-500">
            Connect an injected EVM wallet (MetaMask, Rabby, etc.). No private keys are collected.
          </p>
        ) : null}

        {!hasInjectedConnector ? (
          <p className="text-amber-800">
            No injected wallet provider detected. Install a browser extension wallet and reload.
          </p>
        ) : null}

        {address ? (
          <dl className="grid grid-cols-1 gap-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Address</dt>
              <dd>
                <a
                  className="font-mono text-sky-700 underline-offset-2 hover:underline"
                  href={explorerAddressUrl(address)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {shortAddress(address)}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">USDC balance</dt>
              <dd className="font-mono">
                {uiStatus !== 'ready'
                  ? '—'
                  : balanceQuery.isLoading
                    ? 'Loading…'
                    : balanceQuery.isError
                      ? 'Error reading balance'
                      : `${usdc} USDC`}
              </dd>
            </div>
          </dl>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {uiStatus === 'disconnected' || uiStatus === 'connecting' ? (
            <button
              type="button"
              disabled={!hasInjectedConnector || uiStatus === 'connecting'}
              onClick={() => {
                try {
                  connectInjected();
                } catch (error) {
                  console.error(error);
                }
              }}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uiStatus === 'connecting' ? 'Connecting…' : 'Connect wallet'}
            </button>
          ) : null}

          {uiStatus === 'wrong_network' || uiStatus === 'switching' ? (
            <button
              type="button"
              disabled={uiStatus === 'switching'}
              onClick={() => switchToArc()}
              className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {uiStatus === 'switching'
                ? 'Switching…'
                : `Switch to Arc Testnet (${ARC_TESTNET_CHAIN_ID})`}
            </button>
          ) : null}

          {address ? (
            <button
              type="button"
              onClick={() => disconnect()}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700"
            >
              Disconnect
            </button>
          ) : null}

          <a
            href={ARC_TESTNET_FAUCET}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700"
          >
            Faucet
          </a>
        </div>

        {connectError ? (
          <p className="text-rose-700">
            {connectError.message.includes('rejected')
              ? 'Connection rejected in wallet.'
              : connectError.message}
          </p>
        ) : null}
        {switchError ? (
          <p className="text-rose-700">
            {switchError.message.includes('rejected')
              ? 'Network switch rejected in wallet.'
              : switchError.message}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
