'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CaretDown, List, X } from '@phosphor-icons/react';
import { MarketingMark } from '@/components/marketing/marketing-mark';

const productLinks = [
  { href: '/coverage', label: 'Coverage', note: 'Quote, bind and manage policies' },
  { href: '/claims', label: 'Claims', note: 'Evidence-backed investigation' },
  { href: '/agent', label: 'Agents', note: 'Registration and delegated authority' },
  { href: '/dashboard', label: 'Dashboard', note: 'Your policies, agents and claims' },
] as const;

const anchors = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#developers', label: 'Developers' },
  { href: '#trust', label: 'Trust' },
] as const;

export function MarketingNav() {
  const [open, setOpen] = useState(false);
  const [overHero, setOverHero] = useState(true);
  const productMenu = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const hero = document.getElementById('hero');
    if (!hero) {
      setOverHero(false);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setOverHero(Boolean(entry?.isIntersecting)),
      { rootMargin: '-64px 0px 0px 0px', threshold: 0.12 },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      if (productMenu.current?.open) {
        productMenu.current.open = false;
        productMenu.current.querySelector('summary')?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      const menu = productMenu.current;
      if (menu?.open && !menu.contains(event.target as Node)) menu.open = false;
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, []);

  const transparent = overHero && !open;

  return (
    <header
      data-over-hero={transparent ? 'true' : 'false'}
      className={`marketing-nav font-display sticky top-0 z-30 transition-[background,border-color] duration-200 ${
        transparent ? 'border-b border-transparent bg-transparent' : 'border-b border-[var(--line)] bg-white/90 backdrop-blur-md'
      }`}
    >
      <nav aria-label="Main" className="marketing-wrap flex h-16 items-center gap-3">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-[var(--ink)]" aria-label="Arcuex home">
          <MarketingMark className="h-[22px] w-[22px]" />
          <span className="text-[13px] font-bold tracking-[0.16em]">ARCUEX</span>
        </Link>

        <ul className="ml-4 hidden items-center gap-0.5 lg:flex">
          <li>
            <details ref={productMenu} className="marketing-menu relative">
              <summary className="marketing-nav-link">
                Product
                <CaretDown size={12} weight="bold" aria-hidden="true" />
              </summary>
              <div className="marketing-menu-panel">
                {productLinks.map((item) => (
                  <Link key={item.href} href={item.href} className="marketing-menu-item">
                    {item.label}
                    <span>{item.note}</span>
                  </Link>
                ))}
              </div>
            </details>
          </li>
          {anchors.map((item) => (
            <li key={item.href}>
              <a href={item.href} className="marketing-nav-link">
                {item.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="marketing-nav-end ml-auto flex items-center gap-1 sm:gap-2">
          <Link href="/dashboard" className="marketing-nav-link hidden sm:inline-flex">
            Dashboard
          </Link>
          <Link href="/coverage" className="marketing-nav-pill max-sm:!hidden">
            Explore coverage
            <ArrowRight size={14} weight="bold" aria-hidden="true" />
          </Link>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[var(--ink)] hover:bg-black/5 lg:hidden"
            aria-expanded={open}
            aria-controls="marketing-menu"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X size={18} aria-hidden="true" /> : <List size={18} aria-hidden="true" />}
            <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
          </button>
        </div>
      </nav>

      {open ? (
        <div id="marketing-menu" className="border-t border-[var(--line)] bg-white lg:hidden">
          <ul className="marketing-wrap grid gap-0.5 py-3 font-sans text-[0.9375rem] font-medium text-[var(--ink)]">
            {productLinks.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="block rounded-lg px-2 py-2.5 hover:bg-[var(--surface-inset)]" onClick={() => setOpen(false)}>
                  {item.label}
                  <span className="block text-[0.8125rem] font-normal text-[var(--ink-muted)]">{item.note}</span>
                </Link>
              </li>
            ))}
            {anchors.map((item) => (
              <li key={item.href}>
                <a href={item.href} className="block rounded-lg px-2 py-2.5 hover:bg-[var(--surface-inset)]" onClick={() => setOpen(false)}>
                  {item.label}
                </a>
              </li>
            ))}
            <li className="mt-2 sm:hidden">
              <Link href="/coverage" className="marketing-cta w-full" onClick={() => setOpen(false)}>
                Explore coverage
                <ArrowRight size={16} weight="bold" aria-hidden="true" />
              </Link>
            </li>
          </ul>
        </div>
      ) : null}
    </header>
  );
}
