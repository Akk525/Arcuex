import { createHash } from 'node:crypto';
import { z } from 'zod';

const Identifier = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/);
export const ContentDigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const ArtifactKindSchema = z.enum([
  'exposure',
  'coverage',
  'evidence',
  'wording',
  'underwriting',
  'workflow',
]);
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;
export const ProductArtifactRefSchema = z
  .object({
    kind: ArtifactKindSchema,
    id: Identifier,
    version: z.number().int().positive(),
    digest: ContentDigestSchema,
  })
  .strict();
export type ProductArtifactRef = z.infer<typeof ProductArtifactRefSchema>;
const ref = <T extends ArtifactKind>(kind: T) =>
  ProductArtifactRefSchema.extend({ kind: z.literal(kind) });

/** Descriptive denominations only. No FX, funding or payment authority. */
export const ProductAssetSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('currency'),
      code: z.string().regex(/^[A-Z]{3}$/),
      scale: z.number().int().min(0).max(18),
    })
    .strict(),
  z
    .object({
      kind: z.literal('token'),
      chainId: z.number().int().positive(),
      address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      scale: z.number().int().min(0).max(18),
    })
    .strict(),
]);
export type ProductAsset = z.infer<typeof ProductAssetSchema>;
export const ProductAmountSchema = z
  .object({
    units: z.string().regex(/^(0|[1-9][0-9]*)$/),
    asset: ProductAssetSchema,
  })
  .strict();
export type ProductAmount = z.infer<typeof ProductAmountSchema>;

/** Additive metadata contract: neither existing policy model is replaced. */
export const InsuranceProductSchema = z
  .object({
    schemaVersion: z.literal(1),
    organizationId: Identifier,
    productId: Identifier,
    version: z.number().int().positive(),
    name: z.string().min(1).max(200),
    description: z.string().min(1).max(4000),
    synthetic: z.boolean(),
    exposure: ref('exposure'),
    coverage: ref('coverage'),
    evidence: ref('evidence'),
    wording: ref('wording'),
    underwriting: ref('underwriting').optional(),
    workflow: ref('workflow').optional(),
  })
  .strict();
export type InsuranceProduct = z.infer<typeof InsuranceProductSchema>;

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** New hash profile; deliberately does not change legacy terms canonicalization. */
export function canonicalProductJson(value: unknown): string {
  const ancestors = new Set<object>();
  const visit = (v: unknown): string => {
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'number' && Number.isSafeInteger(v)) return JSON.stringify(v);
    if (typeof v !== 'object' || !v)
      throw new Error('Only JSON values and safe integer numbers are supported');
    if (ancestors.has(v)) throw new Error('Cyclic product content');
    ancestors.add(v);
    try {
      if (Array.isArray(v)) {
        if (Object.keys(v).length !== v.length) throw new Error('Sparse or decorated array');
        return `[${v.map(visit).join(',')}]`;
      }
      if (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null)
        throw new Error('Plain JSON objects required');
      if (Object.getOwnPropertySymbols(v).length) throw new Error('Symbol keys are not JSON');
      return `{${Object.keys(v)
        .sort()
        .map((k) => {
          const descriptor = Object.getOwnPropertyDescriptor(v, k)!;
          if (!('value' in descriptor)) throw new Error('Accessors are not product content');
          return `${JSON.stringify(k)}:${visit(descriptor.value)}`;
        })
        .join(',')}}`;
    } finally {
      ancestors.delete(v);
    }
  };
  return visit(value);
}

export function artifactDigest(kind: ArtifactKind | 'product', content: unknown): string {
  return `sha256:${createHash('sha256')
    .update(canonicalProductJson({ profile: `arcuex.${kind}.v1`, content }))
    .digest('hex')}`;
}

export type Immutable<T> = T extends object ? { readonly [K in keyof T]: Immutable<T[K]> } : T;
export function freezeProductContent<T>(value: T): Immutable<T> {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeProductContent(child);
    Object.freeze(value);
  }
  return value as Immutable<T>;
}

export function snapshotProduct(input: unknown) {
  // Validate raw content first: never invoke getters or silently drop non-JSON input.
  canonicalProductJson(input);
  const content = InsuranceProductSchema.parse(input);
  const digest = artifactDigest('product', content);
  return freezeProductContent({
    content,
    digest,
    reference: {
      organizationId: content.organizationId,
      productId: content.productId,
      version: content.version,
      digest,
    },
  });
}
export type ProductSnapshot = ReturnType<typeof snapshotProduct>;

export function sameProductAsset(a: ProductAsset, b: ProductAsset): boolean {
  return canonicalProductJson(a) === canonicalProductJson(b);
}
