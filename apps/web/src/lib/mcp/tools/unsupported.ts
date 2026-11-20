import { z } from 'zod';
import type { AnyToolSpec } from '../context';

/**
 * Discoverable tools that never act. NOT_SUPPORTED_BY_BACKEND: no backend capability exists.
 * MCP_EXPOSURE_NOT_ACCEPTED: a backend API exists but has not passed separate MCP authorization
 * and integration acceptance, so MCP does not call it. Neither variant simulates state.
 */
type BlockReason = 'NOT_SUPPORTED_BY_BACKEND' | 'MCP_EXPOSURE_NOT_ACCEPTED';
const blocked = (
  name: string,
  title: string,
  scope: AnyToolSpec['scope'],
  explanation: string,
  alternative?: string,
  reasonCode: BlockReason = 'NOT_SUPPORTED_BY_BACKEND',
): AnyToolSpec => ({
  name,
  title: `${title} (${reasonCode === 'NOT_SUPPORTED_BY_BACKEND' ? 'unsupported' : 'not yet exposed via MCP'})`,
  description: `[${reasonCode === 'NOT_SUPPORTED_BY_BACKEND' ? 'UNSUPPORTED' : 'BLOCKED PENDING MCP ACCEPTANCE'}] ${explanation} Always returns BLOCKED with reasonCode ${reasonCode}.${alternative ? ` Alternative: ${alternative}` : ''}`,
  scope,
  input: { context: z.string().max(2000).optional() },
  readOnly: true,
  run: async () => ({
    status: 'BLOCKED',
    reasonCode,
    message: explanation,
    data:
      reasonCode === 'NOT_SUPPORTED_BY_BACKEND'
        ? { missingCapability: explanation, alternative: alternative ?? null }
        : { backendApi: UNDERWRITING_API, alternative: alternative ?? null },
  }),
});

const UNDERWRITING_API = '/api/underwriting';
const underwritingPending = (what: string) =>
  `The backend implements ${what} in synthetic underwriting applications (${UNDERWRITING_API}, applicant plus human insurer review). MCP does not call it until that API separately passes MCP authorization and integration acceptance.`;
const HUMAN_UNDERWRITING =
  'A human owner can use the Arcuex web underwriting workspace; insurer decisions remain human.';

export const UNSUPPORTED = [
  blocked(
    'arcuex_request_risk_assessment',
    'Request risk assessment',
    'arcuex:quote',
    underwritingPending(
      'risk assessment (premium and evidence adjustments computed per application)',
    ),
    'arcuex_check_eligibility and arcuex_get_underwriting_requirements (advisory).',
    'MCP_EXPOSURE_NOT_ACCEPTED',
  ),
  blocked(
    'arcuex_submit_underwriting_application',
    'Submit underwriting application',
    'arcuex:quote',
    underwritingPending('application submission'),
    HUMAN_UNDERWRITING,
    'MCP_EXPOSURE_NOT_ACCEPTED',
  ),
  blocked(
    'arcuex_get_underwriting_status',
    'Get underwriting status',
    'arcuex:read',
    underwritingPending('application status (ready, needs_evidence, needs_review, declined)'),
    'arcuex_get_purchase_status for procurement progress.',
    'MCP_EXPOSURE_NOT_ACCEPTED',
  ),
  blocked(
    'arcuex_submit_underwriting_evidence',
    'Submit underwriting evidence',
    'arcuex:quote',
    underwritingPending('insurer evidence requests and applicant responses'),
    HUMAN_UNDERWRITING,
    'MCP_EXPOSURE_NOT_ACCEPTED',
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
