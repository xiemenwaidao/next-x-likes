/**
 * 検索 CLI (Phase 2 検証用): SQLite を直接読み、クエリを embed して
 * MiniSearch + cosine ハイブリッドで top-k を返す。Phase 3 のブラウザ
 * 実装に進む前にサーバ側で検索品質を確認するためのもの。
 *
 * Usage:
 *   pnpm tsx src/scripts/search-cli.ts "Claude Code エージェント"
 *   pnpm tsx src/scripts/search-cli.ts --limit 20 --mode fts "ドット絵"
 *   pnpm tsx src/scripts/search-cli.ts --mode semantic "個人開発の収益化"
 *   pnpm tsx src/scripts/search-cli.ts --mode hybrid "AI で漫画を作る"
 */
import MiniSearch from 'minisearch';
import { pipeline, env } from '@huggingface/transformers';
import { getDb } from '../lib/db';

env.cacheDir = process.env.HF_CACHE_DIR ?? `${process.env.HOME}/.cache/huggingface`;
const MODEL_ID = 'Xenova/multilingual-e5-small';
const EMBED_DIM = 384;

type Args = {
  query: string;
  limit: number;
  mode: 'fts' | 'semantic' | 'hybrid';
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let limit = 10;
  let mode: Args['mode'] = 'hybrid';
  const qParts: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') {
      limit = parseInt(argv[++i] ?? '10', 10);
    } else if (a === '--mode') {
      const v = argv[++i];
      if (v === 'fts' || v === 'semantic' || v === 'hybrid') mode = v;
    } else {
      qParts.push(a);
    }
  }
  return { query: qParts.join(' ').trim(), limit, mode };
}

