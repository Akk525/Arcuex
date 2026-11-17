import { describe, expect, it } from 'vitest';
import { parseDeploymentManifest } from './deployment-manifest';

describe('parseDeploymentManifest', () => {
  it('accepts the Arc Testnet pool record shape', () => {
    const m = parseDeploymentManifest({
      network: 'arc-testnet',
      chainId: 5042002,
      usdc: '0x3600000000000000000000000000000000000000',
      insurancePool: '0x6657974EEdF488380251bDD95A7FFfb0D456E49E',
      claimsAuthoritySet: true,
      feeRecipientSet: true,
      rpc: 'https://rpc.quicknode.testnet.arc.io',
      verifiedAt: '2026-11-17T05:49:14Z',
    });
    expect(m.insurancePool.toLowerCase()).toBe(
      '0x6657974eedf488380251bdd95a7fffb0d456e49e',
    );
  });

  it('rejects wrong chain and wrong USDC', () => {
    expect(() =>
      parseDeploymentManifest({
        network: 'arc-testnet',
        chainId: 1,
        usdc: '0x3600000000000000000000000000000000000000',
        insurancePool: '0x6657974EEdF488380251bDD95A7FFfb0D456E49E',
        claimsAuthoritySet: true,
        feeRecipientSet: true,
        rpc: 'https://rpc.quicknode.testnet.arc.io',
        verifiedAt: 'x',
      }),
    ).toThrow(/chainId/);

    expect(() =>
      parseDeploymentManifest({
        network: 'arc-testnet',
        chainId: 5042002,
        usdc: '0x1111111111111111111111111111111111111111',
        insurancePool: '0x6657974EEdF488380251bDD95A7FFfb0D456E49E',
        claimsAuthoritySet: true,
        feeRecipientSet: true,
        rpc: 'https://rpc.quicknode.testnet.arc.io',
        verifiedAt: 'x',
      }),
    ).toThrow(/USDC/);
  });
});
