/**
 * Phase 2 AI バッチ: いいねツイートのローカル embedding 生成。
 *
 * モデル: Xenova/multilingual-e5-small (384 次元、多言語対応)
 * 完全ローカル推論 (@huggingface/transformers)。外部 API 呼び出しなし。
 *
 * Usage:
 *   pnpm tsx src/scripts/embed-likes.ts                # 未 embed 全件
 *   pnpm tsx src/scripts/embed-likes.ts --limit 100    # 上限付き
 *   pnpm tsx src/scripts/embed-likes.ts --force        # 既存も再生成
 *
 * 入力テキスト構築 (e5 系は "passage: " プレフィックス推奨):
 *   passage: <text>
 *   [quoted: <quoted.text>]
 *   [card: <card_title> - <card_description>]
 *   [summary: <summary_ja>]
 *
 * 出力: SQLite likes.embedding (Float32Array BLOB), embedding_model = 'Xenova/multilingual-e5-small'
 */
import { pipeline, env } from '@huggingface/transformers';
import { getDb } from '../lib/db';

// ローカルキャッシュ (デフォルトは ~/.cache だが、リポジトリ外を維持する)
env.cacheDir = process.env.HF_CACHE_DIR ?? `${process.env.HOME}/.cache/huggingface`;
env.allowRemoteModels = true;

const MODEL_ID = 'Xenova/multilingual-e5-small';
const EMBED_DIM = 384;
const BATCH_SIZE = 16; // CPU 推論で OOM しないライン
const TEXT_MAX_CHARS = 1000;

type Args = {
  limit: number | null;
  force: boolean;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let limit: number | null = null;
  let force = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--limit') {
      limit = parseInt(argv[++i] ?? '0', 10);
      if (!Number.isFinite(limit) || limit <= 0) limit = null;
    } else if (argv[i] === '--force') {
      force = true;
    }
  }
  return { limit, force };
}

type Row = {
  tweet_id: string;
  text: string;
  raw_json: string;
  summary_ja: string | null;
};

function buildInput(row: Row): string {
  const parts: string[] = [];
  const text = (row.text ?? '').replace(/https?:\/\/\S+/g, '').trim();
  parts.push(text);

  try {
    const raw = JSON.parse(row.raw_json || '{}') as {
      quoted_tweet?: { text?: string };
      card?: { binding_values?: Record<string, { string_value?: string }> };
    };
    const qt = raw.quoted_tweet?.text?.trim();
    if (qt) parts.push(`quoted: ${qt}`);
    const cardTitle = raw.card?.binding_values?.title?.string_value;
    const cardDesc = raw.card?.binding_values?.description?.string_value;
    if (cardTitle) {
      const card = cardDesc ? `${cardTitle} - ${cardDesc}` : cardTitle;
      parts.push(`card: ${card}`);
    }
  } catch {
    /* noop */
  }

  if (row.summary_ja) parts.push(`summary: ${row.summary_ja}`);

  const joined = parts.join('\n').slice(0, TEXT_MAX_CHARS);
  return `passage: ${joined}`;
}

function toFloat32Buffer(vec: number[] | Float32Array): Buffer {
  const f32 = vec instanceof Float32Array ? vec : new Float32Array(vec);
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
}

async function main() {
  const args = parseArgs();
  const db = getDb();

  const whereClause = args.force
    ? 'WHERE 1=1'
    : 'WHERE embedding IS NULL';
  const limitClause = args.limit ? `LIMIT ${args.limit}` : '';
  const res = await db.execute(
    `SELECT tweet_id, text, raw_json, summary_ja
     FROM likes
     ${whereClause}
     ORDER BY liked_at DESC
     ${limitClause}`,
  );

  const rows: Row[] = res.rows.map((r) => ({
    tweet_id: String(r.tweet_id),
    text: String(r.text ?? ''),
    raw_json: String(r.raw_json ?? '{}'),
    summary_ja: r.summary_ja ? String(r.summary_ja) : null,
  }));

  if (rows.length === 0) {
    console.log('[embed] 対象なし');
    return;
  }

  console.log(`[embed] target=${rows.length} model=${MODEL_ID}`);
  console.log('[embed] loading model (初回は数百 MB DL)...');

  const extractor = await pipeline('feature-extraction', MODEL_ID, {
    dtype: 'fp32',
  });

  const startedAt = Date.now();
  let done = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const inputs = batch.map(buildInput);
    const out = await extractor(inputs, { pooling: 'mean', normalize: true });
    // out.data は Float32Array (N * EMBED_DIM)、out.dims = [N, EMBED_DIM]
    const data = out.data as Float32Array;
    const dims = (out as { dims: number[] }).dims;
    if (dims[1] !== EMBED_DIM) {
      throw new Error(`embedding dim mismatch: expected ${EMBED_DIM}, got ${dims[1]}`);
    }

    const writes: Array<{ sql: string; args: (string | number | Uint8Array | null)[] }> = [];
    for (let j = 0; j < batch.length; j++) {
      const vec = data.subarray(j * EMBED_DIM, (j + 1) * EMBED_DIM);
      const buf = toFloat32Buffer(vec);
      writes.push({
        sql: `UPDATE likes
              SET embedding = ?,
                  embedding_model = ?
              WHERE tweet_id = ?`,
        args: [new Uint8Array(buf), MODEL_ID, batch[j].tweet_id],
      });
    }
    await db.batch(writes, 'write');

    done += batch.length;
    if (done % 64 === 0 || done === rows.length) {
      const elapsed = (Date.now() - startedAt) / 1000;
      const rate = done / elapsed;
      const remain = Math.max(0, rows.length - done);
      const eta = rate > 0 ? Math.round(remain / rate) : 0;
      console.log(
        `[embed] ${done}/${rows.length} (${rate.toFixed(1)}/sec, eta ${eta}s)`,
      );
    }
  }

  const totalElapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`[embed] done ${rows.length} embeddings in ${totalElapsed}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
