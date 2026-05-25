/**
 * Phase 2 AI バッチ: 分類結果を SQLite に書き戻す。
 *
 * Usage:
 *   pnpm tsx src/scripts/db/upsert-result.ts --file /path/to/results.json
 *   cat results.json | pnpm tsx src/scripts/db/upsert-result.ts
 *
 * 入力フォーマット (JSON array):
 *   [{
 *     "tweet_id": "...",
 *     "parent_category": "tech-ai",
 *     "sub_tags": ["llm", "claude"],
 *     "summary_ja": "..."
 *   }, ...]
 *
 * - parent_category が CATEGORIES に無ければ "other" にフォールバック
 * - manual_override = 1 の行は更新しない (上書き防止)
 * - ai_updated_at は現在時刻 (ISO8601)
 *
 * 出力 (stderr): 件数サマリ
 */
import { promises as fs } from 'fs';
import { getDb } from '../../lib/db';
import { CATEGORY_NAMES } from '../../data/categories';

type Result = {
  tweet_id: string;
  parent_category: string;
  sub_tags?: string[];
  summary_ja?: string;
};

type Args = {
  file: string | null;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let file: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--file') file = argv[++i] ?? null;
  }
  return { file };
}

async function readInput(file: string | null): Promise<string> {
  if (file) {
    return await fs.readFile(file, 'utf-8');
  }
  // stdin
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (c: Buffer) => chunks.push(c));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    process.stdin.on('error', reject);
  });
}

function validate(r: unknown): Result | null {
  if (!r || typeof r !== 'object') return null;
  const obj = r as Record<string, unknown>;
  const id = obj.tweet_id;
  const parent = obj.parent_category;
  if (typeof id !== 'string' || !id) return null;
  if (typeof parent !== 'string' || !parent) return null;
  const subs = Array.isArray(obj.sub_tags)
    ? obj.sub_tags
        .filter((t): t is string => typeof t === 'string' && t.length > 0)
        .slice(0, 6)
    : [];
  const summary = typeof obj.summary_ja === 'string' ? obj.summary_ja : '';
  return {
    tweet_id: id,
    parent_category: parent,
    sub_tags: subs,
    summary_ja: summary,
  };
}

async function main() {
  const args = parseArgs();
  const raw = await readInput(args.file);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    process.stderr.write(`[upsert-result] invalid JSON: ${(e as Error).message}\n`);
    process.exit(1);
  }
  if (!Array.isArray(parsed)) {
    process.stderr.write('[upsert-result] expected JSON array\n');
    process.exit(1);
  }

  const db = getDb();
  const now = new Date().toISOString();
  let updated = 0;
  let skippedInvalid = 0;
  let skippedNoUpdate = 0;
  let normalized = 0;

  const batch: Array<{ sql: string; args: (string | number | null)[] }> = [];

  for (const item of parsed) {
    const r = validate(item);
    if (!r) {
      skippedInvalid++;
      continue;
    }
    let parent = r.parent_category;
    if (!CATEGORY_NAMES.includes(parent)) {
      parent = 'other';
      normalized++;
    }
    batch.push({
      sql: `UPDATE likes
            SET parent_category = ?,
                sub_tags = ?,
                summary_ja = ?,
                ai_updated_at = ?
            WHERE tweet_id = ?
              AND manual_override = 0`,
      args: [
        parent,
        JSON.stringify(r.sub_tags ?? []),
        r.summary_ja ?? '',
        now,
        r.tweet_id,
      ],
    });
  }

  if (batch.length > 0) {
    const results = await db.batch(batch, 'write');
    for (const res of results) {
      // libsql の result には rowsAffected が入る。0 件は「行なし」または「manual_override=1」
      const affected = (res as { rowsAffected?: number }).rowsAffected ?? 0;
      if (affected > 0) updated++;
      else skippedNoUpdate++;
    }
  }

  process.stderr.write(
    `[upsert-result] updated=${updated} normalized_to_other=${normalized} skipped_no_update=${skippedNoUpdate} skipped_invalid=${skippedInvalid}\n`,
  );
  process.stdout.write(
    JSON.stringify({
      updated,
      normalized_to_other: normalized,
      skipped_no_update: skippedNoUpdate,
      skipped_invalid: skippedInvalid,
    }) + '\n',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
