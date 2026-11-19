import { AppShell } from '@/components/app-shell';
import { PoliciesPanel } from '@/components/coverage/policies-panel';
import { ButtonLink } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';

export default function PoliciesPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Protect"
        title="Policy portfolio"
        description="Review your policies, resume checkout and find policies eligible for claim intake."
        action={<ButtonLink href="/coverage">Explore coverage</ButtonLink>}
      />
      <PoliciesPanel />
    </AppShell>
  );
}
