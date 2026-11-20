import { z } from 'zod';
import type { AnyToolSpec } from '../context';

/**
 * Tools the request asked for whose backend capability does not exist. They are discoverable so
 * agents can plan, but always return BLOCKED / NOT_SUPPORTED_BY_BACKEND and never simulate state.
 */
const blocked = (
  name: string,
  title: string,
  scope: AnyToolSpec['scope'],
  missing: string,
  alternative?: string,
): AnyToolSpec => ({
  name,
  title: `${title} (unsupported)`,
  description: `[UNSUPPORTED] ${missing} Always returns BLOCKED with reasonCode NOT_SUPPORTED_BY_BACKEND.${alternative ? ` Alternative: ${alternative}` : ''}`,
  scope,
  input: { context: z.string().max(2000).optional() },
  readOnly: true,
  run: async () => ({
    status: 'BLOCKED',
    reasonCode: 'NOT_SUPPORTED_BY_BACKEND',
    message: missing,
    data: { missingCapability: missing, alternative: alternative ?? null },
  }),
});

export const UNSUPPORTED = [
  blocked(
    'arcuex_request_risk_assessment',
    'Request risk assessment',
    'arcuex:quote',
    'Arcuex has no risk-assessment service; premiums follow a fixed testnet schedule.',
    'arcuex_check_eligibility and arcuex_get_underwriting_requirements.',
  ),
  blocked(
    'arcuex_submit_underwriting_application',
    'Submit underwriting application',
    'arcuex:quote',
    'No underwriting application record, underwriter role or approval API exists in the backend.',
    'Agents procure only under owner delegation; live products are owner-purchased.',
  ),
  blocked(
    'arcuex_get_underwriting_status',
    'Get underwriting status',
    'arcuex:read',
    'No underwriting workflow state exists to read.',
    'arcuex_get_purchase_status for procurement progress.',
  ),
  blocked(
    'arcuex_submit_underwriting_evidence',
    'Submit underwriting evidence',
    'arcuex:quote',
    'No underwriting evidence intake exists. Eligibility is attested at quote time.',
  ),
  blocked(
    'arcuex_request_policy_renewal',
    'Request policy renewal',
    'arcuex:quote',
    'The backend has no renewal contract; each policy is a fixed-window bind.',
    'Request a new quote before expiry.',
  ),
  blocked(
    'arcuex_request_claim_reconsideration',
    'Request claim reconsideration',
    'arcuex:claims',
    'No appeal/reconsideration workflow exists; DENIED is terminal in the claims state machine.',
    'While a claim is open, arcuex_send_claim_message or arcuex_request_examiner_reassessment.',
  ),
];
