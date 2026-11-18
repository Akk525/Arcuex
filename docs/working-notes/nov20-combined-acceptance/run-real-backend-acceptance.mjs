/** Real local production API + SQLite + browser. No financial transactions. */
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(new URL('../../../apps/web/package.json', import.meta.url));
const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const base = process.env.BASE_URL || 'http://localhost:3027';
const account = privateKeyToAccount(generatePrivateKey()); // ephemeral signing identity; never logged/stored
const results = [];
function check(value, detail) { if (!value) throw new Error(detail); results.push({status:'PASS',detail}); console.log('PASS '+detail); }
const browser = await chromium.launch({ headless:true, executablePath:process.env.PLAYWRIGHT_CHROME_PATH });
try {
  const context = await browser.newContext();
  const request = context.request;
  const post = (path, data) => request.post(base+path,{data,headers:{origin:base}});
  let response = await request.get(base+'/api/session/me');
  check((await response.json()).state === 'anonymous', 'Anonymous authoritative session');
  response = await request.get(base+'/api/policies/reconciliation');
  check(response.status() === 401, 'Unauthenticated reconciliation is denied');
  response = await post('/api/claims/auth/nonce',{wallet:account.address});
  check(response.ok(),'Real wallet challenge issued');
  const nonce = await response.json();
  response = await post('/api/claims/auth/verify',{wallet:account.address,nonce:nonce.nonce,signature:await account.signMessage({message:nonce.message})});
  check(response.ok(),'Real signed-wallet authentication');
  check(/HttpOnly/i.test(response.headers()['set-cookie']) && /Secure/i.test(response.headers()['set-cookie']), 'Session cookie retains HttpOnly and Secure');
  const me = await (await request.get(base+'/api/session/me')).json();
  check(me.state==='authenticated' && me.role==='claimant' && me.wallet===account.address.toLowerCase() && me.capabilities.includes('claims:intake'),'Authoritative identity and capabilities');
  response = await post('/api/procurement/agents',{idempotencyKey:crypto.randomUUID(),label:'Combined acceptance',signer:account.address,position:crypto.randomUUID(),exposureMicros:'100000000',ownerAttestsControl:true,chainId:5042002,protocol:'arcuex-synthetic-lending-v1'});
  check(response.ok(),'Real synthetic exposure registration');
  const agent = await response.json();
  response = await post('/api/procurement/quotes',{idempotencyKey:crypto.randomUUID(),agentId:agent.id,limitMicros:'1000000',durationDays:7,beneficiary:account.address,eligibility:{positionHealthy:true,noKnownIncident:true,syntheticOnly:true,ownerAttestsControl:true}});
  check(response.ok(),'Real immutable synthetic quote');
  const quote = await response.json();
  response = await post('/api/procurement/procure',{quoteId:quote.terms.quoteId,acceptedDigest:quote.digest});
  check(response.ok(),'Read-only chain preflight and offchain preparation');
  const prep = await response.json();
  const id = prep.policy.terms.policyId;
  const lifecycle = await (await request.get(base+`/api/policies/${id}/lifecycle`)).json();
  check(lifecycle.state==='prepared' && !lifecycle.claimsEligible && lifecycle.confirmation===null,'Prepared SQLite record grants no confirmation or claims');
  response = await post('/api/procurement/confirm',{policyId:id,hash:'0x'+'ff'.repeat(32)});
  check(!response.ok(),'Fabricated successful wallet hash rejected by real receipt verifier');
  const after = await (await request.get(base+`/api/policies/${id}/lifecycle`)).json();
  check(after.state==='prepared' && !after.claimsEligible,'Failed receipt cannot mutate authoritative lifecycle');
  const foreign = await browser.newContext();
  check((await foreign.request.get(base+`/api/policies/${id}/lifecycle`)).status()===401,'Session boundary protects policy lifecycle');
  await foreign.close();
  const page = await context.newPage();
  await page.addInitScript(({owner})=>{
    localStorage.setItem('arcuex:workspace','protect');
    window.ethereum={isMetaMask:true,on(){},removeListener(){},async request({method}){
      if(['eth_accounts','eth_requestAccounts'].includes(method)) return [owner];
      if(method==='eth_chainId') return '0x4cef52';
      if(['wallet_requestPermissions','wallet_getPermissions'].includes(method)) return [{parentCapability:'eth_accounts'}];
      throw new Error('No transaction or signing method authorized in real-backend acceptance: '+method);
    }};
  },{owner:account.address});
  await page.goto(base+'/policies');
  await page.getByText('Signed in',{exact:true}).waitFor();
  const connect=page.getByRole('button',{name:'Connect wallet',exact:true});
  if(await connect.count()) await connect.click();
  await page.getByRole('button',{name:'Refresh my policies'}).click();
  await page.getByText(id,{exact:true}).waitFor();
  await page.getByText('Prepared — no coverage confirmed',{exact:true}).waitFor();
  check(true,'Policy frontend consumes real session and lifecycle APIs');
  check(await page.getByRole('link',{name:'Submit a synthetic claim'}).count()===0,'Prepared policy has no claim action');
  check(await page.getByRole('button',{name:'Ops',exact:true}).count()===0,'Claimant cannot select Ops workspace');
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await page.getByText('No session',{exact:true}).waitFor();
  check((await (await request.get(base+'/api/session/me')).json()).state==='anonymous','Logout revokes real session and refreshes AccountBar');
  fs.writeFileSync(process.env.OUT_FILE || '/tmp/arcuex-real-backend-results.json',JSON.stringify(results,null,2));
  console.log(`Real backend acceptance: ${results.length} PASS`);
} finally { await browser.close(); }
