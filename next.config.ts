import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Phase E 以降は全ページ force-static。Server Component の SQLite アクセスは
  // BUILD 時のみで、runtime の Lambda Function には DB / 元 JSON / 重い script
  // 系依存を一切含めない。
  // outputFileTracingExcludes のキーは "*" (全ページ) を指定。
  outputFileTracingExcludes: {
    '*': [
      // build 時にしか使わないデータと scripts
      './data/**/*',
      './src/content/**/*',
      './src/scripts/**/*',
      './src/assets/**/*',
      './public/data/**/*',
      // runtime では使わない依存 (script ベース or client dynamic import)
      './node_modules/@huggingface/**/*',
      './node_modules/@libsql/**/*',
      './node_modules/algoliasearch/**/*',
      './node_modules/react-tweet/**/*',
      './node_modules/@aws-sdk/**/*',
      './node_modules/onnxruntime-**/**/*',
      './node_modules/minisearch/**/*',
    ],
  },
};

export default nextConfig;
