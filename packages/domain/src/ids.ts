import { z } from 'zod';
import { randomUUID } from 'node:crypto';

export const EntityIdSchema = z.string().uuid();
export type EntityId = z.infer<typeof EntityIdSchema>;

export function newId(): EntityId {
  return EntityIdSchema.parse(randomUUID());
}

export const IdempotencyKeySchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, 'idempotency key has invalid characters');

export type IdempotencyKey = z.infer<typeof IdempotencyKeySchema>;
