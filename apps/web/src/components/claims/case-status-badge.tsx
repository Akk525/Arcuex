import { StatusBadge } from '@/components/status-badge';
import { statusTone } from '@/lib/claims/status-tone';

export function CaseStatusBadge({ status }: { status: string }) {
  return <StatusBadge label={status} tone={statusTone(status)} />;
}
