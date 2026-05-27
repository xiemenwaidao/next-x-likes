/**
 * Phase 2 AI バッチ: 未処理ツイートを N 件取り出してサブエージェントに渡す形に整形して JSON で出力する。
 *
 * Usage:
 *   pnpm tsx src/scripts/db/next-batch.ts --limit 20 [--media-only] [--text-only]
 *
 * 出力 (stdout, JSON array):
 *   [{
 *     tweet_id, text, username, tweet_url, liked_at, source,
 *     is_text_short, has_media, has_raw_json,
 *     media: [{ type, thumb_url, expanded_url }],
 *     quoted: { text, username } | null,
 *     card_title: string | null,
 *     card_description: string | null
 *   }, ...]
 *
 * 注: stdout は純粋な JSON。ログは stderr に出す。
 */
import { getDb } from '../../lib/db';

type Args = {
  limit: number;
  mediaOnly: boolean;
  textOnly: boolean;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let limit = 20;
  let mediaOnly = false;
  let textOnly = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') {
      limit = parseInt(argv[++i] ?? '20', 10);
    } else if (a === '--media-only') {
      mediaOnly = true;
    } else if (a === '--text-only') {
      textOnly = true;
    }
  }
  if (!Number.isFinite(limit) || limit <= 0) limit = 20;
  if (limit > 200) limit = 200;
  return { limit, mediaOnly, textOnly };
}

const SHORT_TEXT_THRESHOLD = 30;

type MediaItem = {
  type: string;
  thumb_url: string;
  expanded_url?: string;
};

type OutItem = {
  tweet_id: string;
  text: string;
  username: string;
  tweet_url: string;
  liked_at: string;
  source: string;
  is_text_short: boolean;
  has_media: boolean;
  has_raw_json: boolean;
  media: MediaItem[];
  quoted: { text: string; username: string } | null;
  card_title: string | null;
  card_description: string | null;
};

function extractMedia(rawJson: unknown): MediaItem[] {
  if (!rawJson || typeof rawJson !== 'object') return [];
  const md = (rawJson as { mediaDetails?: unknown }).mediaDetails;
  if (!Array.isArray(md)) return [];
  const out: MediaItem[] = [];
  for (const m of md) {
    if (!m || typeof m !== 'object') continue;
    const type = (m as { type?: unknown }).type;
    const thumb = (m as { media_url_https?: unknown }).media_url_https;
    const expanded = (m as { expanded_url?: unknown }).expanded_url;
    if (typeof type !== 'string' || typeof thumb !== 'string') continue;
    out.push({
      type,
      thumb_url: thumb,
      expanded_url: typeof expanded === 'string' ? expanded : undefined,
    });
    if (out.length >= 4) break;
  }
  return out;
}

function extractQuoted(
  rawJson: unknown,
): { text: string; username: string } | null {
  if (!rawJson || typeof rawJson !== 'object') return null;
  const qt = (rawJson as { quoted_tweet?: unknown }).quoted_tweet;
  if (!qt || typeof qt !== 'object') return null;
  const text = (qt as { text?: unknown }).text;
  const user = (qt as { user?: unknown }).user;
  const sn =
    user && typeof user === 'object'
      ? (user as { screen_name?: unknown }).screen_name
      : undefined;
  if (typeof text !== 'string') return null;
  return {
    text,
    username: typeof sn === 'string' ? sn : '',
  };
}

function extractCard(
  rawJson: unknown,
): { title: string | null; description: string | null } {
  if (!rawJson || typeof rawJson !== 'object') return { title: null, description: null };
  const card = (rawJson as { card?: unknown }).card;
  if (!card || typeof card !== 'object') return { title: null, description: null };
  const bs = (card as { binding_values?: unknown }).binding_values;
  if (!bs || typeof bs !== 'object') return { title: null, description: null };
  const title = (bs as Record<string, { string_value?: unknown }>)['title']
    ?.string_value;
  const desc = (bs as Record<string, { string_value?: unknown }>)['description']
    ?.string_value;
  return {
    title: typeof title === 'string' ? title : null,
    description: typeof desc === 'string' ? desc : null,
  };
}

async function main() {
  const args = parseArgs();
  const db = getDb();

  const res = await db.execute({
    sql: `SELECT tweet_id, text, username, tweet_url, liked_at, source, raw_json
          FROM likes
          WHERE ai_updated_at IS NULL
            AND manual_override = 0
            AND private = 0
            AND notfound = 0
          ORDER BY liked_at DESC
          LIMIT ?`,
    args: [Math.ceil(args.limit * 1.5)], // 多めに取って media/text フィルタ後に limit で切る
  });

  const out: OutItem[] = [];
  for (const row of res.rows) {
    const rawJsonStr = String(row.raw_json ?? '{}');
    let raw: unknown = {};
    try {
      raw = JSON.parse(rawJsonStr);
    } catch {
      raw = {};
    }
    const hasRawJson = rawJsonStr !== '{}' && rawJsonStr.length > 2;
    const media = extractMedia(raw);
    const text = String(row.text ?? '');
    const isTextShort = text.replace(/https?:\/\/\S+/g, '').trim().length < SHORT_TEXT_THRESHOLD;
    const hasMedia = media.length > 0;
    const quoted = extractQuoted(raw);
    const { title: cardTitle, description: cardDesc } = extractCard(raw);

    if (args.mediaOnly && !hasMedia) continue;
    if (args.textOnly && hasMedia) continue;

    out.push({
      tweet_id: String(row.tweet_id),
      text,
      username: String(row.username ?? ''),
      tweet_url: String(row.tweet_url ?? ''),
      liked_at: String(row.liked_at ?? ''),
      source: String(row.source ?? ''),
      is_text_short: isTextShort,
      has_media: hasMedia,
      has_raw_json: hasRawJson,
      media,
      quoted,
      card_title: cardTitle,
      card_description: cardDesc,
    });
    if (out.length >= args.limit) break;
  }

  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  process.stderr.write(`[next-batch] returned ${out.length} items\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
