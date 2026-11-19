'use strict';
const fs = require('node:fs'), path = require('node:path'), { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
if (process.env.ARCUEX_CHAIN_SOURCE === 'fixture' && process.env.ARCUEX_RECONCILIATION_ENABLED === '1') {
  throw new Error('Live reconciliation worker forbidden in fixture mode');
}
let exiting = false;
const children = [];
function terminate(code) {
  if (exiting) return; exiting = true;
  for (const child of children) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
  setTimeout(() => { for (const child of children) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} } process.exit(code); }, 3000);
}
function launch(command, args) {
  const child = spawn(command, args, { cwd: root, env: process.env, detached: true, stdio: 'inherit' }); children.push(child);
  child.on('error', () => terminate(1)); child.on('exit', () => terminate(1)); return child;
}
process.on('SIGTERM', () => terminate(0)); process.on('SIGINT', () => terminate(0));
launch('pnpm', ['--filter', '@arcuex/web', 'exec', 'next', 'start', '-H', '0.0.0.0', '-p', process.env.PORT || '3000']);
if (process.env.ARCUEX_RECONCILIATION_ENABLED === '1') {
  launch(process.execPath, [path.join(__dirname, 'reconciliation-worker.cjs')]);
  const started = Date.now();
  setInterval(() => {
    try {
      const s = JSON.parse(fs.readFileSync('/data/reconciliation/health.json', 'utf8'));
      const last = s.lastSuccessfulAt * 1000;
      if (Date.now() - Math.max(last, started) > 300000) { console.error('policy-reconciliation: stale checkpoint watchdog; restarting service'); terminate(1); }
    } catch { if (Date.now() - started > 300000) terminate(1); }
  }, 15000);
}
