import { StatusBadge } from '@/components/status-badge';
import { displayClaimStatus } from '@/lib/claims/settlement-presentation';
import { statusTone } from '@/lib/claims/status-tone';

export function CaseStatusBadge({
  status,
  confirmedReceipt,
}: {
  status: string;
  confirmedReceipt?: string | null;
}) {
  const label = displayClaimStatus(status, confirmedReceipt);
  return <StatusBadge label={label} tone={label === status ? statusTone(status) : 'warn'} />;
}
