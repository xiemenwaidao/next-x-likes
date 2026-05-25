import { createClient } from '@libsql/client';
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { CATEGORIES } from '../../data/categories';

async function main() {
  const dbPath = process.env.LIKES_DB_PATH
    ? process.env.LIKES_DB_PATH
    : path.join(process.cwd(), 'data', 'likes.db');

  const dbDir = path.dirname(dbPath);
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

  const migrationsDir = path.join(process.cwd(), 'data', 'migrations');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const client = createClient({ url: `file:${dbPath}` });

  // 既適用バージョンを確認 (テーブルが無ければ先頭ファイルで作られる)
  let applied = new Set<string>();
  try {
    const res = await client.execute('SELECT version FROM schema_migrations');
    applied = new Set(res.rows.map((r) => String(r.version)));
  } catch {
    applied = new Set();
  }

  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (applied.has(version)) {
      console.log(`[skip] ${file} already applied`);
      continue;
    }

    const rawSql = readFileSync(path.join(migrationsDir, file), 'utf-8');
    // 行頭が `--` のコメント行を先に剥がしてから ; で分割する
    // （statement の直前にコメントがあると startsWith('--') で statement ごと捨ててしまうため）
    const sql = rawSql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    const statements = sql
      .split(/;\s*$/m)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    console.log(`[apply] ${file} (${statements.length} statements)`);
    for (const stmt of statements) {
      await client.execute(stmt);
    }
    await client.execute({
      sql: 'INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)',
      args: [version, new Date().toISOString()],
    });
  }

  // categories seed (upsert)
  for (const c of CATEGORIES) {
    await client.execute({
      sql: `INSERT INTO categories (name, label_ja, order_idx, description)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET
              label_ja = excluded.label_ja,
              order_idx = excluded.order_idx,
              description = excluded.description`,
      args: [c.name, c.label_ja, c.order_idx, c.description],
    });
  }

  const count = await client.execute('SELECT COUNT(*) AS n FROM categories');
  console.log(`[ok] categories: ${count.rows[0].n}`);
  console.log(`[ok] db ready: ${dbPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
