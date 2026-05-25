/**
 * 既存 src/content/likes/YYYY/MM/DD.json を SQLite (data/likes.db) に bulk insert する一回限り想定の移行スクリプト。
 * Phase 1: データ基盤の置換。
 *
 * 実行: `pnpm db:migrate`
 * 冪等: tweet_id を主キーに ON CONFLICT REPLACE するので何度流しても OK。
 */
import { createClient } from '@libsql/client';
import { promises as fs } from 'fs';
import path from 'path';

type AnyLike = {
  text?: string;
  username?: string;
  tweet_url?: string;
  first_link?: string;
  created_at?: string;
  liked_at?: string;
  source?: string;
  tweet_id?: string;
  react_tweet_data?: unknown;
  private?: boolean;
  notfound?: boolean;
};

type DayJson = { body: AnyLike[] };

type ArchiveLike = {
  id: string;
  tweetId: string;
  fullText: string;
  expandedUrl: string;
  isArchive: boolean;
  processedAt: string;
};

async function walkJson(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkJson(p)));
    else if (e.name.endsWith('.json')) out.push(p);
  }
  return out;
}

async function main() {
  const cwd = process.cwd();
  const dbPath = process.env.LIKES_DB_PATH
    ? process.env.LIKES_DB_PATH
    : path.join(cwd, 'data', 'likes.db');

  const client = createClient({ url: `file:${dbPath}` });

  // 接続確認
  const tableCheck = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='likes'",
  );
  if (tableCheck.rows.length === 0) {
    throw new Error(
      `likes テーブルが存在しません。先に \`pnpm db:init\` を実行してください。`,
    );
  }

  const likesDir = path.join(cwd, 'src', 'content', 'likes');
  const files = await walkJson(likesDir);
  console.log(`[scan] ${files.length} 個の JSON を読み込みます`);

  let total = 0;
  let inserted = 0;
  let skipped = 0;

  // バッチ単位で transaction
  const BATCH = 500;
  let buffer: Array<{ sql: string; args: (string | number | null)[] }> = [];

  const flush = async () => {
    if (buffer.length === 0) return;
    await client.batch(buffer, 'write');
    buffer = [];
  };

  for (const file of files) {
    const json: DayJson = JSON.parse(await fs.readFile(file, 'utf-8'));
    for (const like of json.body || []) {
      total++;
      if (!like.tweet_id) {
        skipped++;
        continue;
      }

      const source = like.source || 'ifttt';
      const liked_at = like.liked_at || '';
      if (!liked_at) {
        skipped++;
        continue;
      }

      buffer.push({
        sql: `INSERT INTO likes (
                tweet_id, text, username, tweet_url, liked_at, created_at,
                source, private, notfound, raw_json
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(tweet_id) DO UPDATE SET
                text = excluded.text,
                username = excluded.username,
                tweet_url = excluded.tweet_url,
                liked_at = excluded.liked_at,
                created_at = excluded.created_at,
                source = excluded.source,
                private = excluded.private,
                notfound = excluded.notfound,
                raw_json = excluded.raw_json`,
        args: [
          like.tweet_id,
          like.text ?? '',
          like.username ?? '',
          like.tweet_url ?? '',
          liked_at,
          like.created_at ?? null,
          source,
          like.private ? 1 : 0,
          like.notfound ? 1 : 0,
          like.react_tweet_data ? JSON.stringify(like.react_tweet_data) : '{}',
        ],
      });
      inserted++;

      if (buffer.length >= BATCH) {
        await flush();
        if (inserted % 2000 === 0) {
          console.log(`  ${inserted} 件 upsert`);
        }
      }
    }
  }
  await flush();

  // ===== Archive likes (旧 Twitter 公式アーカイブ由来) =====
  const archivePath = path.join(
    cwd,
    'src',
    'content',
    'archive',
    'archive-likes.json',
  );
  try {
    const archiveRaw = await fs.readFile(archivePath, 'utf-8');
    const archive: ArchiveLike[] = JSON.parse(archiveRaw);
    console.log(`[scan] archive: ${archive.length} 件`);
    let archInserted = 0;
    for (const a of archive) {
      if (!a.tweetId) continue;
      buffer.push({
        sql: `INSERT INTO likes (
                tweet_id, text, username, tweet_url, liked_at, created_at,
                source, private, notfound, raw_json
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(tweet_id) DO NOTHING`,
        args: [
          a.tweetId,
          a.fullText ?? '',
          '',
          a.expandedUrl ?? '',
          a.processedAt || new Date(0).toISOString(),
          null,
          'archive',
          0,
          0,
          '{}',
        ],
      });
      archInserted++;
      if (buffer.length >= BATCH) {
        await flush();
      }
    }
    await flush();
    console.log(`[done] archive queued=${archInserted}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log('[skip] archive-likes.json が見つからないのでスキップ');
    } else {
      throw err;
    }
  }

  const cnt = await client.execute('SELECT COUNT(*) AS n FROM likes');
  const bySrc = await client.execute(
    'SELECT source, COUNT(*) AS n FROM likes GROUP BY source',
  );
  console.log(
    `[done] scanned=${total} upserted=${inserted} skipped=${skipped}, total in db=${cnt.rows[0].n}`,
  );
  for (const row of bySrc.rows) {
    console.log(`  source=${row.source}: ${row.n}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
