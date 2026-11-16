export {
  ARC_MIN_MAX_FEE_PER_GAS,
  ARC_NATIVE_DECIMALS,
  ARC_QUICKNODE_TESTNET_RPC_HTTP,
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_EXPLORER,
  ARC_TESTNET_FAUCET,
  ARC_TESTNET_RPC_HTTP,
  ARC_TESTNET_RPC_WS,
  ARC_USDC_ERC20_ADDRESS,
  ARC_USDC_ERC20_DECIMALS,
  arcTestnet,
  getArcTestnetConfig,
  type ArcNetworkConfig,
} from './config';

export {
  createArcPublicClient,
  getChainId,
  getLatestBlockNumber,
  getNetworkHealth,
  getTransactionReceipt,
  getUsdcBalance,
  type NetworkHealth,
  type UsdcBalance,
} from './client';

export { explorerAddressUrl, explorerBlockUrl, explorerTxUrl } from './explorer';
