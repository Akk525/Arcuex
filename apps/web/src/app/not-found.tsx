import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-4 px-5 py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">Page not found</h1>
      <p className="text-sm text-[var(--ink-muted)]">
        That route is not part of this Arcuex surface.
      </p>
      <Link href="/" className="text-sm font-medium text-[var(--accent)] underline-offset-2 hover:underline">
        Back to product home
      </Link>
    </main>
  );
}
