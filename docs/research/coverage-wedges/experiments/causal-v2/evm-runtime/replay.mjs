// OFFLINE execution of captured transaction PRESTATE, not parent/block-end substitution.
import { createVM } from '@ethereumjs/vm';
import { Common, Mainnet, Hardfork } from '@ethereumjs/common';
import { createBlock } from '@ethereumjs/block';
import { Account, createAddressFromString, hexToBytes, bytesToHex } from '@ethereumjs/util';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const { encodeFunctionData, decodeFunctionResult, parseAbi, keccak256 } = createRequire(
  new URL('../../../../../../packages/chain/package.json', import.meta.url),
)('viem');
const input = JSON.parse(
  readFileSync(new URL('../historical/selected-liquidation.json', import.meta.url), 'utf8'),
);
const supplement = new URL('../historical/supplemental-code.json', import.meta.url);
const trace = {
  ...(existsSync(supplement) ? JSON.parse(readFileSync(supplement, 'utf8')).accounts : {}),
  ...input.prestateTrace,
};
const adapter = '0xe1d97bf61901b075e9626c8a2340a7de385861ef';
if (process.argv.includes('--omit-adapter-slot'))
  delete trace[adapter].storage['0x' + '0'.repeat(63) + '1'];
const pool = input.selected.address,
  owner = input.selectedDecoded.args.user;
