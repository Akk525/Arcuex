import { z } from 'zod';
import type { ProcurementAgent, ProcurementDelegationView } from '@arcuex/domain';
import { ok, type ToolContext } from '../context';

export const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'EVM address')
  .refine((v) => !/^0x0{40}$/i.test(v), 'Nonzero address')
  .transform((v) => v.toLowerCase());
export const uuid = z.string().uuid();
export const micros = z.string().regex(/^[1-9][0-9]{0,11}$/, 'Positive integer USDC micros');
export const txHash = z.string().regex(/^0x[0-9a-fA-F]{64}$/, '32-byte transaction hash');
export const idempotencyKey = z
  .string()
  .min(8)
  .max(120)
  .regex(/^[A-Za-z0-9:_.-]+$/)
  .describe(
    'Client-generated key. Reuse it to retry safely; reusing it with different input fails.',
  );

export async function visibleAgents(ctx: ToolContext) {
  return ok<ProcurementAgent[]>(await ctx.backend.call('GET', '/api/procurement/agents'));
}
export async function visibleDelegations(ctx: ToolContext) {
  return ok<ProcurementDelegationView[]>(
    await ctx.backend.call('GET', '/api/procurement/delegations'),
  );
}
