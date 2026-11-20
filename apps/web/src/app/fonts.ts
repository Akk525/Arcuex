import localFont from 'next/font/local';

/** UI + body text. */
export const fontSans = localFont({
  src: './font-assets/IBM-Plex-Sans.ttf',
  weight: '400 700',
  display: 'swap',
  variable: '--font-plex-sans',
});

/** Hashes, addresses, identifiers and code only. */
export const fontMono = localFont({
  src: [
    { path: './font-assets/IBM-Plex-Mono-Regular.ttf', weight: '400' },
    { path: './font-assets/IBM-Plex-Mono-Medium.ttf', weight: '500' },
  ],
  display: 'swap',
  preload: false,
  variable: '--font-plex-mono',
});

/** Display: hero, section heads, page titles, key figures. */
export const fontDisplay = localFont({
  src: './font-assets/Inter-Tight.ttf',
  weight: '500 700',
  display: 'swap',
  variable: '--font-inter-tight',
});
