'use client';

import type { ReactNode } from 'react';

export type TabItem = { id: string; label: string; panel: ReactNode };

export function Tabs({
  items,
  value,
  onChange,
  ariaLabel = 'Sections',
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
}) {
  const active = items.find((i) => i.id === value) ?? items[0];
  return (
    <div>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="flex flex-wrap gap-1 border-b border-[var(--line)] pb-px"
      >
        {items.map((item) => {
          const selected = item.id === active?.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              id={`tab-${item.id}`}
              onClick={() => onChange(item.id)}
              className={`min-h-9 rounded-t-[var(--radius-sm)] px-3 text-sm font-medium transition-colors ${
                selected
                  ? 'border border-b-[var(--surface)] border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] -mb-px'
                  : 'border border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" aria-labelledby={`tab-${active?.id}`} className="pt-4">
        {active?.panel}
      </div>
    </div>
  );
}
