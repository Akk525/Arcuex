import { AppShell } from '@/components/app-shell';
import { ProtectOverview } from '@/components/protect/protect-overview';

export default function DashboardPage() {
  return (
    <AppShell>
      <ProtectOverview />
    </AppShell>
  );
}
