'use client';

import { ARC_TESTNET_CHAIN_ID } from '@arcuex/chain';
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from 'wagmi';

export type WalletUiStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'wrong_network'
  | 'switching'
  | 'ready';

export type WalletStatusApi = {
  address: `0x${string}` | undefined;
  chainId: number;
  uiStatus: WalletUiStatus;
  hasInjectedConnector: boolean;
  connectError: Error | null;
  switchError: Error | null;
  connectInjected: () => void;
  disconnect: () => void;
  switchToArc: () => void;
};

export function useWalletStatus(): WalletStatusApi {
  const { address, isConnected, isConnecting, isReconnecting } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, error: connectError, isPending: isConnectPending } =
    useConnect();
  const { disconnect } = useDisconnect();
  const {
    switchChain,
    isPending: isSwitchPending,
    error: switchError,
  } = useSwitchChain();

  const injected = connectors.find((c) => c.id === 'injected') ?? connectors[0];

  let uiStatus: WalletUiStatus = 'disconnected';
  if (isConnecting || isReconnecting || isConnectPending) {
    uiStatus = 'connecting';
  } else if (isSwitchPending) {
    uiStatus = 'switching';
  } else if (isConnected && address) {
    if (chainId !== ARC_TESTNET_CHAIN_ID) {
      uiStatus = 'wrong_network';
    } else {
      uiStatus = 'ready';
    }
  } else if (isConnected) {
    uiStatus = 'connected';
  }

  return {
    address,
    chainId,
    uiStatus,
    hasInjectedConnector: Boolean(injected),
    connectError: connectError ?? null,
    switchError: switchError ?? null,
    connectInjected: () => {
      if (!injected) {
        throw new Error('No injected EVM wallet detected');
      }
      connect({ connector: injected, chainId: ARC_TESTNET_CHAIN_ID });
    },
    disconnect: () => {
      disconnect();
    },
    switchToArc: () => {
      switchChain({ chainId: ARC_TESTNET_CHAIN_ID });
    },
  };
}

export function walletStatusLabel(status: WalletUiStatus): string {
  switch (status) {
    case 'disconnected':
      return 'Disconnected';
    case 'connecting':
      return 'Connecting';
    case 'connected':
      return 'Connected';
    case 'wrong_network':
      return 'Wrong Network';
    case 'switching':
      return 'Switching';
    case 'ready':
      return 'Ready';
  }
}
