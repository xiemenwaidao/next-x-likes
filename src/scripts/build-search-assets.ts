/**
 * Phase 2 検索アセット生成: SQLite → public/data/*.gz をビルド。
 *
 * 生成物 (すべて gzip 圧縮):
 *   public/data/search-index.json.gz   - MiniSearch シリアライズ済み FTS インデックス
 *   public/data/likes-meta.json.gz     - 検索結果の表示用メタ配列 (tweet_id 順)
 *   public/data/embeddings.bin.gz      - int8 量子化済みベクトルを連結したバイナリ (N * 384 * 1 byte)
 *   public/data/embeddings-meta.json.gz - { dim, scale, quant, order } (order = 並び順の tweet_id 配列)
 *
 * Usage:
 *   pnpm tsx src/scripts/build-search-assets.ts
 */
import { promises as fs } from 'fs';
import path from 'path';
import { gzip } from 'zlib';
import { promisify } from 'util';
import MiniSearch from 'minisearch';
import { getDb } from '../lib/db';

const gzipAsync = promisify(gzip);
const OUT_DIR = path.join(process.cwd(), 'public', 'data');
const EMBED_DIM = 384;

type LikeRow = {
  tweet_id: string;
  text: string;
  username: string;
  liked_at: string;
  source: string;
  private: number;
  notfound: number;
  parent_category: string | null;
  sub_tags: string | null;
  summary_ja: string | null;
  embedding: Uint8Array | null;
};

type MetaItem = {
  i: string; // tweet_id
  u: string; // username
  t: string; // text snippet (≤ 200 chars)
  l: string; // liked_at
  c: string | null; // parent_category
  g: string[]; // sub_tags
  s: string | null; // summary_ja
  p: 0 | 1; // private
  n: 0 | 1; // notfound
};

/** Bigram トークナイザ: 日本語向け簡易版。
 *  英数字は連続したまま、その他は 2-gram (重なりあり) で切る。
 *  例: "Claude Code とは" → ["claude", "code", "とは"] + 日本語の bigram
 */
