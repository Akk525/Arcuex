import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { cookieToInitialState } from 'wagmi';
import { AppProviders } from '@/providers/app-providers';
import { createWagmiConfig } from '@/lib/wagmi';
import './globals.css';

export const metadata: Metadata = {
  title: 'Arcuex — Arc Testnet',
  description:
    'Programmable financial protection for humans and autonomous agents on Arc Testnet.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headerStore = await headers();
  const cookie = headerStore.get('cookie') ?? undefined;
  const initialState = cookieToInitialState(createWagmiConfig(), cookie);

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AppProviders initialState={initialState}>{children}</AppProviders>
      </body>
    </html>
  );
}
