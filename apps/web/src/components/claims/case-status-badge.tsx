import { StatusBadge } from '@/components/status-badge';
import { claimStatusLabel, displayClaimStatus } from '@/lib/claims/settlement-presentation';
import { statusTone } from '@/lib/claims/status-tone';

export function CaseStatusBadge({
  status,
  confirmedReceipt,
}: {
  status: string;
  confirmedReceipt?: string | null;
}) {
  const verifiedStatus = displayClaimStatus(status, confirmedReceipt);
  return (
    <StatusBadge
      label={claimStatusLabel(status, confirmedReceipt)}
      tone={verifiedStatus === status ? statusTone(status) : 'warn'}
    />
  );
}
