import {
  IdempotencyConflictError,
  encodeTerms,
  newId,
  type Agent,
  type Assessment,
  type AuditEvent,
  type CapitalPool,
  type CapitalReservation,
  type Claim,
  type CoveredExposure,
  type CoverageProduct,
  type EvidenceBundle,
  type EvidenceFact,
  type Incident,
  type Policy,
  type Policyholder,
  type Quote,
  type Settlement,
} from '@arcuex/domain';

import { createHash } from 'node:crypto';
import type { SqliteDb } from './db';
import { withTransaction } from './db';
import {
  mapPersistedClaimsCase,
  mapPersistedClaimsCaseEvent,
  mapPersistedEvidenceManifest,
  type PersistedClaimsCase,
  type PersistedClaimsCaseEvent,
  type PersistedEvidenceManifest,
} from './claims-case-persistence';
import {
  mapAgent,
  mapAudit,
  mapClaim,
  mapExposure,
  mapIncident,
  mapPolicy,
  mapPolicyholder,
  mapPool,
  mapProduct,
  mapQuote,
  mapReservation,
  mapSettlement,
} from './mappers';

export class InsuranceRepository {
  constructor(private readonly db: SqliteDb) {}

  insertAudit(
    aggregateType: string,
    aggregateId: string,
    eventType: string,
    payload: unknown,
  ): AuditEvent {
    const event: AuditEvent = {
      id: newId(),
      aggregateType,
      aggregateId,
      eventType,
      payloadJson: JSON.stringify(payload),
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO audit_events (id, aggregate_type, aggregate_id, event_type, payload_json, created_at)
         VALUES (@id, @aggregateType, @aggregateId, @eventType, @payloadJson, @createdAt)`,
      )
      .run(event);
    return event;
  }

  listAudit(aggregateType?: string, limit = 50): AuditEvent[] {
    if (aggregateType) {
      return this.db
        .prepare(
          `SELECT * FROM audit_events WHERE aggregate_type = ? ORDER BY created_at DESC LIMIT ?`,
        )
        .all(aggregateType, limit)
        .map((row) => mapAudit(row as Record<string, unknown>));
    }
    return this.db
      .prepare(`SELECT * FROM audit_events ORDER BY created_at DESC LIMIT ?`)
      .all(limit)
      .map((row) => mapAudit(row as Record<string, unknown>));
  }

  /**
   * Replay-safe inbound event gate. Returns false if already processed with same hash.
   * Throws on same key with different payload (idempotency conflict).
   */
  tryMarkProcessed(idempotencyKey: string, source: string, payload: unknown): boolean {
    const payloadHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const existing = this.db
      .prepare(`SELECT payload_hash FROM processed_events WHERE idempotency_key = ?`)
      .get(idempotencyKey) as { payload_hash: string } | undefined;

    if (existing) {
      if (existing.payload_hash !== payloadHash) {
        throw new IdempotencyConflictError(
          `processed_events key ${idempotencyKey} reused with different payload`,
        );
      }
      return false;
    }

    this.db
      .prepare(
        `INSERT INTO processed_events (idempotency_key, source, payload_hash, processed_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(idempotencyKey, source, payloadHash, new Date().toISOString());
    return true;
  }

  savePolicyholder(p: Policyholder): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO policyholders (id, display_name, wallet_address, created_at)
         VALUES (@id, @displayName, @walletAddress, @createdAt)`,
      )
      .run({
        id: p.id,
        displayName: p.displayName,
        walletAddress: p.walletAddress ?? null,
        createdAt: p.createdAt,
      });
  }

  saveAgent(a: Agent): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO agents (id, policyholder_id, external_ref, label, created_at)
         VALUES (@id, @policyholderId, @externalRef, @label, @createdAt)`,
      )
      .run(a);
  }

