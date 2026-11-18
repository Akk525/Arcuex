import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
const { encodeFunctionData, decodeFunctionResult, parseAbi, keccak256, toHex, pad, decodeEventLog } = createRequire(resolve('packages/chain/package.json'))('viem');
const endpoint = 'https://eth.drpc.org';
const output = { endpoint, retrievedAt: new Date().toISOString(), calls: [] };
const adapter = '0xe1D97bF61901B075E9626c8A2340a7De385861Ef';
const wrapper = '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0';
const pools = ['0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2','0x4e033931ad43597d96D6bcc25c280717730B58B1'];
const abi = JSON.parse(readFileSync('/private/tmp/arcuex-public-source-cache/sourcify.json','utf8')).abi;
async function rpc(method,params) {
  const request={jsonrpc:'2.0',id:output.calls.length+1,method,params};
  const row={request}; output.calls.push(row);
  try {
    const res=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(15000)});
    row.httpStatus=res.status;row.response=await res.json();
    if (row.response.error) throw Error(JSON.stringify(row.response.error));
    return row.response.result;
  } catch(e) {row.error=String(e);throw e;}
}
async function call(to,signature,args,n) {
  const a=parseAbi([`function ${signature}`]); const name=signature.split('(')[0];
  const raw=await rpc('eth_call',[{to,data:encodeFunctionData({abi:a,functionName:name,args})},toHex(n)]);
  return decodeFunctionResult({abi:a,functionName:name,data:raw});
}
const liqAbi=parseAbi(['event LiquidationCall(address indexed collateralAsset,address indexed debtAsset,address indexed user,uint256 debtToCover,uint256 liquidatedCollateralAmount,address liquidator,bool receiveAToken)']);
try {
  const start=24623353, end=24630504;
  const initial=await call(adapter,'getSnapshotTimestamp() view returns (uint256)',[],start);
  let lo=start,hi=end;
  while(lo<hi) {
    const mid=Math.floor((lo+hi)/2);
    const value=await call(adapter,'getSnapshotTimestamp() view returns (uint256)',[],mid);
    if(value===initial)lo=mid+1;else hi=mid;
  }
  output.firstChangedBlock=lo;
  console.log('first changed block',lo);
  output.configurationLogs=await rpc('eth_getLogs',[{address:adapter,fromBlock:toHex(lo),toBlock:toHex(lo)}]);
  output.decodedConfiguration=output.configurationLogs.map(log=>decodeEventLog({abi,data:log.data,topics:log.topics}));
  const topic=keccak256(toHex('LiquidationCall(address,address,address,uint256,uint256,address,bool)'));
  output.liquidations=await rpc('eth_getLogs',[{address:pools,fromBlock:toHex(lo),toBlock:toHex(lo+49),topics:[topic,pad(wrapper.toLowerCase(),{size:32})]}]);
  console.log('nearby liquidations',output.liquidations.length);
  output.decodedLiquidations=output.liquidations.map(log=>decodeEventLog({abi:liqAbi,data:log.data,topics:log.topics}));
  if(output.liquidations.length) {
    const log=output.liquidations[0],decoded=output.decodedLiquidations[0];
    output.selected=log;output.selectedDecoded=decoded;
    const n=Number(BigInt(log.blockNumber));
    output.receipt=await rpc('eth_getTransactionReceipt',[log.transactionHash]);
    output.transaction=await rpc('eth_getTransactionByHash',[log.transactionHash]);
    output.block=await rpc('eth_getBlockByNumber',[log.blockNumber,false]);
    output.observations=[];
    for(const b of [lo-1,lo,n]) for(const sig of ['getSnapshotRatio() view returns (uint256)','getSnapshotTimestamp() view returns (uint256)','getMaxRatioGrowthPerSecond() view returns (uint256)','getRatio() view returns (int256)','latestAnswer() view returns (int256)','BASE_TO_USD_AGGREGATOR() view returns (address)']) {
      try {output.observations.push({block:b,signature:sig,value:await call(adapter,sig,[],b)});}
      catch(e){output.observations.push({block:b,signature:sig,error:String(e)});}
    }
    output.accounts=[];
    for(const b of [n-1,n]) {
      try {output.accounts.push({block:b,value:await call(log.address,'getUserAccountData(address) view returns (uint256,uint256,uint256,uint256,uint256,uint256)',[decoded.args.user],b)});}
      catch(e){output.accounts.push({block:b,error:String(e)});}
    }
    try {output.prestateTrace=await rpc('debug_traceTransaction',[log.transactionHash,{tracer:'prestateTracer',tracerConfig:{diffMode:false}}]);}
    catch(e) {output.traceBlocker=String(e);}
  }
} catch(e) {output.blocker=String(e); console.log('BLOCKED',String(e));}
finally { writeFileSync(new URL('./historical/selected-liquidation.json',import.meta.url),JSON.stringify(output,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n'); }
