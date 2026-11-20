import { IBM_Plex_Mono, IBM_Plex_Sans, Inter_Tight } from 'next/font/google';

/** UI + body text. */
export const fontSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-plex-sans',
});

/** Hashes, addresses, identifiers and code only. */
export const fontMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-plex-mono',
});

/** Display: hero, section heads, page titles, key figures. */
export const fontDisplay = Inter_Tight({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
  variable: '--font-inter-tight',
});
