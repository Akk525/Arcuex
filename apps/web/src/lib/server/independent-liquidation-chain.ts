import { decodeEventLog, keccak256, parseAbi, toEventSelector, type PublicClient } from 'viem';
import { ARC_USDC_ERC20_ADDRESS } from '@arcuex/chain';
import type { IndependentEvidenceSource } from '@arcuex/insurance';
import { procurementClient } from './procurement-chain';

const liquidationAbi = parseAbi([
  'event CoveredLiquidation(bytes32 indexed positionId, address indexed owner, address indexed liquidator, address asset, uint256 seizedUsdcMicros, uint256 extinguishedDebtUsdcMicros, uint256 adapterRatioBps, uint256 liquidationThresholdBps)',
]);
const liquidationTopic = toEventSelector(liquidationAbi[0]);
const tokenAbi = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);

export function independentLiquidationSource(
  client: PublicClient = procurementClient(),
): IndependentEvidenceSource {
  return {
    async readLiquidation(transactionHash, logIndex, profile) {
      const [chainId, head, receipt] = await Promise.all([
        client.getChainId(),
        client.getBlockNumber(),
        client.getTransactionReceipt({ hash: transactionHash }),
      ]);
      if (
        chainId !== 5042002 ||
        receipt.transactionHash !== transactionHash ||
        receipt.status !== 'success' ||
        receipt.to?.toLowerCase() !== profile.emitter ||
        head < receipt.blockNumber + 2n
      )
        throw new Error('Unsupported liquidation receipt');
      const [anchor, runtimeCode] = await Promise.all([
        client.getBlock({ blockNumber: receipt.blockNumber }),
        client.getCode({ address: profile.emitter, blockNumber: receipt.blockNumber }),
      ]);
      const liquidations = receipt.logs.filter(
        (item) =>
          item.address.toLowerCase() === profile.emitter && item.topics[0] === liquidationTopic,
      );
      const [log] = liquidations;
      if (
        anchor.hash !== receipt.blockHash ||
        !runtimeCode ||
        runtimeCode === '0x' ||
        keccak256(runtimeCode) !== profile.runtimeCodeHash ||
        liquidations.length !== 1 ||
        !log ||
        log.logIndex !== logIndex ||
        log.address.toLowerCase() !== profile.emitter ||
        log.removed !== false ||
        log.blockNumber !== receipt.blockNumber ||
        log.blockHash !== receipt.blockHash ||
        log.transactionHash !== transactionHash
      )
        throw new Error('Noncanonical or unsupported liquidation event');
      const decoded = decodeEventLog({ abi: liquidationAbi, topics: log.topics, data: log.data });
      const a = decoded.args;
      if (
        a.asset.toLowerCase() !== ARC_USDC_ERC20_ADDRESS.toLowerCase() ||
        a.owner.toLowerCase() === a.liquidator.toLowerCase()
      )
        throw new Error('Unsupported asset or self-liquidation');
      const transfers = receipt.logs.filter((item) => {
        if (
          item.address.toLowerCase() !== ARC_USDC_ERC20_ADDRESS.toLowerCase() ||
          item.removed !== false ||
          item.blockNumber !== receipt.blockNumber ||
          item.blockHash !== receipt.blockHash ||
          item.transactionHash !== transactionHash
        )
          return false;
        try {
          const { args } = decodeEventLog({ abi: tokenAbi, topics: item.topics, data: item.data });
          return (
            args.from.toLowerCase() === profile.emitter &&
            args.to.toLowerCase() === a.liquidator.toLowerCase() &&
            args.value === a.seizedUsdcMicros
          );
        } catch {
          return false;
        }
      });
      const checkedAgain = await client.getBlock({ blockNumber: receipt.blockNumber });
      if (transfers.length !== 1 || checkedAgain.hash !== anchor.hash)
        throw new Error('Matching collateral transfer or canonical block absent');
      return {
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        blockTimestamp: anchor.timestamp,
        positionId: a.positionId,
        owner: a.owner.toLowerCase(),
        seizedUsdcMicros: a.seizedUsdcMicros,
        extinguishedDebtUsdcMicros: a.extinguishedDebtUsdcMicros,
        adapterRatioBps: a.adapterRatioBps,
        liquidationThresholdBps: a.liquidationThresholdBps,
      };
    },
  };
}
