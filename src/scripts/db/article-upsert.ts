/**
 * 記事要約サブエージェント (article-summarizer) 用: 要約を articles に書き戻す。
 *
 * Usage:
 *   pnpm tsx src/scripts/db/article-upsert.ts --file /path/to/results.json
 *
 * 入力 (JSON array): [{ "tweet_id": "...", "summary_ja": "..." }]
 * 出力 (stderr): 件数サマリ
 */
import { promises as fs } from 'fs';
import { getDb } from '../../lib/db';

async function main() {
  const i = process.argv.indexOf('--file');
  const file = i >= 0 ? process.argv[i + 1] : undefined;
  if (!file) throw new Error('--file is required');
  const input: unknown = JSON.parse(await fs.readFile(file, 'utf-8'));
  if (!Array.isArray(input)) throw new Error('input must be a JSON array');

  const db = getDb();
  const now = new Date().toISOString();
  let updated = 0;
  let invalid = 0;
  for (const r of input) {
    const id = typeof r?.tweet_id === 'string' ? r.tweet_id : null;
    const summary = typeof r?.summary_ja === 'string' ? r.summary_ja.trim() : '';
    if (!id || !summary) {
      invalid++;
      continue;
    }
    const res = await db.execute({
      sql: `UPDATE articles SET summary_ja = ?, summary_updated_at = ?
             WHERE tweet_id = ? AND status = 'ok'`,
      args: [summary, now, id],
    });
    updated += res.rowsAffected;
  }
  console.error(`updated=${updated} invalid=${invalid}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