function bigramTokenize(text: string): string[] {
  const tokens: string[] = [];
  const lower = text.toLowerCase();
  const asciiRe = /[a-z0-9][a-z0-9_-]*/g;
  let m: RegExpExecArray | null;
  while ((m = asciiRe.exec(lower)) !== null) {
    if (m[0].length >= 2) tokens.push(m[0]);
  }
  const non = lower.replace(/[a-z0-9_\-\s.,!?。、！？「」"'()（）\[\]【】\/]+/g, ' ');
  for (const word of non.split(/\s+/)) {
    if (!word) continue;
    if (word.length === 1) tokens.push(word);
    else for (let i = 0; i < word.length - 1; i++) tokens.push(word.slice(i, i + 2));
  }
  return tokens;
}

type Doc = {
  id: string;
  text: string;
  username: string;
  summary: string;
  tags: string;
  category: string;
  embedding: Float32Array | null;
  meta: {
    username: string;
    text: string;
    summary_ja: string | null;
    parent_category: string | null;
    sub_tags: string[];
    liked_at: string;
  };
};

async function loadDocs(): Promise<Doc[]> {
  const db = getDb();
  const res = await db.execute(
    `SELECT tweet_id, text, username, liked_at, parent_category, sub_tags, summary_ja, embedding
     FROM likes
     WHERE private = 0 AND notfound = 0
     ORDER BY liked_at DESC`,
  );
  return res.rows.map((r) => {
    let subs: string[] = [];
    if (r.sub_tags) {
      try {
        const p = JSON.parse(String(r.sub_tags));
        if (Array.isArray(p)) subs = p.filter((t) => typeof t === 'string');
      } catch {
        /* noop */
      }
    }
    const text = String(r.text ?? '').replace(/https?:\/\/\S+/g, '').trim();
    const summary = r.summary_ja ? String(r.summary_ja) : '';
    let emb: Float32Array | null = null;
    const rawEmb = r.embedding;
    if (rawEmb) {
      const u8 = rawEmb instanceof Uint8Array ? rawEmb : new Uint8Array(rawEmb as ArrayBufferLike);
      if (u8.byteLength === EMBED_DIM * 4) {
        emb = new Float32Array(
          u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength),
        );
      }
    }
    return {
      id: String(r.tweet_id),
      text,
      username: String(r.username ?? ''),
      summary,
      tags: subs.join(' '),
      category: r.parent_category ? String(r.parent_category) : '',
      embedding: emb,
      meta: {
        username: String(r.username ?? ''),
        text,
        summary_ja: r.summary_ja ? String(r.summary_ja) : null,
        parent_category: r.parent_category ? String(r.parent_category) : null,
        sub_tags: subs,
        liked_at: String(r.liked_at ?? ''),
      },
    };
  });
}

function normalize(scores: Map<string, number>): Map<string, number> {
  if (scores.size === 0) return scores;
  const arr = [...scores.values()];
  const max = Math.max(...arr);
  const min = Math.min(...arr);
  const range = max - min || 1;
  const out = new Map<string, number>();
  for (const [k, v] of scores) out.set(k, (v - min) / range);
  return out;
}

async function main() {
  const args = parseArgs();
  if (!args.query) {
    console.error('Usage: search-cli "<query>" [--limit N] [--mode fts|semantic|hybrid]');
    process.exit(1);
  }

  process.stderr.write(`[load] reading SQLite...\n`);
  const docs = await loadDocs();
  process.stderr.write(`[load] ${docs.length} docs, ${docs.filter((d) => d.embedding).length} with embedding\n`);

  const ftsScores = new Map<string, number>();
  const semScores = new Map<string, number>();

  if (args.mode === 'fts' || args.mode === 'hybrid') {
    const ms = new MiniSearch({
      idField: 'id',
      fields: ['text', 'summary', 'username', 'tags', 'category'],
      storeFields: [],
      tokenize: bigramTokenize,
      processTerm: (t) => t.toLowerCase(),
      searchOptions: {
        boost: { summary: 2, text: 1, tags: 1.5, username: 0.5 },
        fuzzy: 0.2,
        prefix: true,
      },
    });
    ms.addAll(docs);
    const results = ms.search(args.query);
    for (const r of results) ftsScores.set(r.id as string, r.score);
    process.stderr.write(`[fts] ${ftsScores.size} hits\n`);
  }

  if (args.mode === 'semantic' || args.mode === 'hybrid') {
    process.stderr.write(`[embed] loading model ${MODEL_ID}...\n`);
    const extractor = await pipeline('feature-extraction', MODEL_ID, { dtype: 'fp32' });
    const out = await extractor([`query: ${args.query}`], { pooling: 'mean', normalize: true });
    const qVec = new Float32Array((out.data as Float32Array).subarray(0, EMBED_DIM));
    let scored = 0;
    for (const d of docs) {
      if (!d.embedding) continue;
      let dot = 0;
      for (let j = 0; j < EMBED_DIM; j++) dot += qVec[j] * d.embedding[j];
      semScores.set(d.id, dot);
      scored++;
    }
    process.stderr.write(`[semantic] cosine over ${scored} vectors\n`);
  }

  const ftsN = normalize(ftsScores);
  const semN = normalize(semScores);
  const allIds = new Set<string>([...ftsN.keys(), ...semN.keys()]);

  const merged: { id: string; score: number; f: number; s: number }[] = [];
  for (const id of allIds) {
    const f = ftsN.get(id) ?? 0;
    const s = semN.get(id) ?? 0;
    const score =
      args.mode === 'fts'
        ? f
        : args.mode === 'semantic'
          ? s
          : f * 0.5 + s * 0.5;
    merged.push({ id, score, f, s });
  }
  merged.sort((a, b) => b.score - a.score);

  const byId = new Map(docs.map((d) => [d.id, d]));
  console.log(`\n=== query: "${args.query}" mode=${args.mode} ===\n`);
  for (let i = 0; i < Math.min(args.limit, merged.length); i++) {
    const m = merged[i];
    const d = byId.get(m.id)!;
    const tag = `score=${m.score.toFixed(3)}${args.mode === 'hybrid' ? ` (fts=${m.f.toFixed(2)} sem=${m.s.toFixed(2)})` : ''}`;
    const cat = d.meta.parent_category ? `[${d.meta.parent_category}]` : '[未分類]';
    const summary = d.meta.summary_ja ? `\n   要約: ${d.meta.summary_ja}` : '';
    console.log(
      `${i + 1}. ${tag} ${cat} @${d.meta.username}\n   ${d.meta.text.slice(0, 120)}${summary}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
