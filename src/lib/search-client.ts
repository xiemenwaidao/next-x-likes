/**
 * クライアントサイド検索ライブラリ (Phase 2)。
 *
 * 提供する機能:
 *   - public/data/*.gz を fetch + 解凍してメモリに常駐
 *   - MiniSearch による FTS 検索
 *   - 事前計算済み embedding に対する cosine top-k 検索
 *   - 上記 2 つをマージしたハイブリッド検索
 *
 * クエリ embedding の計算は呼び出し側に委ねる (Phase 3 で
 * 「ブラウザで transformers.js を動かす」「API ルート経由」を選択)。
 */
import MiniSearch from 'minisearch';

export const EMBED_DIM = 384;

export type LikeMetaItem = {
  i: string; // tweet_id
  u: string; // username
  t: string; // text snippet
  l: string; // liked_at
  c: string | null; // parent_category
  g: string[]; // sub_tags
  s: string | null; // summary_ja
  p: 0 | 1; // private
  n: 0 | 1; // notfound
};

export type SearchHit = {
  tweet_id: string;
  score: number;
  matchedBy: 'fts' | 'semantic' | 'both';
  meta: LikeMetaItem;
};

export type SearchAssets = {
  miniSearch: MiniSearch;
  meta: LikeMetaItem[];
  metaById: Map<string, LikeMetaItem>;
  embeddings: Float32Array | null; // length = N * EMBED_DIM
  embedOrder: string[]; // tweet_id at index i
  embedIndexById: Map<string, number>;
};

async function fetchGz(url: string): Promise<ArrayBuffer> {
  // cache: 'default' で HTTP の cache-control (Vercel から `max-age=0,
  // must-revalidate`) に従う。force-cache だとデプロイ更新後もブラウザが
  // 古い gz を返し続けて新ツイートが見えなくなる。
  const res = await fetch(url, { cache: 'default' });
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  const blob = await res.blob();
  const ds = new DecompressionStream('gzip');
  const decompressed = blob.stream().pipeThrough(ds);
  return await new Response(decompressed).arrayBuffer();
}

