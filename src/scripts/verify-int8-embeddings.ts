/**
 * int8 量子化の精度検証 (使い捨て)。
 *
 * DB 内の embedding 自身をクエリにして、float32 DB と int8 量子化 DB の
 * 近傍 top-k 一致率を測る。本番では「クエリ=float32, DB=int8復元」なので
 * それを再現する (クエリは量子化しない)。
 *
 * Usage: pnpm tsx src/scripts/verify-int8-embeddings.ts
 */
import { getDb } from '../lib/db';

const EMBED_DIM = 384;
const TOPK = 20;
const NUM_QUERIES = 200;

async function main() {
  const db = getDb();
  const res = await db.execute(
    `SELECT tweet_id, embedding FROM likes
     WHERE embedding IS NOT NULL AND private = 0 AND notfound = 0`,
  );
  const rows = res.rows.map((r) => ({
    tweet_id: String(r.tweet_id),
    embedding:
      r.embedding instanceof Uint8Array
        ? r.embedding
        : new Uint8Array(r.embedding as ArrayBufferLike),
  })) as { tweet_id: string; embedding: Uint8Array }[];

  const N = rows.length;
  console.log(`[verify] N=${N} rows`);

  // float32 行列を構築 (DataView で little-endian 読み出し: byteOffset 非整列でも安全)
  const f32 = new Float32Array(N * EMBED_DIM);
  for (let i = 0; i < N; i++) {
    const src = rows[i].embedding;
    const dv = new DataView(src.buffer, src.byteOffset, src.byteLength);
    const base = i * EMBED_DIM;
    for (let j = 0; j < EMBED_DIM; j++) f32[base + j] = dv.getFloat32(j * 4, true);
  }

  // ===== int8 量子化 → 復元 (build スクリプトと同一ロジック) =====
  let absMax = 0;
  for (let k = 0; k < f32.length; k++) {
    const a = Math.abs(f32[k]);
    if (a > absMax) absMax = a;
  }
  const scale = absMax > 0 ? absMax : 1;
  const inv = 127 / scale;
  const deq = new Float32Array(N * EMBED_DIM);
  let maxErr = 0;
  let sumErr = 0;
  for (let k = 0; k < f32.length; k++) {
    let q = Math.round(f32[k] * inv);
    if (q > 127) q = 127;
    else if (q < -127) q = -127;
    const r = q * (scale / 127);
    deq[k] = r;
    const e = Math.abs(r - f32[k]);
    if (e > maxErr) maxErr = e;
    sumErr += e;
  }
  console.log(
    `[verify] scale=${scale.toFixed(6)} meanAbsErr=${(sumErr / f32.length).toExponential(3)} maxErr=${maxErr.toExponential(3)}`,
  );

  // top-k 近傍を計算する関数 (query は float32 のまま、db を選べる)
  function topk(query: Float32Array, qOffset: number, db: Float32Array): number[] {
    const scores = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const off = i * EMBED_DIM;
      let dot = 0;
      for (let j = 0; j < EMBED_DIM; j++) dot += query[qOffset + j] * db[off + j];
      scores[i] = dot;
    }
    // 自分自身を除いた top-k の index
    const idx = Array.from({ length: N }, (_, i) => i);
    idx.sort((a, b) => scores[b] - scores[a]);
    const out: number[] = [];
    for (const i of idx) {
      if (i * EMBED_DIM === qOffset) continue; // self
      out.push(i);
      if (out.length >= TOPK) break;
    }
    return out;
  }

  // 決定論的に query を等間隔サンプリング
  const step = Math.max(1, Math.floor(N / NUM_QUERIES));
  let overlapSum = 0;
  let top1Match = 0;
  let queries = 0;
  for (let qi = 0; qi < N && queries < NUM_QUERIES; qi += step) {
    const qOff = qi * EMBED_DIM;
    const baseTop = topk(f32, qOff, f32);
    const intTop = topk(f32, qOff, deq);
    const baseSet = new Set(baseTop);
    let inter = 0;
    for (const x of intTop) if (baseSet.has(x)) inter++;
    overlapSum += inter / TOPK;
    if (baseTop[0] === intTop[0]) top1Match++;
    queries++;
  }

  console.log(`[verify] queries=${queries} topK=${TOPK}`);
  console.log(`[verify] mean top-${TOPK} overlap = ${((overlapSum / queries) * 100).toFixed(2)}%`);
  console.log(`[verify] top-1 一致率 = ${((top1Match / queries) * 100).toFixed(2)}%`);
}

main();
