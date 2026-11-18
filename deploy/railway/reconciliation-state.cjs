'use strict';
const fs = require('node:fs');
function validateState(s, config) {
  if (s.version !== 1 || s.chainId !== 5042002 || s.pool !== config.pool || s.startBlock !== config.startBlock || s.confirmations !== 2 || !/^\d+$/.test(s.nextBlock) || BigInt(s.nextBlock) < BigInt(config.startBlock)) throw new Error('Cursor identity or range invalid');
  return s;
}
function planRange(s, head) {
  const end = head - 2n;
  const next = BigInt(s.nextBlock), start = BigInt(s.startBlock);
  if (end < start || next > end + 1n) throw new Error('Chain head behind cursor');
  const from = s.backfillComplete ? (next - 32n > start ? next - 32n : start) : next;
  if (from > end) return null;
  const to = from + 2000n < end ? from + 2000n : end;
  return { from, to, complete: to === end };
}
function commitSuccess(s, range, head, now) {
  return { ...s, nextBlock: (range.to + 1n).toString(), backfillComplete: range.complete, head: head.toString(), lastFrom: range.from.toString(), lastThrough: range.to.toString(), lastSuccessfulAt: now, updatedAt: now, consecutiveFailures: 0, healthy: true };
}
function atomicJson(path, data) {
  const temp = path + '.tmp';
  const fd = fs.openSync(temp, 'w', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(data) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temp, path);
  const dir = fs.openSync(require('node:path').dirname(path), 'r');
  try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
}
module.exports = { validateState, planRange, commitSuccess, atomicJson };
