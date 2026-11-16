import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@arcuex/chain',
    '@arcuex/quicknode',
    '@arcuex/domain',
    '@arcuex/persistence',
    '@arcuex/insurance',
  ],
  serverExternalPackages: ['better-sqlite3'],
  reactStrictMode: true,
};

export default nextConfig;