async function fetchGzJson<T>(url: string): Promise<T> {
  const buf = await fetchGz(url);
  return JSON.parse(new TextDecoder().decode(buf)) as T;
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

export async function loadSearchAssets(opts?: {
  withEmbeddings?: boolean;
  baseUrl?: string;
}): Promise<SearchAssets> {
  const base = opts?.baseUrl ?? '/data';

  const [serializedIndex, meta] = await Promise.all([
    fetchGzJson<unknown>(`${base}/search-index.json.gz`),
    fetchGzJson<LikeMetaItem[]>(`${base}/likes-meta.json.gz`),
  ]);

  const miniSearch = MiniSearch.loadJS(
    serializedIndex as Parameters<typeof MiniSearch.loadJS>[0],
    {
      idField: 'id',
      fields: ['text', 'summary', 'username', 'tags', 'category'],
      storeFields: [],
      tokenize: bigramTokenize,
      processTerm: (term) => term.toLowerCase(),
      searchOptions: {
        boost: { summary: 2, text: 1, tags: 1.5, username: 0.5 },
        fuzzy: 0.2,
        prefix: true,
      },
    },
  );

  const metaById = new Map<string, LikeMetaItem>();
  for (const m of meta) metaById.set(m.i, m);

  let embeddings: Float32Array | null = null;
  let embedOrder: string[] = [];
  const embedIndexById = new Map<string, number>();

  if (opts?.withEmbeddings) {
    const [bin, order] = await Promise.all([
      fetchGz(`${base}/embeddings.bin.gz`),
      fetchGzJson<string[]>(`${base}/embeddings-meta.json.gz`),
    ]);
    embeddings = new Float32Array(bin);
    embedOrder = order;
    for (let i = 0; i < order.length; i++) embedIndexById.set(order[i], i);
    if (embeddings.length !== order.length * EMBED_DIM) {
      throw new Error(
        `embeddings size mismatch: floats=${embeddings.length} expected=${order.length * EMBED_DIM}`,
      );
    }
  }

  return { miniSearch, meta, metaById, embeddings, embedOrder, embedIndexById };
}

/** 既存の SearchAssets に embeddings を後追いで読み込む。Phase 3 (semantic/hybrid モード) 用。
 *  戻り値は新しい SearchAssets オブジェクト (元のものは変更しない)。
 */
export async function loadEmbeddingsAddon(
  assets: SearchAssets,
  opts?: { baseUrl?: string },
): Promise<SearchAssets> {
  if (assets.embeddings) return assets; // 既にロード済み

  const base = opts?.baseUrl ?? '/data';
  const [bin, order] = await Promise.all([
    fetchGz(`${base}/embeddings.bin.gz`),
    fetchGzJson<string[]>(`${base}/embeddings-meta.json.gz`),
  ]);
  const embeddings = new Float32Array(bin);
  const embedOrder = order;
  const embedIndexById = new Map<string, number>();
  for (let i = 0; i < order.length; i++) embedIndexById.set(order[i], i);
  if (embeddings.length !== order.length * EMBED_DIM) {
    throw new Error(
      `embeddings size mismatch: floats=${embeddings.length} expected=${order.length * EMBED_DIM}`,
    );
  }
  return {
    ...assets,
    embeddings,
    embedOrder,
    embedIndexById,
  };
}

export function searchFts(
  assets: SearchAssets,
  query: string,
  opts?: { limit?: number; category?: string },
): SearchHit[] {
  const limit = opts?.limit ?? 50;
  const filter = opts?.category
    ? (id: string) => {
        const m = assets.metaById.get(id);
        return !!m && m.c === opts.category;
      }
    : undefined;

  const results = assets.miniSearch.search(query, {
    filter: filter ? (r) => filter(r.id as string) : undefined,
  });

  const hits: SearchHit[] = [];
  for (const r of results) {
    const meta = assets.metaById.get(r.id as string);
    if (!meta) continue;
    hits.push({
      tweet_id: meta.i,
      score: r.score,
      matchedBy: 'fts',
      meta,
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

/** クエリ embedding (Float32Array、長さ EMBED_DIM、L2 正規化済み) を渡して
 *  cosine top-k を返す。
 */
export function searchSemantic(
  assets: SearchAssets,
  queryEmbedding: Float32Array,
  opts?: { limit?: number; category?: string },
): SearchHit[] {
  if (!assets.embeddings) return [];
  if (queryEmbedding.length !== EMBED_DIM) {
    throw new Error(`query embedding length mismatch: ${queryEmbedding.length} != ${EMBED_DIM}`);
  }

  const limit = opts?.limit ?? 50;
  const N = assets.embedOrder.length;
  const scores: { idx: number; score: number }[] = [];

  for (let i = 0; i < N; i++) {
    const offset = i * EMBED_DIM;
    let dot = 0;
    // L2 正規化済み同士なら dot = cosine
    for (let j = 0; j < EMBED_DIM; j++) {
      dot += queryEmbedding[j] * assets.embeddings[offset + j];
    }
    scores.push({ idx: i, score: dot });
  }
  scores.sort((a, b) => b.score - a.score);

  const hits: SearchHit[] = [];
  for (const s of scores) {
    if (hits.length >= limit) break;
    const id = assets.embedOrder[s.idx];
    const meta = assets.metaById.get(id);
    if (!meta) continue;
    if (opts?.category && meta.c !== opts.category) continue;
    hits.push({
      tweet_id: id,
      score: s.score,
      matchedBy: 'semantic',
      meta,
    });
  }
  return hits;
}

/** FTS と semantic をマージ。スコアは正規化してから加重平均する。 */
export function searchHybrid(
  assets: SearchAssets,
  query: string,
  queryEmbedding: Float32Array | null,
  opts?: { limit?: number; category?: string; ftsWeight?: number; semanticWeight?: number },
): SearchHit[] {
  const limit = opts?.limit ?? 50;
  const ftsW = opts?.ftsWeight ?? 0.5;
  const semW = opts?.semanticWeight ?? 0.5;

  const fts = searchFts(assets, query, { limit: limit * 2, category: opts?.category });
  const sem = queryEmbedding
    ? searchSemantic(assets, queryEmbedding, { limit: limit * 2, category: opts?.category })
    : [];

  const normalize = (hits: SearchHit[]): Map<string, number> => {
    if (hits.length === 0) return new Map();
    const max = Math.max(...hits.map((h) => h.score));
    const min = Math.min(...hits.map((h) => h.score));
    const range = max - min || 1;
    const map = new Map<string, number>();
    for (const h of hits) map.set(h.tweet_id, (h.score - min) / range);
    return map;
  };

  const ftsN = normalize(fts);
  const semN = normalize(sem);
  const allIds = new Set<string>([...ftsN.keys(), ...semN.keys()]);

  const merged: SearchHit[] = [];
  for (const id of allIds) {
    const f = ftsN.get(id) ?? 0;
    const s = semN.get(id) ?? 0;
    const score = f * ftsW + s * semW;
    const meta = assets.metaById.get(id);
    if (!meta) continue;
    merged.push({
      tweet_id: id,
      score,
      matchedBy: f > 0 && s > 0 ? 'both' : f > 0 ? 'fts' : 'semantic',
      meta,
    });
  }
  merged.sort((a, b) => b.score - a.score);
  return merged.slice(0, limit);
}