  saveProduct(p: CoverageProduct): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO coverage_products
         (id, code, name, version, covered_event_class, synthetic, active, description)
         VALUES (@id, @code, @name, @version, @coveredEventClass, @synthetic, @active, @description)`,
      )
      .run({
        ...p,
        synthetic: p.synthetic ? 1 : 0,
        active: p.active ? 1 : 0,
      });
  }

  getProductByCode(code: string): CoverageProduct | null {
    const row = this.db
      .prepare(`SELECT * FROM coverage_products WHERE code = ?`)
      .get(code);
    return row ? mapProduct(row as Record<string, unknown>) : null;
  }

  listProducts(): CoverageProduct[] {
    return this.db
      .prepare(`SELECT * FROM coverage_products ORDER BY code`)
      .all()
      .map((row) => mapProduct(row as Record<string, unknown>));
  }

  getQuoteByIdempotencyKey(key: string): Quote | null {
    const row = this.db
      .prepare(`SELECT * FROM quotes WHERE idempotency_key = ?`)
      .get(key);
    return row ? mapQuote(row as Record<string, unknown>) : null;
  }

  getQuote(id: string): Quote | null {
    const row = this.db.prepare(`SELECT * FROM quotes WHERE id = ?`).get(id);
    return row ? mapQuote(row as Record<string, unknown>) : null;
  }

  listQuotes(limit = 50): Quote[] {
    return this.db
      .prepare(`SELECT * FROM quotes ORDER BY created_at DESC LIMIT ?`)
      .all(limit)
      .map((row) => mapQuote(row as Record<string, unknown>));
  }

  saveQuote(quote: Quote): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO quotes
         (id, product_id, policyholder_id, agent_id, status, terms_json, idempotency_key,
          offered_at, expires_at, accepted_at, created_at)
         VALUES (@id, @productId, @policyholderId, @agentId, @status, @termsJson,
          @idempotencyKey, @offeredAt, @expiresAt, @acceptedAt, @createdAt)`,
      )
      .run({
        id: quote.id,
        productId: quote.productId,
        policyholderId: quote.policyholderId,
        agentId: quote.agentId,
        status: quote.status,
        termsJson: encodeTerms(quote.terms),
        idempotencyKey: quote.idempotencyKey,
        offeredAt: quote.offeredAt,
        expiresAt: quote.expiresAt,
        acceptedAt: quote.acceptedAt,
        createdAt: quote.createdAt,
      });
  }

  getPolicy(id: string): Policy | null {
    const row = this.db.prepare(`SELECT * FROM policies WHERE id = ?`).get(id);
    return row ? mapPolicy(row as Record<string, unknown>) : null;
  }

  getPolicyByQuoteId(quoteId: string): Policy | null {
    const row = this.db
      .prepare(`SELECT * FROM policies WHERE quote_id = ?`)
      .get(quoteId);
    return row ? mapPolicy(row as Record<string, unknown>) : null;
  }

  listPolicies(limit = 50): Policy[] {
    return this.db
      .prepare(`SELECT * FROM policies ORDER BY created_at DESC LIMIT ?`)
      .all(limit)
      .map((row) => mapPolicy(row as Record<string, unknown>));
  }

  savePolicy(policy: Policy): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO policies
         (id, quote_id, product_id, policyholder_id, agent_id, status, terms_json,
          funding_verified_at, bound_at, activated_at, created_at)
         VALUES (@id, @quoteId, @productId, @policyholderId, @agentId, @status, @termsJson,
          @fundingVerifiedAt, @boundAt, @activatedAt, @createdAt)`,
      )
      .run({
        id: policy.id,
        quoteId: policy.quoteId,
        productId: policy.productId,
        policyholderId: policy.policyholderId,
        agentId: policy.agentId,
        status: policy.status,
        termsJson: encodeTerms(policy.terms),
        fundingVerifiedAt: policy.fundingVerifiedAt,
        boundAt: policy.boundAt,
        activatedAt: policy.activatedAt,
        createdAt: policy.createdAt,
      });
  }

  saveExposure(exposure: CoveredExposure): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO covered_exposures
         (id, policy_id, exposure_key, description, limit_micros, created_at)
         VALUES (@id, @policyId, @exposureKey, @description, @limitMicros, @createdAt)`,
      )
      .run({
        ...exposure,
        limitMicros: exposure.limitMicros.toString(),
      });
  }

  listExposures(policyId: string): CoveredExposure[] {
    return this.db
      .prepare(`SELECT * FROM covered_exposures WHERE policy_id = ?`)
      .all(policyId)
      .map((row) => mapExposure(row as Record<string, unknown>));
  }

  saveIncident(incident: Incident): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO incidents
         (id, status, observed_event_ref, observed_at, policy_id, exposure_id, source, created_at)
         VALUES (@id, @status, @observedEventRef, @observedAt, @policyId, @exposureId, @source, @createdAt)`,
      )
      .run(incident);
  }

  getIncident(id: string): Incident | null {
    const row = this.db.prepare(`SELECT * FROM incidents WHERE id = ?`).get(id);
    return row ? mapIncident(row as Record<string, unknown>) : null;
  }

  listIncidents(limit = 50): Incident[] {
    return this.db
      .prepare(`SELECT * FROM incidents ORDER BY created_at DESC LIMIT ?`)
      .all(limit)
      .map((row) => mapIncident(row as Record<string, unknown>));
  }

  getClaimByIdempotencyKey(key: string): Claim | null {
    const row = this.db
      .prepare(`SELECT * FROM claims WHERE idempotency_key = ?`)
      .get(key);
    return row ? mapClaim(row as Record<string, unknown>) : null;
  }

  saveClaim(claim: Claim): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO claims
         (id, policy_id, incident_id, status, requested_micros, authorized_micros, idempotency_key, created_at)
         VALUES (@id, @policyId, @incidentId, @status, @requestedMicros, @authorizedMicros, @idempotencyKey, @createdAt)`,
      )
      .run({
        ...claim,
        requestedMicros: claim.requestedMicros.toString(),
        authorizedMicros: claim.authorizedMicros?.toString() ?? null,
      });
  }

  getClaim(id: string): Claim | null {
    const row = this.db.prepare(`SELECT * FROM claims WHERE id = ?`).get(id);
    return row ? mapClaim(row as Record<string, unknown>) : null;
  }

  listClaims(limit = 50): Claim[] {
    return this.db
      .prepare(`SELECT * FROM claims ORDER BY created_at DESC LIMIT ?`)
      .all(limit)
      .map((row) => mapClaim(row as Record<string, unknown>));
  }

  savePool(pool: CapitalPool): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO capital_pools
         (id, name, deposited_micros, outstanding_liability_micros, shares_outstanding, created_at)
         VALUES (@id, @name, @depositedMicros, @outstandingLiabilityMicros, @sharesOutstanding, @createdAt)`,
      )
      .run({
        ...pool,
        depositedMicros: pool.depositedMicros.toString(),
        outstandingLiabilityMicros: pool.outstandingLiabilityMicros.toString(),
        sharesOutstanding: pool.sharesOutstanding.toString(),
      });
  }

  getPoolByName(name: string): CapitalPool | null {
    const row = this.db.prepare(`SELECT * FROM capital_pools WHERE name = ?`).get(name);
    return row ? mapPool(row as Record<string, unknown>) : null;
  }

  listPools(): CapitalPool[] {
    return this.db
      .prepare(`SELECT * FROM capital_pools ORDER BY name`)
      .all()
      .map((row) => mapPool(row as Record<string, unknown>));
  }

  saveReservation(reservation: CapitalReservation): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO capital_reservations
         (id, pool_id, claim_id, amount_micros, status, created_at)
         VALUES (@id, @poolId, @claimId, @amountMicros, @status, @createdAt)`,
      )
      .run({
        ...reservation,
        amountMicros: reservation.amountMicros.toString(),
      });
  }

  listActiveReservations(poolId: string): CapitalReservation[] {
    return this.db
      .prepare(
        `SELECT * FROM capital_reservations WHERE pool_id = ? AND status = 'reserved'`,
      )
      .all(poolId)
      .map((row) => mapReservation(row as Record<string, unknown>));
  }

  getSettlementByIdempotencyKey(key: string): Settlement | null {
    const row = this.db
      .prepare(`SELECT * FROM settlements WHERE idempotency_key = ?`)
      .get(key);
    return row ? mapSettlement(row as Record<string, unknown>) : null;
  }

  saveSettlement(settlement: Settlement): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO settlements
         (id, claim_id, pool_id, amount_micros, status, idempotency_key, created_at)
         VALUES (@id, @claimId, @poolId, @amountMicros, @status, @idempotencyKey, @createdAt)`,
      )
      .run({
        ...settlement,
        amountMicros: settlement.amountMicros.toString(),
      });
  }

  listSettlements(limit = 50): Settlement[] {
    return this.db
      .prepare(`SELECT * FROM settlements ORDER BY created_at DESC LIMIT ?`)
      .all(limit)
      .map((row) => mapSettlement(row as Record<string, unknown>));
  }

  getPolicyholder(id: string): Policyholder | null {
    const row = this.db.prepare(`SELECT * FROM policyholders WHERE id = ?`).get(id);
    return row ? mapPolicyholder(row as Record<string, unknown>) : null;
  }

  getAgent(id: string): Agent | null {
    const row = this.db.prepare(`SELECT * FROM agents WHERE id = ?`).get(id);
    return row ? mapAgent(row as Record<string, unknown>) : null;
  }

  saveEvidence(bundle: EvidenceBundle, facts: readonly EvidenceFact[]): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO evidence_bundles (id, incident_id, collector, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(bundle.id, bundle.incidentId, bundle.collector, bundle.createdAt);
    const insertFact = this.db.prepare(
      `INSERT OR REPLACE INTO evidence_facts (id, bundle_id, key, value, provenance, observed_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const fact of facts) {
      insertFact.run(
        fact.id,
        fact.bundleId,
        fact.key,
        fact.value,
        fact.provenance,
        fact.observedAt,
      );
    }
  }

  listEvidenceFacts(incidentId: string): EvidenceFact[] {
    const bundles = this.db
      .prepare(`SELECT id FROM evidence_bundles WHERE incident_id = ?`)
      .all(incidentId) as { id: string }[];
    const facts: EvidenceFact[] = [];
    const stmt = this.db.prepare(`SELECT * FROM evidence_facts WHERE bundle_id = ?`);
    for (const bundle of bundles) {
      for (const row of stmt.all(bundle.id) as Record<string, unknown>[]) {
        facts.push({
          id: String(row.id),
          bundleId: String(row.bundle_id),
          key: String(row.key),
          value: String(row.value),
          provenance: String(row.provenance),
          observedAt: String(row.observed_at),
        });
      }
    }
    return facts;
  }

  saveAssessment(assessment: Assessment): void {
    this.db
      .prepare(
        `INSERT INTO assessments (id, claim_id, decision, authorized_micros, authority, rationale, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        assessment.id,
        assessment.claimId,
        assessment.decision,
        assessment.authorizedMicros?.toString() ?? null,
        assessment.authority,
        assessment.rationale,
        assessment.createdAt,
      );
  }

  getSettlement(id: string): Settlement | null {
    const row = this.db.prepare(`SELECT * FROM settlements WHERE id = ?`).get(id);
    return row ? mapSettlement(row as Record<string, unknown>) : null;
  }

  /** Durable idempotent on-chain tx record. Returns false if key already succeeded. */
  upsertOnchainTransaction(input: {
    id: string;
    purpose: string;
    idempotencyKey: string;
    txHash?: string | null;
    status: string;
    fromAddress?: string | null;
    toAddress?: string | null;
    policyEntityId?: string | null;
    claimEntityId?: string | null;
    payload: unknown;
    errorMessage?: string | null;
    nowIso: string;
  }): { inserted: boolean; existingStatus?: string } {
    const existing = this.db
      .prepare(`SELECT status FROM onchain_transactions WHERE idempotency_key = ?`)
      .get(input.idempotencyKey) as { status: string } | undefined;
    if (existing) {
      return { inserted: false, existingStatus: existing.status };
    }
    this.db
      .prepare(
        `INSERT INTO onchain_transactions (
          id, purpose, idempotency_key, tx_hash, status, from_address, to_address,
          policy_entity_id, claim_entity_id, payload_json, error_message, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.purpose,
        input.idempotencyKey,
        input.txHash ?? null,
        input.status,
        input.fromAddress ?? null,
        input.toAddress ?? null,
        input.policyEntityId ?? null,
        input.claimEntityId ?? null,
        JSON.stringify(input.payload),
        input.errorMessage ?? null,
        input.nowIso,
        input.nowIso,
      );
    return { inserted: true };
  }

  updateOnchainTransaction(
    idempotencyKey: string,
    patch: {
      txHash?: string | null;
      status: string;
      errorMessage?: string | null;
      nowIso: string;
    },
  ): void {
    this.db
      .prepare(
        `UPDATE onchain_transactions
         SET tx_hash = COALESCE(?, tx_hash),
             status = ?,
             error_message = ?,
             updated_at = ?
         WHERE idempotency_key = ?`,
      )
      .run(patch.txHash ?? null, patch.status, patch.errorMessage ?? null, patch.nowIso, idempotencyKey);
  }

  saveOnchainPolicyLink(input: {
    policyEntityId: string;
    policyIdBytes32: string;
    termsHash: string;
    poolAddress: string;
    chainId: number;
    boundTxHash?: string | null;
    boundAt?: string | null;
  }): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO onchain_policy_links (
          policy_entity_id, policy_id_bytes32, terms_hash, pool_address, chain_id,
          bound_tx_hash, bound_at, last_reconciled_at, last_reconcile_ok, last_mismatch_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)`,
      )
      .run(
        input.policyEntityId,
        input.policyIdBytes32,
        input.termsHash,
        input.poolAddress,
        input.chainId,
        input.boundTxHash ?? null,
        input.boundAt ?? null,
      );
  }

  recordReconcileResult(
    policyEntityId: string,
    ok: boolean,
    mismatches: readonly string[],
    nowIso: string,
  ): void {
    this.db
      .prepare(
        `UPDATE onchain_policy_links
         SET last_reconciled_at = ?, last_reconcile_ok = ?, last_mismatch_json = ?
         WHERE policy_entity_id = ?`,
      )
      .run(nowIso, ok ? 1 : 0, JSON.stringify(mismatches), policyEntityId);
  }

  getOnchainPolicyLink(policyEntityId: string): {
    policyEntityId: string;
    policyIdBytes32: string;
    termsHash: string;
    poolAddress: string;
    chainId: number;
    boundTxHash: string | null;
    boundAt: string | null;
    lastReconciledAt: string | null;
    lastReconcileOk: boolean | null;
  } | null {
    const row = this.db
      .prepare(`SELECT * FROM onchain_policy_links WHERE policy_entity_id = ?`)
      .get(policyEntityId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      policyEntityId: String(row.policy_entity_id),
      policyIdBytes32: String(row.policy_id_bytes32),
      termsHash: String(row.terms_hash),
      poolAddress: String(row.pool_address),
      chainId: Number(row.chain_id),
      boundTxHash: row.bound_tx_hash ? String(row.bound_tx_hash) : null,
      boundAt: row.bound_at ? String(row.bound_at) : null,
      lastReconciledAt: row.last_reconciled_at ? String(row.last_reconciled_at) : null,
      lastReconcileOk:
        row.last_reconcile_ok === null || row.last_reconcile_ok === undefined
          ? null
          : Number(row.last_reconcile_ok) === 1,
    };
  }

  /** Insert Streams inbox row. Returns false if dedupe_key already present. */
  insertStreamsEvent(input: {
    id: string;
    dedupeKey: string;
    source: string;
    eventName: string;
    txHash?: string | null;
    blockNumber?: string | null;
    logIndex?: string | null;
    payload: unknown;
    signatureOk: boolean;
    receivedAt: string;
  }): boolean {
    const existing = this.db
      .prepare(`SELECT id FROM streams_inbox WHERE dedupe_key = ?`)
      .get(input.dedupeKey);
    if (existing) return false;
    this.db
      .prepare(
        `INSERT INTO streams_inbox (
          id, dedupe_key, source, event_name, tx_hash, block_number, log_index,
          payload_json, signature_ok, processed, received_at, processed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL)`,
      )
      .run(
        input.id,
        input.dedupeKey,
        input.source,
        input.eventName,
        input.txHash ?? null,
        input.blockNumber ?? null,
        input.logIndex ?? null,
        JSON.stringify(input.payload),
        input.signatureOk ? 1 : 0,
        input.receivedAt,
      );
    return true;
  }

  markStreamsProcessed(dedupeKey: string, processedAt: string): void {
    this.db
      .prepare(
        `UPDATE streams_inbox SET processed = 1, processed_at = ? WHERE dedupe_key = ?`,
      )
      .run(processedAt, dedupeKey);
  }

  listStreamsInbox(limit = 50): Array<{
    id: string;
    dedupeKey: string;
    eventName: string;
    txHash: string | null;
    signatureOk: boolean;
    processed: boolean;
    receivedAt: string;
  }> {
    return (
      this.db
        .prepare(
          `SELECT * FROM streams_inbox ORDER BY received_at DESC LIMIT ?`,
        )
        .all(limit) as Record<string, unknown>[]
    ).map((row) => ({
      id: String(row.id),
      dedupeKey: String(row.dedupe_key),
      eventName: String(row.event_name),
      txHash: row.tx_hash ? String(row.tx_hash) : null,
      signatureOk: Number(row.signature_ok) === 1,
      processed: Number(row.processed) === 1,
      receivedAt: String(row.received_at),
    }));
  }

  saveClaimsCase(c: PersistedClaimsCase): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO claims_cases (
           id, schema_version, status, policy_id, exposure_id, incident_id, claim_id,
           claimant_ref, idempotency_key, synthetic_demo, evidence_authenticity,
           coverage_determination, settlement_authorization, verified_loss_micros,
           deductible_micros, prior_compensation_micros, recoveries_micros,
           remaining_limit_micros, loss_cap_micros, payable_micros, loss_key,
           denial_reason_code, review_reason_code, authority_actor, settlement_prep_id,
           created_at, updated_at
         ) VALUES (
           @id, @schemaVersion, @status, @policyId, @exposureId, @incidentId, @claimId,
           @claimantRef, @idempotencyKey, @syntheticDemo, @evidenceAuthenticity,
           @coverageDetermination, @settlementAuthorization, @verifiedLossMicros,
           @deductibleMicros, @priorCompensationMicros, @recoveriesMicros,
           @remainingLimitMicros, @lossCapMicros, @payableMicros, @lossKey,
           @denialReasonCode, @reviewReasonCode, @authorityActor, @settlementPrepId,
           @createdAt, @updatedAt
         )`,
      )
      .run({
        id: c.id,
        schemaVersion: c.schemaVersion,
        status: c.status,
        policyId: c.policyId,
        exposureId: c.exposureId,
        incidentId: c.incidentId,
        claimId: c.claimId,
        claimantRef: c.claimantRef,
        idempotencyKey: c.idempotencyKey,
        syntheticDemo: c.syntheticDemo ? 1 : 0,
        evidenceAuthenticity: c.evidenceAuthenticity,
        coverageDetermination: c.coverageDetermination,
        settlementAuthorization: c.settlementAuthorization,
        verifiedLossMicros: c.verifiedLossMicros?.toString() ?? null,
        deductibleMicros: c.deductibleMicros.toString(),
        priorCompensationMicros: c.priorCompensationMicros.toString(),
        recoveriesMicros: c.recoveriesMicros?.toString() ?? null,
        remainingLimitMicros: c.remainingLimitMicros?.toString() ?? null,
        lossCapMicros: c.lossCapMicros?.toString() ?? null,
        payableMicros: c.payableMicros?.toString() ?? null,
        lossKey: c.lossKey,
        denialReasonCode: c.denialReasonCode,
        reviewReasonCode: c.reviewReasonCode,
        authorityActor: c.authorityActor,
        settlementPrepId: c.settlementPrepId,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      });
  }

  getClaimsCase(id: string): PersistedClaimsCase | null {
    const row = this.db.prepare(`SELECT * FROM claims_cases WHERE id = ?`).get(id);
    return row ? mapPersistedClaimsCase(row as Record<string, unknown>) : null;
  }

  getClaimsCaseByIdempotencyKey(key: string): PersistedClaimsCase | null {
    const row = this.db
      .prepare(`SELECT * FROM claims_cases WHERE idempotency_key = ?`)
      .get(key);
    return row ? mapPersistedClaimsCase(row as Record<string, unknown>) : null;
  }

  listClaimsCases(limit = 50, status?: string): PersistedClaimsCase[] {
    if (status) {
      return this.db
        .prepare(
          `SELECT * FROM claims_cases WHERE status = ? ORDER BY updated_at DESC LIMIT ?`,
        )
        .all(status, limit)
        .map((row) => mapPersistedClaimsCase(row as Record<string, unknown>));
    }
    return this.db
      .prepare(`SELECT * FROM claims_cases ORDER BY updated_at DESC LIMIT ?`)
      .all(limit)
      .map((row) => mapPersistedClaimsCase(row as Record<string, unknown>));
  }

  appendClaimsCaseEvent(event: PersistedClaimsCaseEvent): void {
    this.db
      .prepare(
        `INSERT INTO claims_case_events
         (id, case_id, from_status, to_status, actor, reason_code, payload_json, created_at)
         VALUES (@id, @caseId, @fromStatus, @toStatus, @actor, @reasonCode, @payloadJson, @createdAt)`,
      )
      .run(event);
  }

  listClaimsCaseEvents(caseId: string, limit = 100): PersistedClaimsCaseEvent[] {
    return this.db
      .prepare(
        `SELECT * FROM claims_case_events WHERE case_id = ? ORDER BY created_at ASC LIMIT ?`,
      )
      .all(caseId, limit)
      .map((row) => mapPersistedClaimsCaseEvent(row as Record<string, unknown>));
  }

  saveEvidenceManifest(m: PersistedEvidenceManifest): { inserted: boolean } {
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO claims_evidence_manifests (
           id, case_id, source, chain, block_hash, transaction_hash, provenance,
           raw_evidence_digest, verification_method, source_reliability, synthetic_fixture, created_at
         ) VALUES (
           @id, @caseId, @source, @chain, @blockHash, @transactionHash, @provenance,
           @rawEvidenceDigest, @verificationMethod, @sourceReliability, @syntheticFixture, @createdAt
         )`,
      )
      .run({
        id: m.id,
        caseId: m.caseId,
        source: m.source,
        chain: m.chain,
        blockHash: m.blockHash,
        transactionHash: m.transactionHash,
        provenance: m.provenance,
        rawEvidenceDigest: m.rawEvidenceDigest,
        verificationMethod: m.verificationMethod,
        sourceReliability: m.sourceReliability,
        syntheticFixture: m.syntheticFixture ? 1 : 0,
        createdAt: m.createdAt,
      });
    return { inserted: Number(result.changes) > 0 };
  }

  listEvidenceManifests(caseId: string): PersistedEvidenceManifest[] {
    return this.db
      .prepare(
        `SELECT * FROM claims_evidence_manifests WHERE case_id = ? ORDER BY created_at ASC`,
      )
      .all(caseId)
      .map((row) => mapPersistedEvidenceManifest(row as Record<string, unknown>));
  }

  sumPaidForLossKey(lossKey: string): bigint {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(CAST(payable_micros AS INTEGER)), 0) AS total
         FROM claims_cases
         WHERE loss_key = ? AND status = 'PAID' AND payable_micros IS NOT NULL`,
      )
      .get(lossKey) as { total: number | string } | undefined;
    return BigInt(row?.total ?? 0);
  }

  runInTransaction<T>(fn: () => T): T {
    return withTransaction(this.db, fn);
  }
}
