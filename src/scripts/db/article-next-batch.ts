/**
 * 記事要約サブエージェント (article-summarizer) 用: 要約が未作成の記事を取り出す。
 *
 * Usage:
 *   pnpm tsx src/scripts/db/article-next-batch.ts --limit 25 [--shard 0 --shards 4]
 *
 * stdout に JSON 配列:
 *   [{ "tweet_id", "via", "title", "preview_text", "body_text", "body_chars" }]
 * body_text は長すぎるとコンテキストを圧迫するので MAX_BODY_CHARS で切る。
 * --shard / --shards で対象を分割すると、複数エージェントを並列に走らせても
 * 同じ記事を取り合わない。
 */
import { getDb } from '../../lib/db';

const MAX_BODY_CHARS = 12000;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const limit = Math.min(Number(arg('--limit') ?? 25), 100);
  const shard = Number(arg('--shard') ?? 0);
  const shards = Math.max(Number(arg('--shards') ?? 1), 1);
  const db = getDb();
  const res = await db.execute(
    `SELECT tweet_id, via, title, preview_text, body_text FROM articles
      WHERE status = 'ok' AND summary_ja IS NULL
      ORDER BY tweet_id`,
  );
  const rows = res.rows.filter((_, i) => i % shards === shard).slice(0, limit);
  const out = rows.map((r) => {
    const body = String(r.body_text ?? '');
    return {
      tweet_id: String(r.tweet_id),
      via: String(r.via ?? ''),
      title: String(r.title ?? ''),
      preview_text: String(r.preview_text ?? ''),
      body_text: body.length > MAX_BODY_CHARS ? `${body.slice(0, MAX_BODY_CHARS)}…(以下略)` : body,
      body_chars: body.length,
    };
  });
  process.stdout.write(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
