import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { cookieToInitialState } from 'wagmi';
import { AppProviders } from '@/providers/app-providers';
import { createWagmiConfig } from '@/lib/wagmi';
import { fontDisplay, fontMono, fontSans } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: 'Arcuex — Insurance for autonomous agents',
  description:
    'Procurement, delegated authority, evidence-backed claims, human adjudication, and controlled Arc settlement.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headerStore = await headers();
  const cookie = headerStore.get('cookie') ?? undefined;
  const fixtureMode = process.env.ARCUEX_CHAIN_SOURCE === 'fixture';
  const initialState = cookieToInitialState(createWagmiConfig(fixtureMode), cookie);

  return (
    <html lang="en" className={`${fontSans.variable} ${fontMono.variable} ${fontDisplay.variable}`}>
      <body>
        <AppProviders initialState={initialState} fixtureMode={fixtureMode}>
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
