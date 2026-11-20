import type { PaymentFinality } from '@/lib/claims/payment-finality';
import { StatusBadge } from '@/components/status-badge';
import { claimStatusLabel, displayClaimStatus } from '@/lib/claims/settlement-presentation';
import { statusTone } from '@/lib/claims/status-tone';

export function CaseStatusBadge({
  status,
  confirmedReceipt,
  paymentFinality,
}: {
  status: string;
  confirmedReceipt?: string | null;
  paymentFinality?: PaymentFinality;
}) {
  const verifiedStatus = displayClaimStatus(status, confirmedReceipt, paymentFinality);
  return (
    <StatusBadge
      label={claimStatusLabel(status, confirmedReceipt, paymentFinality)}
      tone={verifiedStatus === status ? statusTone(status) : 'warn'}
    />
  );
}
