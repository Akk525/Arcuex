import type { ReactNode } from 'react';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { MarketingNav } from '@/components/marketing/marketing-nav';

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="marketing-shell">
      <a href="#hero" className="skip-link">
        Skip to content
      </a>
      <MarketingNav />
      {children}
      <MarketingFooter />
    </div>
  );
}
