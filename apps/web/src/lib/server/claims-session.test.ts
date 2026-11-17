import { privateKeyToAccount } from 'viem/accounts';
import { describe, expect, it } from 'vitest';
import { InsuranceRepository, openDatabase } from '@arcuex/persistence';
import {
  issueClaimsNonce,
  loadPrincipalFromSession,
  verifyWalletAndCreateSession,
} from './claims-session';

describe('claims wallet sessions', () => {
  it('issues single-use nonces and binds session to signed wallet', async () => {
    const repo = new InsuranceRepository(openDatabase(':memory:'));
    const account = privateKeyToAccount(
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    );
    const issued = issueClaimsNonce(repo, account.address);
    const signature = await account.signMessage({ message: issued.message });
    const session = await verifyWalletAndCreateSession(repo, {
      wallet: account.address,
      nonce: issued.nonce,
      signature,
    });
    expect(session.principal.role).toBe('claimant');
    expect(session.principal.walletAddress?.toLowerCase()).toBe(account.address.toLowerCase());

    await expect(
      verifyWalletAndCreateSession(repo, {
        wallet: account.address,
        nonce: issued.nonce,
        signature,
      }),
    ).rejects.toThrow(/used|Unknown/i);

    const loaded = loadPrincipalFromSession(repo, session.sessionId);
    expect(loaded?.role).toBe('claimant');
  });

  it('does not grant authority from wallet session alone', async () => {
    const repo = new InsuranceRepository(openDatabase(':memory:'));
    const account = privateKeyToAccount(
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    );
    const issued = issueClaimsNonce(repo, account.address);
    const signature = await account.signMessage({ message: issued.message });
    const session = await verifyWalletAndCreateSession(repo, {
      wallet: account.address,
      nonce: issued.nonce,
      signature,
    });
    expect(session.principal.role).toBe('claimant');
    expect(session.principal.allowSyntheticSettlementPrep).toBeFalsy();
  });
});
