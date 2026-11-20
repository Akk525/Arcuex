import { AppShell } from '@/components/app-shell';
import { DashboardOverview } from '@/components/dashboard/dashboard-overview';

export default function DashboardPage() {
  return (
    <AppShell>
      <DashboardOverview />
    </AppShell>
  );
}
