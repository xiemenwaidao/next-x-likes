/**
 * 完成 mp3 を S3 互換オブジェクトストレージ (Cloudflare R2 / AWS S3 など) に
 * アップロードする。Pages の 1GB 上限を回避するための「外部ホスティング移行」用。
 *
 * Usage:
 *   pnpm tsx -r dotenv/config src/scripts/podcast/upload-audio.ts --file <mp3> --key <slug>.mp3
 *
 * 環境変数 (未設定なら "外部ストレージ未設定" として skip し exit 0):
 *   PODCAST_AUDIO_BASE_URL      公開 URL の base (例: https://xxx.r2.dev、末尾スラッシュ無し)
 *   PODCAST_S3_BUCKET           バケット名
 *   PODCAST_S3_ACCESS_KEY_ID    アクセスキー
 *   PODCAST_S3_SECRET_ACCESS_KEY シークレット
 *   PODCAST_S3_ENDPOINT         (R2 のみ必要) 例: https://<accountid>.r2.cloudflarestorage.com
 *   PODCAST_S3_REGION           (任意、default "auto"。AWS なら ap-northeast-1 等)
 *
 * 設計:
 *   - R2 も AWS S3 も S3 互換 API なので @aws-sdk/client-s3 1 本で両対応 (endpoint で切替)
 *   - env が揃っていなければ「Pages 運用継続」とみなして skip (exit 0)。
 *     これにより /podcast パイプラインは外部ストレージ未設定でも壊れず流れる
 *   - 出力 (stdout, JSON): { uploaded: bool, public_url, key } or { uploaded: false, reason }
 */
import fs from 'node:fs';
import path from 'node:path';

type Args = { file: string; key: string };

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let file = '';
  let key = '';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--file') file = argv[++i] ?? '';
    else if (argv[i] === '--key') key = argv[++i] ?? '';
  }
  if (!file) {
    process.stderr.write('Usage: upload-audio.ts --file <mp3> [--key <name.mp3>]\n');
    process.exit(1);
  }
  if (!key) key = path.basename(file);
  return { file, key };
}

function envConfig() {
  return {
    baseUrl: process.env.PODCAST_AUDIO_BASE_URL,
    bucket: process.env.PODCAST_S3_BUCKET,
    accessKeyId: process.env.PODCAST_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.PODCAST_S3_SECRET_ACCESS_KEY,
    endpoint: process.env.PODCAST_S3_ENDPOINT, // R2 のみ
    region: process.env.PODCAST_S3_REGION || 'auto',
  };
}

async function main() {
  const args = parseArgs();
  const cfg = envConfig();

  // 必須 env が揃っていなければ skip (Pages 運用継続)
  const missing = [
    !cfg.baseUrl && 'PODCAST_AUDIO_BASE_URL',
    !cfg.bucket && 'PODCAST_S3_BUCKET',
    !cfg.accessKeyId && 'PODCAST_S3_ACCESS_KEY_ID',
    !cfg.secretAccessKey && 'PODCAST_S3_SECRET_ACCESS_KEY',
  ].filter(Boolean);

  if (missing.length > 0) {
    process.stderr.write(
      `[upload-audio] 外部ストレージ未設定 (${missing.join(', ')})。skip して Pages 運用を継続します。\n`,
    );
    process.stdout.write(
      JSON.stringify({ uploaded: false, reason: 'not_configured', missing }, null, 2),
    );
    process.exit(0);
  }

  if (!fs.existsSync(args.file)) {
    process.stderr.write(`[upload-audio] file not found: ${args.file}\n`);
    process.exit(1);
  }

  // @aws-sdk/client-s3 は devDependencies に存在 (S3 / R2 両対応)
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint || undefined, // 未指定なら AWS の既定 endpoint
    credentials: {
      accessKeyId: cfg.accessKeyId as string,
      secretAccessKey: cfg.secretAccessKey as string,
    },
  });

  const body = fs.readFileSync(args.file);
  const sizeMb = (body.length / 1024 / 1024).toFixed(1);
  process.stderr.write(
    `[upload-audio] PUT ${args.key} (${sizeMb} MB) → bucket=${cfg.bucket} endpoint=${cfg.endpoint || 'AWS'}\n`,
  );

  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: args.key,
      Body: body,
      ContentType: 'audio/mpeg',
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );

  const publicUrl = `${cfg.baseUrl!.replace(/\/$/, '')}/${args.key}`;
  process.stdout.write(JSON.stringify({ uploaded: true, public_url: publicUrl, key: args.key }, null, 2));
  process.stderr.write(`[upload-audio] done → ${publicUrl}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
