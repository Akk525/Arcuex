import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  canonicalProductJson,
  ProductPublicationTimestampSchema,
  nextProductPublicationState,
  requireProductPermission,
  validateProductTemplate,
  type ProductTemplate,
  type ProductPrincipal,
  type ProductPublicationState,
  type ProductPublicationAction,
} from '@arcuex/domain';
import type { SqliteDb } from './db';

/** Explicit local opt-in; existing openDatabase/migrate never installs this schema. */
export function initializeProductRegistry(db: SqliteDb): void {
  const sql = readFileSync(new URL('./product-registry-schema.sql', import.meta.url), 'utf8');
  db.transaction(() => db.exec(sql))();
}

type EventRow = {
  id: string;
  sequence: number;
  from_state: ProductPublicationState | null;
  to_state: ProductPublicationState;
  actor_id: string;
  permission: string;
  authorization_ref: string;
  approval_event_id: string | null;
  created_at: string;
};
type VersionRow = { bundle_json: string; digest: string; author_id: string; created_at: string };
export type ProductVersionKey = { organizationId: string; productId: string; version: number };

/** Product metadata/provenance only: never reads or writes either policy table. */
export class ProductPublicationRepository {
  constructor(
    readonly db: SqliteDb,
    readonly now: () => string = () => new Date().toISOString(),
  ) {}

  private history(key: ProductVersionKey): EventRow[] {
    return this.db
      .prepare(
        'SELECT * FROM platform_product_publication_events WHERE organization_id=? AND product_id=? AND version=? ORDER BY sequence',
      )
      .all(key.organizationId, key.productId, key.version) as EventRow[];
  }
  private read(key: ProductVersionKey) {
    const row = this.db
      .prepare(
        'SELECT * FROM platform_product_versions WHERE organization_id=? AND product_id=? AND version=?',
      )
      .get(key.organizationId, key.productId, key.version) as VersionRow | undefined;
    if (!row) throw new Error('Product version not found');
    const bundle = validateProductTemplate(JSON.parse(row.bundle_json) as ProductTemplate);
    const content = bundle.product.content;
    if (
      row.digest !== bundle.product.digest ||
      content.organizationId !== key.organizationId ||
      content.productId !== key.productId ||
      content.version !== key.version
    )
      throw new Error('Corrupt product version binding');
    const events = this.history(key);
    if (!events.length) throw new Error('Missing publication provenance');
    return {
      key,
      bundle,
      authorId: row.author_id,
      events,
      state: events.at(-1)!.to_state,
      revision: events.at(-1)!.sequence,
    };
  }
  get(key: ProductVersionKey, principal: ProductPrincipal) {
    requireProductPermission(principal, key.organizationId, 'product:read');
    return this.read(key);
  }
  versions(organizationId: string, productId: string, principal: ProductPrincipal) {
    requireProductPermission(principal, organizationId, 'product:read');
    const rows = this.db
      .prepare(
        'SELECT version FROM platform_product_versions WHERE organization_id=? AND product_id=? ORDER BY version',
      )
      .all(organizationId, productId) as { version: number }[];
    return rows.map((row) => this.read({ organizationId, productId, version: row.version }));
  }
  createDraft(input: ProductTemplate, principal: ProductPrincipal) {
    const bundle = validateProductTemplate(input),
      content = bundle.product.content;
    const actor = requireProductPermission(principal, content.organizationId, 'product:author');
    const key = {
      organizationId: content.organizationId,
      productId: content.productId,
      version: content.version,
    };
    return this.db.transaction(() => {
      const at = ProductPublicationTimestampSchema.parse(this.now());
      this.db
        .prepare('INSERT INTO platform_product_versions VALUES (?,?,?,?,?,?,?)')
        .run(
          key.organizationId,
          key.productId,
          key.version,
          bundle.product.digest,
          canonicalProductJson(bundle),
          actor.subject,
          at,
        );
      this.append(key, null, 'draft', 'product:author', actor, 1, null, at);
      return this.read(key);
    })();
  }
  transition(
    key: ProductVersionKey,
    action: ProductPublicationAction,
    expectedRevision: number,
    principal: ProductPrincipal,
  ) {
    return this.db.transaction(() => {
      // Scope authorization before looking up rows; no cross-organization existence leaks.
      requireProductPermission(
        principal,
        key.organizationId,
        action === 'approve'
          ? 'product:approve'
          : action === 'publish'
            ? 'product:publish'
            : action === 'retire'
              ? 'product:retire'
              : 'product:author',
      );
      const current = this.read(key);
      if (current.revision !== expectedRevision) throw new Error('Publication revision conflict');
      const next = nextProductPublicationState(
        { organizationId: key.organizationId, authorId: current.authorId, state: current.state },
        action,
        principal,
      );
      const at = ProductPublicationTimestampSchema.parse(this.now());
      if (Date.parse(at) < Date.parse(current.events.at(-1)!.created_at))
        throw new Error('Publication time cannot move backwards');
      const approval = current.events.find((e) => e.to_state === 'approved');
      this.append(
        key,
        current.state,
        next.state,
        next.permission,
        principal,
        current.revision + 1,
        approval?.id ?? null,
        at,
      );
      return this.read(key);
    })();
  }
  private append(
    key: ProductVersionKey,
    from: ProductPublicationState | null,
    to: ProductPublicationState,
    permission: string,
    principal: ProductPrincipal,
    sequence: number,
    approvalId: string | null,
    at: string,
  ) {
    this.db
      .prepare('INSERT INTO platform_product_publication_events VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(
        randomUUID(),
        key.organizationId,
        key.productId,
        key.version,
        sequence,
        from,
        to,
        principal.subject,
        permission,
        principal.authorizationRef,
        approvalId,
        at,
      );
  }
}
