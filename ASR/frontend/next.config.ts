import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Allow large audio file uploads (up to 200 MB)
      bodySizeLimit: '200mb',
    },
  },
};

export default nextConfig;
