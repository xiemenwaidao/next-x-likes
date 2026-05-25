/**
 * Phase 2 AI バッチ: 画像主体ツイートのメディアを /tmp にダウンロードし、
 * Claude Code の Read ツールでマルチモーダル入力できるようパスを返す。
 *
 * Usage:
 *   pnpm tsx src/scripts/fetch-media.ts --tweet-id 1234567890
 *   pnpm tsx src/scripts/fetch-media.ts --tweet-id 1234567890 --max 4
 *   pnpm tsx src/scripts/fetch-media.ts --clean
 *
 * 出力 (stdout, JSON):
 *   { "tweet_id": "...", "paths": ["/tmp/likes-img-cache/<id>/0.jpg", ...] }
 *
 * 動画は media_url_https がサムネ静止画なのでそれをそのまま DL する。
 */
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { getDb } from '../lib/db';

const CACHE_ROOT = '/tmp/likes-img-cache';
const MAX_PER_TWEET = 4;
const TIMEOUT_SEC = 15;

type Args = {
  tweetId: string | null;
  max: number;
  clean: boolean;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let tweetId: string | null = null;
  let max = MAX_PER_TWEET;
  let clean = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tweet-id') tweetId = argv[++i] ?? null;
    else if (a === '--max') max = parseInt(argv[++i] ?? `${MAX_PER_TWEET}`, 10);
    else if (a === '--clean') clean = true;
  }
  if (!Number.isFinite(max) || max <= 0) max = MAX_PER_TWEET;
  if (max > 8) max = 8;
  return { tweetId, max, clean };
}

function extension(url: string): string {
  const clean = url.split('?')[0];
  const m = clean.match(/\.([a-zA-Z0-9]{2,5})$/);
  return m ? `.${m[1].toLowerCase()}` : '.jpg';
}

function curl(url: string, outPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('curl', [
      '-fsSL',
      '--max-time',
      `${TIMEOUT_SEC}`,
      '-o',
      outPath,
      url,
    ]);
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

async function downloadTweet(tweetId: string, max: number) {
  const db = getDb();
  const res = await db.execute({
    sql: 'SELECT raw_json FROM likes WHERE tweet_id = ? LIMIT 1',
    args: [tweetId],
  });
  if (res.rows.length === 0) {
    throw new Error(`tweet_id=${tweetId} が DB に存在しない`);
  }
  const rawJsonStr = String(res.rows[0].raw_json ?? '{}');
  let raw: unknown = {};
  try {
    raw = JSON.parse(rawJsonStr);
  } catch {
    raw = {};
  }
  const md = (raw as { mediaDetails?: unknown }).mediaDetails;
  if (!Array.isArray(md) || md.length === 0) {
    process.stdout.write(JSON.stringify({ tweet_id: tweetId, paths: [] }) + '\n');
    return;
  }

  const dir = path.join(CACHE_ROOT, tweetId);
  await fs.mkdir(dir, { recursive: true });

  const paths: string[] = [];
  for (let i = 0; i < md.length && paths.length < max; i++) {
    const item = md[i];
    if (!item || typeof item !== 'object') continue;
    const url = (item as { media_url_https?: unknown }).media_url_https;
    if (typeof url !== 'string' || !url) continue;
    const out = path.join(dir, `${i}${extension(url)}`);
    // 既にあればスキップ
    try {
      const stat = await fs.stat(out);
      if (stat.size > 0) {
        paths.push(out);
        continue;
      }
    } catch {
      // not exists
    }
    const ok = await curl(url, out);
    if (ok) paths.push(out);
    else process.stderr.write(`[fetch-media] failed: ${url}\n`);
  }

  process.stdout.write(JSON.stringify({ tweet_id: tweetId, paths }) + '\n');
}

async function cleanAll() {
  try {
    await fs.rm(CACHE_ROOT, { recursive: true, force: true });
    process.stderr.write(`[fetch-media] cleaned ${CACHE_ROOT}\n`);
  } catch (e) {
    process.stderr.write(`[fetch-media] clean failed: ${(e as Error).message}\n`);
  }
}

async function main() {
  const args = parseArgs();
  if (args.clean) {
    await cleanAll();
    return;
  }
  if (!args.tweetId) {
    process.stderr.write('--tweet-id <id> が必要 (または --clean)\n');
    process.exit(1);
  }
  await downloadTweet(args.tweetId, args.max);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
