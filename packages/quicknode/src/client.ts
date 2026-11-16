import {
  ARC_QUICKNODE_TESTNET_RPC_HTTP,
  ARC_TESTNET_CHAIN_ID,
  createArcPublicClient,
} from '@arcuex/chain';
import {
  type Hash,
  type PublicClient,
  type Transport,
  type TransactionReceipt,
  http,
} from 'viem';

export type QuickNodeClientOptions = {
  rpcUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  transport?: Transport;
  publicClient?: PublicClient;
};

export class QuickNodeError extends Error {
  readonly code: 'TIMEOUT' | 'RPC' | 'RETRY_EXHAUSTED' | 'UNEXPECTED_CHAIN';
  override readonly cause?: unknown;

  constructor(
    code: QuickNodeError['code'],
    message: string,
    cause?: unknown,
  ) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'QuickNodeError';
    this.code = code;
    this.cause = cause;
  }
}

export type QuickNodeBlockSummary = {
  number: bigint;
  hash: Hash | null;
  timestamp: bigint;
  transactionCount: number;
};

export type QuickNodeStatus = {
  ok: boolean;
  rpcUrl: string;
  chainId: number;
  blockNumber: bigint | null;
  latencyMs: number;
  error?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class QuickNodeClient {
  readonly rpcUrl: string;
  private readonly client: PublicClient;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;

  constructor(options: QuickNodeClientOptions = {}) {
    this.rpcUrl = options.rpcUrl ?? ARC_QUICKNODE_TESTNET_RPC_HTTP;
    this.maxRetries = options.maxRetries ?? 2;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.client =
      options.publicClient ??
      createArcPublicClient({
        rpcUrl: this.rpcUrl,
        transport:
          options.transport ??
          http(this.rpcUrl, {
            timeout: this.timeoutMs,
            retryCount: 0,
          }),
      });
  }

  private async withRetry<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.maxRetries) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        const isTimeout = /timeout|timed out|AbortError/i.test(message);
        if (attempt === this.maxRetries) {
          throw new QuickNodeError(
            isTimeout ? 'TIMEOUT' : 'RETRY_EXHAUSTED',
            `${operation} failed after ${attempt + 1} attempt(s): ${message}`,
            error,
          );
        }
        await sleep(150 * 2 ** attempt);
        attempt += 1;
      }
    }

    throw new QuickNodeError('RETRY_EXHAUSTED', `${operation} failed`, lastError);
  }

  async getStatus(): Promise<QuickNodeStatus> {
    const started = Date.now();
    try {
      const [chainId, blockNumber] = await this.withRetry('getStatus', async () => {
        const [id, number] = await Promise.all([
          this.client.getChainId(),
          this.client.getBlockNumber(),
        ]);
        return [id, number] as const;
      });

      const ok = chainId === ARC_TESTNET_CHAIN_ID;
      return {
        ok,
        rpcUrl: this.rpcUrl,
        chainId,
        blockNumber,
        latencyMs: Date.now() - started,
        ...(ok
          ? {}
          : {
              error: `Unexpected chain ID ${chainId}; expected ${ARC_TESTNET_CHAIN_ID}`,
            }),
      };
    } catch (error) {
      return {
        ok: false,
        rpcUrl: this.rpcUrl,
        chainId: 0,
        blockNumber: null,
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : 'Unknown QuickNode error',
      };
    }
  }

  async getBlockNumber(): Promise<bigint> {
    return this.withRetry('getBlockNumber', () => this.client.getBlockNumber());
  }

  async getBlock(blockNumber?: bigint): Promise<QuickNodeBlockSummary> {
    return this.withRetry('getBlock', async () => {
      const block = await this.client.getBlock({
        ...(blockNumber === undefined
          ? { blockTag: 'latest' as const }
          : { blockNumber }),
        includeTransactions: false,
      });

      return {
        number: block.number,
        hash: block.hash,
        timestamp: block.timestamp,
        transactionCount: block.transactions.length,
      };
    });
  }

  async getTransactionReceipt(hash: Hash): Promise<TransactionReceipt | null> {
    return this.withRetry('getTransactionReceipt', () =>
      this.client.getTransactionReceipt({ hash }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        if (/not found|could not be found/i.test(message)) {
          return null;
        }
        throw error;
      }),
    );
  }
}

export function createQuickNodeClient(options?: QuickNodeClientOptions): QuickNodeClient {
  return new QuickNodeClient(options);
}
