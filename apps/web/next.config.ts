import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Both workspace packages ship TypeScript sources (`main: src/index.ts`).
  transpilePackages: ['@campuslive/contracts', '@campuslive/map-data'],
  outputFileTracingRoot: new URL('../..', import.meta.url).pathname,
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    optimizePackageImports: ['motion', 'cmdk'],
  },
};

export default withNextIntl(nextConfig);
