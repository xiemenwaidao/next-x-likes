/**
 * 指定期間 (JST) のいいねを data/likes.db から取り出して PodcastTweetBundle を stdout に出す。
 *
 * Usage:
 *   pnpm tsx src/scripts/podcast/fetch-period.ts [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--days N]
 *
 * デフォルト: 今日 (JST) を基準に直近 7 日間。
 * 出力: stdout に PodcastTweetBundle (JSON)。ログは stderr。
 */
import { getDb } from '../../lib/db';
import type { PeriodSpec, PodcastTweet, PodcastTweetBundle } from './types';

type Args = {
  from: string | null;
  to: string | null;
  days: number | null;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let from: string | null = null;
  let to: string | null = null;
  let days: number | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from') from = argv[++i] ?? null;
    else if (a === '--to') to = argv[++i] ?? null;
    else if (a === '--days') days = Number(argv[++i] ?? '');
  }
  return { from, to, days };
}

/** JST (UTC+9) で「今日」の YYYY-MM-DD を返す */
function todayJST(): string {
  const ms = Date.now() + 9 * 3600 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** YYYY-MM-DD から N 日前の YYYY-MM-DD を返す */
function daysAgo(baseYmd: string, n: number): string {
  const ms = Date.parse(`${baseYmd}T00:00:00Z`) - n * 86400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function resolvePeriod(args: Args): PeriodSpec {
  const to = args.to ?? todayJST();
  let from = args.from;
  if (!from) {
    const days = args.days && Number.isFinite(args.days) && args.days > 0 ? args.days : 7;
    from = daysAgo(to, days - 1);
  }
  return { from, to };
}

function isExternalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    if (h === 'x.com' || h.endsWith('.x.com')) return false;
    if (h === 'twitter.com' || h.endsWith('.twitter.com')) return false;
    if (h === 't.co' || h.endsWith('.t.co')) return false;
    return true;
  } catch {
    return false;
  }
}

function extractExternalUrls(rawJsonStr: string | null): string[] {
  if (!rawJsonStr) return [];
  try {
    const j: unknown = JSON.parse(rawJsonStr);
    const urls = new Set<string>();
    const ent =
      j && typeof j === 'object'
        ? (j as { entities?: { urls?: unknown } }).entities?.urls
        : undefined;
    if (Array.isArray(ent)) {
      for (const e of ent) {
        if (!e || typeof e !== 'object') continue;
        const expanded = (e as { expanded_url?: unknown }).expanded_url;
        if (typeof expanded === 'string' && isExternalUrl(expanded)) {
          urls.add(expanded);
        }
      }
    }
    return Array.from(urls);
  } catch {
    return [];
  }
}

function hasMediaIn(rawJsonStr: string | null): boolean {
  if (!rawJsonStr) return false;
  try {
    const j: unknown = JSON.parse(rawJsonStr);
    if (!j || typeof j !== 'object') return false;
    const md = (j as { mediaDetails?: unknown }).mediaDetails;
    if (Array.isArray(md) && md.length > 0) return true;
    const ent = (j as { entities?: { media?: unknown } }).entities?.media;
    if (Array.isArray(ent) && ent.length > 0) return true;
    return false;
  } catch {
    return false;
  }
}

async function main() {
  const period = resolvePeriod(parseArgs());
  const db = getDb();

  // liked_at は ISO 風文字列 (e.g. "2026-05-27T10:23:45Z" など)。
  // 文字列比較で JST 範囲をざっくり取る (UTC ↔ JST のズレで日付境界 9 時間ぶん
  // 緩めに取り、後段で `liked_at_jst` を計算してフィルタする方が厳密だが、
  // ポッドキャスト用途では多少前後 1 日分混ざっても許容)。
  const fromStart = `${period.from}T00:00:00`;
  const toEnd = `${period.to}T23:59:59`;

  process.stderr.write(`[fetch-period] period=${period.from}..${period.to}\n`);

  const res = await db.execute({
    sql: `SELECT tweet_id, username, text, summary_ja, parent_category, sub_tags, liked_at, raw_json
          FROM likes
          WHERE private = 0 AND notfound = 0
            AND liked_at >= ? AND liked_at <= ?
          ORDER BY liked_at ASC`,
    args: [fromStart, toEnd],
  });

  const tweets: PodcastTweet[] = res.rows.map((r) => {
    let sub_tags: string[] = [];
    if (r.sub_tags) {
      try {
        const parsed: unknown = JSON.parse(String(r.sub_tags));
        if (Array.isArray(parsed)) {
          sub_tags = parsed.filter((t): t is string => typeof t === 'string');
        }
      } catch {
        /* noop */
      }
    }
    const rawJsonStr = r.raw_json ? String(r.raw_json) : null;
    return {
      tweet_id: String(r.tweet_id),
      username: String(r.username ?? ''),
      text: r.text ? String(r.text) : null,
      summary_ja: r.summary_ja ? String(r.summary_ja) : null,
      parent_category: r.parent_category ? String(r.parent_category) : null,
      sub_tags,
      liked_at: String(r.liked_at ?? ''),
      has_media: hasMediaIn(rawJsonStr),
      external_urls: extractExternalUrls(rawJsonStr),
    };
  });

  const bundle: PodcastTweetBundle = { period, tweets };
  process.stdout.write(JSON.stringify(bundle, null, 2));
  process.stderr.write(
    `[fetch-period] returned ${tweets.length} tweets ` +
      `(media=${tweets.filter((t) => t.has_media).length}, ` +
      `with_urls=${tweets.filter((t) => t.external_urls.length > 0).length}, ` +
      `unclassified=${tweets.filter((t) => !t.parent_category).length})\n`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
