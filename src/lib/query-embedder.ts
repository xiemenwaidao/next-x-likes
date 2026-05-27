/**
 * クライアントサイドのクエリ embedding (Phase 3)。
 *
 * モデル: Xenova/multilingual-e5-small (384 次元、L2 正規化)
 * 推論バックエンド: @huggingface/transformers (ブラウザ実装は WebAssembly)
 *
 * - シングルトンで pipeline を保持し、ページ遷移をまたいでも再ロードしない。
 * - 初回 load は HF CDN から数百 MB を取得 + IndexedDB / Cache Storage に保存。
 * - e5 系の慣例で query には "query: " プレフィックスを付与する。
 *
 * このモジュールはクライアント専用 (use client コンポーネントから dynamic import) で使う想定。
 */
import { pipeline, env, type FeatureExtractionPipeline } from '@huggingface/transformers';

export const QUERY_EMBED_MODEL = 'Xenova/multilingual-e5-small';
export const QUERY_EMBED_DIM = 384;

export type EmbedderLoadProgress = {
  /** 進捗単位の文字列ラベル (file, status など) */
  label: string;
  /** 0..1 の進捗。null のときは不定 */
  fraction: number | null;
};

let pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

/** モデルをロード (またはロード中の promise を返す)。同時呼び出しは同じ promise を共有する。 */
export function loadQueryEmbedder(
  onProgress?: (p: EmbedderLoadProgress) => void,
): Promise<FeatureExtractionPipeline> {
  if (pipelinePromise) return pipelinePromise;

  // ブラウザ環境で HF CDN からモデルを取得することを許可。
  // ローカルファイル参照は無効化しておく。
  env.allowLocalModels = false;
  env.allowRemoteModels = true;

  pipelinePromise = pipeline('feature-extraction', QUERY_EMBED_MODEL, {
    dtype: 'fp32',
    progress_callback: onProgress
      ? (data: unknown) => {
          // transformers.js は { status, file, progress, loaded, total, ... } を渡してくる
          const d = data as {
            status?: string;
            file?: string;
            progress?: number;
          };
          const label = d.file ?? d.status ?? 'loading';
          const fraction = typeof d.progress === 'number' ? d.progress / 100 : null;
          onProgress({ label, fraction });
        }
      : undefined,
  }) as Promise<FeatureExtractionPipeline>;

  // 失敗時はキャッシュをクリアして次回再試行可能にする
  pipelinePromise.catch(() => {
    pipelinePromise = null;
  });

  return pipelinePromise;
}

/** クエリ文字列を Float32Array(384) (L2 正規化済み) に変換する。 */
export async function embedQuery(query: string): Promise<Float32Array> {
  const extractor = await loadQueryEmbedder();
  const out = await extractor([`query: ${query}`], {
    pooling: 'mean',
    normalize: true,
  });
  const data = out.data as Float32Array;
  // 1 件分のみ取り出し、独立した Float32Array としてコピーして返す
  return new Float32Array(data.subarray(0, QUERY_EMBED_DIM));
}

/** ロード済みかどうか (UI 表示判定用) */
export function isQueryEmbedderLoaded(): boolean {
  return pipelinePromise !== null;
}
