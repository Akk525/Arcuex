import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="workspace-container py-16">
      <p className="text-sm text-[var(--ink-muted)]">Marketing homepage landing in Phase 3.</p>
      <Link href="/dashboard">Open dashboard</Link>
    </main>
  );
}
