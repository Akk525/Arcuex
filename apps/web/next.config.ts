import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@arcuex/chain', '@arcuex/quicknode'],
  reactStrictMode: true,
};

export default nextConfig;
