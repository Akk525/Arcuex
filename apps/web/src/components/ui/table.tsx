import type { ReactNode } from 'react';

export function Table({ children, caption }: { children: ReactNode; caption?: string }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-[var(--line)] bg-[var(--surface-inset)] text-[0.6875rem] font-semibold tracking-wide text-[var(--ink-muted)] uppercase">
      {children}
    </thead>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-[var(--line)]">{children}</tbody>;
}

export function TR({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <tr className={className}>{children}</tr>;
}

export function TH({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <th className={`px-3 py-2.5 font-semibold ${className}`}>{children}</th>;
}

export function TD({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 align-top text-[var(--ink)] ${className}`}>{children}</td>;
}
