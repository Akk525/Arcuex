import { AppShell } from '@/components/app-shell';
import { PolicyPortfolio } from '@/components/coverage/policy-portfolio';
import { ButtonLink } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';

export default function PoliciesPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Protect"
        title="Policies"
        description="Every policy this wallet owns or paid for, with its confirmation status, coverage window and next step."
        action={<ButtonLink href="/coverage">Buy coverage</ButtonLink>}
      />
      <PolicyPortfolio />
    </AppShell>
  );
}
