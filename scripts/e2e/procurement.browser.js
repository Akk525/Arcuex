async (page) => {
  // Run with the Playwright browser tool's filename option. All wallet/RPC/API calls are mocked.
  const owner='0x1111111111111111111111111111111111111111';
  const start=Math.floor(Date.now()/1000);
  const agent={id:'e2e-agent',owner,signer:owner,label:'test-agent',exposure:{chainId:5042002,protocol:'arcuex-synthetic-lending-v1',position:'test-position',notionalMicros:'10000000'}};
  const terms={version:1,policyId:'e2e-policy',quoteId:'e2e-quote',productCode:'ARC_ORACLE_LIQUIDATION_DEMO_V1',agentId:agent.id,owner,beneficiary:owner,exposure:agent.exposure,eligibility:{positionHealthy:true,noKnownIncident:true,syntheticOnly:true,ownerAttestsControl:true},premiumMicros:'10000',limitMicros:'1000000',deductibleMicros:'100000',effectiveAt:start+900,expiresAt:start+86400,quoteExpiresAt:start+600,insuredEvent:'Synthetic oracle adapter causes wrongful liquidation.',exclusions:['Pre-existing incidents'],synthetic:true};
  const quote={terms,digest:'0x'+'ab'.repeat(32)};
  const policy={...quote,state:'prepared',payer:owner,delegationId:null,bindTx:null,confirmedAt:null};
  await page.addInitScript(({owner})=>{
    sessionStorage.clear();
    localStorage.clear();
    window.__mockWalletCalls=[];
    let sends=0;
    Object.defineProperty(window,'ethereum',{configurable:true,value:{isMetaMask:true,on(){},removeListener(){},async request({method}){
      window.__mockWalletCalls.push(method);
      if(method==='eth_accounts'||method==='eth_requestAccounts')return [owner];
      if(method==='eth_chainId')return '0x4cef52';
      if(method==='wallet_requestPermissions')return [{parentCapability:'eth_accounts'}];
      if(method==='wallet_getPermissions')return [{parentCapability:'eth_accounts'}];
      if(method==='personal_sign')return '0x'+'11'.repeat(65);
      if(method==='eth_sendTransaction'){
        if(!sends++){const error=new Error('User rejected request');error.code=4001;throw error;}
        return '0x'+(sends===2?'11':'22').repeat(32);
      }
      if(method==='eth_getBalance')return '0x100000000000000000';
      if(method==='eth_estimateGas')return '0x100000';
      if(method==='eth_gasPrice')return '0x4a817c800';
      throw new Error('Unexpected mock wallet call: '+method);
    }}});
  },{owner});
  await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    const respond=value=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
    if(url.pathname.startsWith('/api/procurement/')){
      const path=url.pathname.slice('/api/procurement/'.length);
      if(path==='auth/challenge')return respond({id:'e2e-challenge',message:'Arcuex MOCK authentication; no transfers.'});
      if(path==='auth/verify')return respond({token:'e2e-session',address:owner,expiresAt:start+3600});
      if(path==='agents')return respond(req.method()==='POST'?agent:[]);
      if(path==='quotes')return respond(quote);
      if(path==='procure')return respond({policy,chainId:5042002,transactions:[{account:owner,to:'0x3600000000000000000000000000000000000000',data:'0x095ea7b3',description:'MOCK approval'},{account:owner,to:'0x6657974EEdF488380251bDD95A7FFfb0D456E49E',data:'0x12345678',description:'MOCK bind'}]});
      if(path==='confirm')return respond({...policy,state:'confirmed',bindTx:'0x'+'22'.repeat(32),confirmedAt:start+10});
      return respond([]);
    }
    if(req.method()==='POST' && url.hostname!=='localhost'){
      let payload;try{payload=req.postDataJSON();}catch{return route.abort();}
      const rpc=p=>{
        let result='0x1';
        if(p.method==='eth_chainId')result='0x4cef52';
        if(p.method==='eth_call')result='0x'+'0'.repeat(60)+'ffff';
        if(p.method==='eth_blockNumber')result='0x10';
        if(p.method==='eth_getTransactionReceipt')result={transactionHash:p.params[0],transactionIndex:'0x0',blockHash:'0x'+'33'.repeat(32),blockNumber:'0x10',from:owner,to:'0x6657974EEdF488380251bDD95A7FFfb0D456E49E',cumulativeGasUsed:'0x5208',gasUsed:'0x5208',effectiveGasPrice:'0x1',contractAddress:null,logs:[],logsBloom:'0x'+'00'.repeat(256),status:'0x1',type:'0x2'};
        return {jsonrpc:'2.0',id:p.id,result};
      };
      return respond(Array.isArray(payload)?payload.map(rpc):rpc(payload));
    }
    return route.continue();
  });
  await page.setViewportSize({width:1280,height:900});
  await page.goto('http://localhost:3002/coverage');
  const connect=page.getByRole('button',{name:'Connect wallet',exact:true});
  if(await connect.isVisible()) await connect.click();
  await page.getByRole('button',{name:'Sign in & load my agents'}).click();
  await page.getByText('Register a new synthetic position',{exact:true}).click();
  await page.getByLabel('Agent label',{exact:true}).fill('test-agent');
  await page.getByLabel('Position identifier',{exact:true}).fill('test-position');
  await page.getByRole('button',{name:'Register position I control'}).click();
  for(const label of ['This registered position is healthy under the canonical collateral ratio.','I know of no existing incident or liquidation affecting this position.','This exposure and its evidence are synthetic demo data only.','I control this position and attest that its registration is accurate.'])await page.getByRole('checkbox',{name:label,exact:true}).check();
  if(await page.getByRole('combobox',{name:'Limit',exact:true}).inputValue()!=='1000000')throw new Error('Default 1 USDC limit missing');
  await page.getByRole('button',{name:'Generate demo quote',exact:true}).click();
  await page.getByRole('checkbox',{name:'I accept these exact synthetic terms and the testnet premium.'}).check();
  await page.getByRole('button',{name:'Accept terms & prepare payment'}).click();
  await page.getByRole('button',{name:'Approve exact USDC premium'}).click();
  await page.getByRole('alert').filter({hasText:'rejected'}).waitFor();
  await page.getByRole('button',{name:'Approve exact USDC premium'}).click();
  await page.getByRole('status').filter({hasText:'Premium approval confirmed'}).waitFor();
  await page.getByRole('button',{name:'Pay premium & bind policy'}).click();
  await page.getByRole('heading',{name:'Policy bind confirmed'}).waitFor();
  const transactions=await page.evaluate(()=>window.__mockWalletCalls.filter(m=>m==='eth_sendTransaction').length);
  await page.setViewportSize({width:390,height:844});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  if(overflow)throw new Error('Mobile layout overflows');
  if(transactions!==3)throw new Error('Expected one rejected approval, one approved approval, one bind');
  return {result:'PASS',journey:'connect → authenticate → register → attest → quote → accept → rejected approval → retry → approve → bind → confirmed',mocked:true,financialBroadcasts:0,mobileOverflow:false};
}