function bigramTokenize(text: string): string[] {
  const tokens: string[] = [];
  const lower = text.toLowerCase();
  const asciiRe = /[a-z0-9][a-z0-9_-]*/g;
  let m: RegExpExecArray | null;
  while ((m = asciiRe.exec(lower)) !== null) {
    if (m[0].length >= 2) tokens.push(m[0]);
  }
  // 非 ASCII 部分の bigram
  const non = lower.replace(/[a-z0-9_\-\s.,!?。、！？「」"'()（）\[\]【】\/]+/g, ' ');
  for (const word of non.split(/\s+/)) {
    if (!word) continue;
    if (word.length === 1) {
      tokens.push(word);
    } else {
      for (let i = 0; i < word.length - 1; i++) {
        tokens.push(word.slice(i, i + 2));
      }
    }
  }
  return tokens;
}

async function writeGz(name: string, data: Buffer | string) {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
  const gz = await gzipAsync(buf, { level: 9 });
  const outPath = path.join(OUT_DIR, name);
  await fs.writeFile(outPath, gz);
  console.log(
    `[write] ${name} ${(buf.length / 1024).toFixed(1)} KB → ${(gz.length / 1024).toFixed(1)} KB`,
  );
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const db = getDb();

  const res = await db.execute(
    `SELECT tweet_id, text, username, liked_at, source, private, notfound,
            parent_category, sub_tags, summary_ja, embedding
     FROM likes
     WHERE private = 0 AND notfound = 0
     ORDER BY liked_at DESC`,
  );

  const rows: LikeRow[] = res.rows.map((r) => ({
    tweet_id: String(r.tweet_id),
    text: String(r.text ?? ''),
    username: String(r.username ?? ''),
    liked_at: String(r.liked_at ?? ''),
    source: String(r.source ?? ''),
    private: Number(r.private ?? 0),
    notfound: Number(r.notfound ?? 0),
    parent_category: r.parent_category ? String(r.parent_category) : null,
    sub_tags: r.sub_tags ? String(r.sub_tags) : null,
    summary_ja: r.summary_ja ? String(r.summary_ja) : null,
    embedding:
      r.embedding instanceof Uint8Array
        ? r.embedding
        : r.embedding
          ? new Uint8Array(r.embedding as ArrayBufferLike)
          : null,
  }));

  console.log(`[scan] ${rows.length} rows`);

  // ===== 1. MiniSearch インデックス =====
  const searchDocs = rows.map((r) => {
    let subs: string[] = [];
    if (r.sub_tags) {
      try {
        const parsed = JSON.parse(r.sub_tags);
        if (Array.isArray(parsed)) subs = parsed.filter((t) => typeof t === 'string');
      } catch {
        /* noop */
      }
    }
    const cleanText = r.text.replace(/https?:\/\/\S+/g, '').trim();
    return {
      id: r.tweet_id,
      text: cleanText,
      username: r.username,
      summary: r.summary_ja ?? '',
      tags: subs.join(' '),
      category: r.parent_category ?? '',
    };
  });

  const ms = new MiniSearch({
    idField: 'id',
    fields: ['text', 'summary', 'username', 'tags', 'category'],
    storeFields: [], // メタは別ファイルで持つので index には載せない
    tokenize: bigramTokenize,
    processTerm: (term) => term.toLowerCase(),
    searchOptions: {
      boost: { summary: 2, text: 1, tags: 1.5, username: 0.5 },
      fuzzy: 0.2,
      prefix: true,
    },
  });
  ms.addAll(searchDocs);

  await writeGz('search-index.json.gz', JSON.stringify(ms));

  // ===== 2. メタ JSON (liked_at DESC 順) =====
  const meta: MetaItem[] = rows.map((r) => {
    let subs: string[] = [];
    if (r.sub_tags) {
      try {
        const parsed = JSON.parse(r.sub_tags);
        if (Array.isArray(parsed)) subs = parsed.filter((t) => typeof t === 'string');
      } catch {
        /* noop */
      }
    }
    const cleanText = r.text.replace(/https?:\/\/\S+/g, '').trim().slice(0, 200);
    return {
      i: r.tweet_id,
      u: r.username,
      t: cleanText,
      l: r.liked_at,
      c: r.parent_category,
      g: subs,
      s: r.summary_ja,
      p: r.private ? 1 : 0,
      n: r.notfound ? 1 : 0,
    };
  });

  await writeGz('likes-meta.json.gz', JSON.stringify(meta));

  // ===== 3. Embeddings バイナリ =====
  const withEmbed = rows.filter((r) => r.embedding && r.embedding.byteLength === EMBED_DIM * 4);
  console.log(`[embed] ${withEmbed.length}/${rows.length} 行が embedding 持ち`);

  if (withEmbed.length > 0) {
    const N = withEmbed.length;
    // 各行の Uint8Array(byteLength=384*4) を DataView で little-endian 読み出しして
    // Float32Array に展開する (byteOffset 非整列でも安全)。
    const floatRows: Float32Array[] = withEmbed.map((r) => {
      const src = r.embedding!;
      const dv = new DataView(src.buffer, src.byteOffset, src.byteLength);
      const row = new Float32Array(EMBED_DIM);
      for (let j = 0; j < EMBED_DIM; j++) row[j] = dv.getFloat32(j * 4, true);
      return row;
    });

    // ===== int8 対称量子化 =====
    // 全ベクトルの絶対値最大をグローバルスケールにする。
    // 復元: float = q * (scale / 127)
    let absMax = 0;
    for (const row of floatRows) {
      for (let j = 0; j < EMBED_DIM; j++) {
        const a = Math.abs(row[j]);
        if (a > absMax) absMax = a;
      }
    }
    const scale = absMax > 0 ? absMax : 1;
    const inv = 127 / scale;

    const q = Buffer.allocUnsafe(N * EMBED_DIM); // int8 を Buffer に詰める (signed)
    for (let i = 0; i < N; i++) {
      const row = floatRows[i];
      const base = i * EMBED_DIM;
      for (let j = 0; j < EMBED_DIM; j++) {
        let v = Math.round(row[j] * inv);
        if (v > 127) v = 127;
        else if (v < -127) v = -127;
        q.writeInt8(v, base + j);
      }
    }
    await writeGz('embeddings.bin.gz', q);

    const order = withEmbed.map((r) => r.tweet_id);
    await writeGz(
      'embeddings-meta.json.gz',
      JSON.stringify({ dim: EMBED_DIM, scale, quant: 'int8', order }),
    );
    console.log(`[embed] int8 量子化: scale=${scale.toFixed(6)} N=${N} bytes=${N * EMBED_DIM}`);
  } else {
    console.log('[skip] embeddings.bin.gz: embedding が 0 行');
  }

  console.log('[done] search assets generated');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
