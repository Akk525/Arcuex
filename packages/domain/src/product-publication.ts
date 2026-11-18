import { z } from 'zod';
export const ProductPublicationTimestampSchema = z.string().datetime();

export const ProductPublicationStateSchema = z.enum([
  'draft',
  'review',
  'approved',
  'published',
  'retired',
]);
export type ProductPublicationState = z.infer<typeof ProductPublicationStateSchema>;
export const ProductPermissionSchema = z.enum([
  'product:read',
  'product:author',
  'product:approve',
  'product:publish',
  'product:retire',
]);
/** Trusted application context, never a role/capability claim accepted from HTTP input. */
export const ProductPrincipalSchema = z
  .object({
    organizationId: z.string().min(1),
    subject: z.string().min(1),
    permissions: z.array(ProductPermissionSchema),
    authorizationRef: z.string().min(1),
  })
  .strict();
export type ProductPrincipal = z.infer<typeof ProductPrincipalSchema>;
export type ProductPublicationAction =
  'request_review' | 'return_to_draft' | 'approve' | 'publish' | 'retire';

export function requireProductPermission(
  principal: ProductPrincipal,
  organizationId: string,
  permission: z.infer<typeof ProductPermissionSchema>,
) {
  const actor = ProductPrincipalSchema.parse(principal);
  if (actor.organizationId !== organizationId || !actor.permissions.includes(permission))
    throw new Error('Product operation not authorized');
  return actor;
}

/** Content is immutable even in draft; revisions create a new version. */
export function nextProductPublicationState(
  input: {
    organizationId: string;
    authorId: string;
    state: ProductPublicationState;
  },
  action: ProductPublicationAction,
  principal: ProductPrincipal,
) {
  const operations: Record<
    ProductPublicationAction,
    {
      from: ProductPublicationState[];
      to: ProductPublicationState;
      permission: z.infer<typeof ProductPermissionSchema>;
    }
  > = {
    request_review: { from: ['draft'], to: 'review', permission: 'product:author' },
    return_to_draft: { from: ['review'], to: 'draft', permission: 'product:author' },
    approve: { from: ['review'], to: 'approved', permission: 'product:approve' },
    publish: { from: ['approved'], to: 'published', permission: 'product:publish' },
    retire: { from: ['approved', 'published'], to: 'retired', permission: 'product:retire' },
  };
  const operation = operations[action];
  if (!operation || !operation.from.includes(input.state))
    throw new Error('Invalid product publication transition');
  const actor = requireProductPermission(principal, input.organizationId, operation.permission);
  if (action === 'approve' && actor.subject === input.authorId)
    throw new Error('Product author cannot approve their own version');
  if (operation.permission === 'product:author' && actor.subject !== input.authorId)
    throw new Error('Only original author may submit or withdraw this version');
  return { state: operation.to, permission: operation.permission };
}