const out = {
  mode: 'HISTORICAL',
  method: 'ethereumjs-prestate-witness-v1',
  transactionHash: input.selected.transactionHash,
  blockHash: input.selected.blockHash,
  transactionIndex: Number(BigInt(input.selected.transactionIndex)),
  hardfork: 'prague',
  results: [],
  missing: [],
};
async function run(counterfactual) {
  const common = new Common({ chain: Mainnet, hardfork: Hardfork.Prague });
  const vm = await createVM({ common });
  const sm = vm.stateManager;
  for (const [addr, record] of Object.entries(trace)) {
    const a = createAddressFromString(addr);
    await sm.putAccount(a, new Account(BigInt(record.nonce ?? 0), BigInt(record.balance ?? '0x0')));
    if (record.code) await sm.putCode(a, hexToBytes(record.code));
    for (const [slot, value] of Object.entries(record.storage ?? {}))
      await sm.putStorage(a, hexToBytes(slot), hexToBytes(value));
  }
  const storage = sm.getStorage.bind(sm),
    getCode = sm.getCode.bind(sm);
  sm.getStorage = async (address, key) => {
    const a = address.toString().toLowerCase(),
      k = bytesToHex(key).toLowerCase();
    if (!(k in (trace[a]?.storage ?? {}))) {
      out.missing.push({ address: a, slot: k });
      throw Error('INCOMPLETE_STORAGE_WITNESS');
    }
    return storage(address, key);
  };
  sm.getCode = async (address) => {
    const a = address.toString().toLowerCase();
    if (!(a in trace)) {
      out.missing.push({ address: a, kind: 'code' });
      throw Error('INCOMPLETE_CODE_WITNESS');
    }
    return getCode(address);
  };
  const header = input.block;
  const block = createBlock(
    {
      header: {
        number: BigInt(header.number),
        timestamp: BigInt(header.timestamp),
        gasLimit: BigInt(header.gasLimit),
        baseFeePerGas: BigInt(header.baseFeePerGas),
        coinbase: header.miner,
        mixHash: header.mixHash,
      },
    },
    { common },
  );
  async function call(to, sig, args = []) {
    const abi = parseAbi([`function ${sig}`]),
      name = sig.split('(')[0];
    const result = await vm.evm.runCall({
      to: createAddressFromString(to),
      caller: createAddressFromString(input.transaction.from),
      data: hexToBytes(encodeFunctionData({ abi, functionName: name, args })),
      gasLimit: 30000000n,
      isStatic: true,
      block,
    });
    if (result.execResult.exceptionError)
      throw Error(String(result.execResult.exceptionError.error));
    return decodeFunctionResult({
      abi,
      functionName: name,
      data: bytesToHex(result.execResult.returnValue),
    });
  }
  const ratio = await call(adapter, 'getRatio() view returns (int256)');
  if (counterfactual) {
    // Sourcify deployed storage layout: slot1 uint104 snapshot ratio at offset0.
    // Increase ONLY this field enough to uncap; timestamp/growth/base price untouched.
    const slot = '0x' + '0'.repeat(63) + '1';
    const old = BigInt(trace[adapter].storage[slot]);
    const mask = (1n << 104n) - 1n;
    const corrected = (old & ~mask) | ratio;
    await sm.putStorage(
      createAddressFromString(adapter),
      hexToBytes(slot),
      hexToBytes('0x' + corrected.toString(16).padStart(64, '0')),
    );
    out.intervention = {
      address: adapter,
      slot,
      old: old.toString(),
      new: corrected.toString(),
      field: '_snapshotRatio',
      replacement: ratio.toString(),
    };
  }
  const result = {
    counterfactual,
    canonicalRatio: ratio.toString(),
    adapterPrice: (await call(adapter, 'latestAnswer() view returns (int256)')).toString(),
    account: (
      await call(
        pool,
        'getUserAccountData(address) view returns (uint256,uint256,uint256,uint256,uint256,uint256)',
        [owner],
      )
    ).map(String),
    collateralBalance: (
      await call(
        '0x0b925ed163218f6662a35e0f0371ac234f9e9371',
        'balanceOf(address) view returns (uint256)',
        [owner],
      )
    ).toString(),
  };
  async function debtOf() {
    const scaled = await call(
      '0xea51d7853eefb32b6ee06b1c12e6dcca88be0ffe',
      'scaledBalanceOf(address) view returns (uint256)',
      [owner],
    );
    const index = await call(
      pool,
      'getReserveNormalizedVariableDebt(address) view returns (uint256)',
      ['0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'],
    );
    return {
      scaled: scaled.toString(),
      index: index.toString(),
      balance: ((scaled * index + 10n ** 27n / 2n) / 10n ** 27n).toString(),
    };
  }
  result.debtBeforeDetails = await debtOf();
  result.debtBalance = result.debtBeforeDetails.balance;
  if (!counterfactual) {
    const tx = input.transaction;
    const executed = await vm.evm.runCall({
      to: createAddressFromString(tx.to),
      caller: createAddressFromString(tx.from),
      origin: createAddressFromString(tx.from),
      data: hexToBytes(tx.input),
      value: BigInt(tx.value),
      gasLimit: BigInt(tx.gas),
      gasPrice: BigInt(input.receipt.effectiveGasPrice),
      block,
    });
    result.executionError = executed.execResult.exceptionError?.error ?? null;
    const logs = (executed.execResult.logs ?? []).map(([address, topics, data]) => ({
      address: bytesToHex(address),
      topics: topics.map(bytesToHex),
      data: bytesToHex(data),
    }));
    result.replayedLogs = logs;
    result.exactReceiptLogMatch =
      JSON.stringify(logs) ===
      JSON.stringify(
        input.receipt.logs.map(({ address, topics, data }) => ({ address, topics, data })),
      );
    result.collateralAfter = (
      await call(
        '0x0b925ed163218f6662a35e0f0371ac234f9e9371',
        'balanceOf(address) view returns (uint256)',
        [owner],
      )
    ).toString();
    result.debtAfterDetails = await debtOf();
    result.debtAfter = result.debtAfterDetails.balance;
    result.totalCollateralReduction = (
      BigInt(result.collateralBalance) - BigInt(result.collateralAfter)
    ).toString();
    result.actualDebtReduction = (BigInt(result.debtBalance) - BigInt(result.debtAfter)).toString();
    result.grossLossBaseWei = (
      (BigInt(result.totalCollateralReduction) * ratio) / 10n ** 18n -
      BigInt(result.actualDebtReduction)
    ).toString();
  } else {
    const tx = input.transaction;
    const attempted = await vm.evm.runCall({
      to: createAddressFromString(tx.to),
      caller: createAddressFromString(tx.from),
      origin: createAddressFromString(tx.from),
      data: hexToBytes(tx.input),
      value: BigInt(tx.value),
      gasLimit: BigInt(tx.gas),
      gasPrice: BigInt(input.receipt.effectiveGasPrice),
      block,
    });
    result.executionError = attempted.execResult.exceptionError?.error ?? null;
    result.returnData = bytesToHex(attempted.execResult.returnValue);
    result.logCount = attempted.execResult.logs?.length ?? 0;
  }
  out.results.push(result);
  out.adapterRuntimeKeccak = keccak256(trace[adapter].code);
}
try {
  await run(false);
  await run(true);
  out.status = out.missing.length ? 'REVIEW' : 'REPLAY_COMPLETED';
} catch (e) {
  out.status = 'REVIEW';
  out.blocker = String(e);
}
if (!process.argv.includes('--check'))
  writeFileSync(
    new URL('../historical/offline-replay.json', import.meta.url),
    JSON.stringify(out, null, 2) + '\n',
  );
console.log(
  JSON.stringify(
    out,
    (key, value) =>
      key === 'replayedLogs' ? `preserved ${value.length} logs in output artifact` : value,
    2,
  ),
);
