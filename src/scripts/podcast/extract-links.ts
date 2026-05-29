/**
 * PodcastTweetBundle (stdin) を読んで、外部 URL を抽出 + キャッシュと照合して
 * fetch すべき URL を決める。
 *
 * Usage:
 *   pnpm tsx src/scripts/podcast/extract-links.ts < /tmp/podcast-tweets.json > /tmp/podcast-link-tasks.json
 *
 * Output (stdout, JSON):
 *   {
 *     need_fetch: string[],          // サブエージェントが取りに行くべき URL
 *     already_cached_count: number,  // cache hit (= fresh) の件数
 *     total_unique: number,          // 重複排除後の総 URL 数
 *     by_tweet: Record<string, string[]> // tweet_id → 関連 URLs (脚本作成時に参照)
 *   }
 *
 * cache 仕様 (data/podcast-link-cache.json):
 *   - 30 日以内に fetched_at がついていて error が無いものは "fresh" 扱いで skip
 *   - error 付きエントリは fresh と見なさず再 fetch する
 */
import fs from 'node:fs';
import path from 'node:path';
import type { LinkSummary, LinkSummaryCache, PodcastTweetBundle } from './types';

const CACHE_PATH = path.join(process.cwd(), 'data', 'podcast-link-cache.json');
const TTL_MS = 30 * 86400_000; // 30 日

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (buf += chunk));
    process.stdin.on('end', () => resolve(buf));
    process.stdin.on('error', (e) => reject(e));
  });
}

function loadCache(): LinkSummaryCache {
  if (!fs.existsSync(CACHE_PATH)) return { entries: {} };
  try {
    const raw = fs.readFileSync(CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as LinkSummaryCache;
    if (parsed && typeof parsed === 'object' && parsed.entries && typeof parsed.entries === 'object') {
      return parsed;
    }
  } catch {
    process.stderr.write(`[extract-links] cache file corrupt, ignoring: ${CACHE_PATH}\n`);
  }
  return { entries: {} };
}

function isCacheFresh(entry: LinkSummary | undefined): boolean {
  if (!entry || !entry.fetched_at) return false;
  if (entry.error) return false; // エラーは再 fetch する
  const age = Date.now() - Date.parse(entry.fetched_at);
  return Number.isFinite(age) && age >= 0 && age < TTL_MS;
}

async function main() {
  const raw = await readStdin();
  let bundle: PodcastTweetBundle;
  try {
    bundle = JSON.parse(raw) as PodcastTweetBundle;
  } catch (e) {
    process.stderr.write(`[extract-links] failed to parse stdin: ${e}\n`);
    process.exit(1);
    return;
  }
  if (!bundle?.tweets || !Array.isArray(bundle.tweets)) {
    process.stderr.write('[extract-links] stdin is not a PodcastTweetBundle\n');
    process.exit(1);
    return;
  }

  const cache = loadCache();

  const by_tweet: Record<string, string[]> = {};
  const allUrls = new Set<string>();
  for (const t of bundle.tweets) {
    if (!t.external_urls || t.external_urls.length === 0) continue;
    by_tweet[t.tweet_id] = t.external_urls;
    for (const u of t.external_urls) allUrls.add(u);
  }

  const need_fetch: string[] = [];
  let already_cached_count = 0;
  for (const u of allUrls) {
    if (isCacheFresh(cache.entries[u])) {
      already_cached_count += 1;
    } else {
      need_fetch.push(u);
    }
  }

  const out = {
    need_fetch,
    already_cached_count,
    total_unique: allUrls.size,
    by_tweet,
  };
  process.stdout.write(JSON.stringify(out, null, 2));
  process.stderr.write(
    `[extract-links] total_unique=${out.total_unique} need_fetch=${need_fetch.length} cached=${already_cached_count}\n`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
