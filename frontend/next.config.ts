import type { NextConfig } from 'next';
const config: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_URL || 'http://localhost:4000'}/api/:path*`,
      },
    ];
  },
  poweredByHeader: false,
  turbopack:{root:process.cwd()},
  devIndicators: false,
};
export default config;
