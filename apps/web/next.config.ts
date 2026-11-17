import { resolve } from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  outputFileTracingRoot: resolve(process.cwd(), '../..'),
  outputFileTracingIncludes: { '/api/**/*': ['../../packages/persistence/src/migrations/*.sql'] },
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
