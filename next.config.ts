import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // data/likes.db を Vercel の Function bundle に含める
  // (server component から better-sqlite3 / libsql で読むため)
  outputFileTracingIncludes: {
    '/**/*': ['./data/likes.db'],
  },
};

export default nextConfig;
