import { describe, expect, it } from 'vitest';
import {
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_RPC_HTTP,
  ARC_USDC_ERC20_ADDRESS,
  arcTestnet,
  getArcTestnetConfig,
} from './config';
import { explorerAddressUrl, explorerBlockUrl, explorerTxUrl } from './explorer';

describe('arc testnet config', () => {
  it('uses official chain id and rpc defaults', () => {
    expect(ARC_TESTNET_CHAIN_ID).toBe(5042002);
    expect(arcTestnet.id).toBe(5042002);
    expect(arcTestnet.testnet).toBe(true);
    expect(arcTestnet.nativeCurrency.symbol).toBe('USDC');
    expect(getArcTestnetConfig().rpcUrl).toBe(ARC_TESTNET_RPC_HTTP);
    expect(ARC_USDC_ERC20_ADDRESS).toBe('0x3600000000000000000000000000000000000000');
  });

  it('builds explorer urls', () => {
    const address = '0x3600000000000000000000000000000000000000';
    const hash =
      '0x1111111111111111111111111111111111111111111111111111111111111111' as const;
    expect(explorerAddressUrl(address)).toContain(`/address/${address}`);
    expect(explorerTxUrl(hash)).toContain(`/tx/${hash}`);
    expect(explorerBlockUrl(42n)).toContain('/block/42');
  });
});
