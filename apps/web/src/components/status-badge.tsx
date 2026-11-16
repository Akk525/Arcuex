type Tone = 'neutral' | 'ok' | 'warn' | 'error' | 'pending';

const toneClass: Record<Tone, string> = {
  neutral: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
  ok: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warn: 'bg-amber-50 text-amber-900 ring-amber-200',
  error: 'bg-rose-50 text-rose-800 ring-rose-200',
  pending: 'bg-sky-50 text-sky-800 ring-sky-200',
};

export function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${toneClass[tone]}`}
    >
      {label}
    </span>
  );
}
