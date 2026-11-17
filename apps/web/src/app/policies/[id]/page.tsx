import { AppShell } from '@/components/app-shell';
import { PoliciesPanel } from '@/components/coverage/policies-panel';
export default async function PolicyPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <AppShell>
      <PoliciesPanel id={(await params).id} />
    </AppShell>
  );
}
