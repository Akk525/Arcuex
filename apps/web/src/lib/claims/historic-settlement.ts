/**
 * Verified Arc Testnet settlement snapshot (read-only).
 * Source: docs/verification/2026-11-17-settlement-readonly.json
 * Incident evaluation remains a synthetic fixture — not independent loss evidence.
 */
export const HISTORIC_TESTNET_SETTLEMENT = {
  dataClass: 'chain_verified_receipt' as const,
  notice:
    'Read-only verified Arc Testnet ClaimSettled receipt. Incident evaluation was a synthetic fixture, not independently verified real-world loss. No broadcast from this UI.',
  verifiedAt: '2026-11-17T17:10:15.117Z',
  explorerUrl:
    'https://explorer.testnet.arc.io/tx/0x83130e95f5dfb2209a5382524a1ef749dd2f90a605fcf892cf80b333ef3d89c7',
  pool: '0x6657974EEdF488380251bDD95A7FFfb0D456E49E',
  chainId: 5042002,
  txHash: '0x83130e95f5dfb2209a5382524a1ef749dd2f90a605fcf892cf80b333ef3d89c7',
  blockNumber: '72712674',
  amountMicros: '1000000',
  amountUsdc: '1.000000',
  beneficiary: '0x2E2Da4311Ea87Cfa31c372D59B4A0d567c15D760',
  claimsAuthority: '0xA6876A60748c638f66b911aaEe03Bd712D85AF36',
  policyIdBytes32: '0x709b9ba707bc439385d46a013efde14b58160bf9d4583f60aa8b932d25ac4f74',
  claimIdBytes32: '0x90651bb69988d9da2cefb04cacb0c066cbd029e0c6bec62ad9a0792e59b7a3c3',
  lossKey: '0x7a6dfe6606b3c2651a98c69e36d0f4e806ae77f16dea70adcd342ab8a8fa121c',
  checks: {
    receiptSuccess: true,
    authority: true,
    transfer: true,
    beneficiaryDelta: true,
    currentSettled: true,
  },
} as const;
