import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Cache components explicitly kept off per rules.md §9
  cacheComponents: false,
};

export default nextConfig;

