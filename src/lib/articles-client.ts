/**
 * X 記事 (Articles) の表示用メタ (public/data/articles.json.gz) のクライアント側ローダー。
 *
 * - build-search-assets.ts が SQLite の articles テーブルから生成する
 * - タイトル / 冒頭プレビュー / 要約 / カバー画像のみ。本文は含まない (著作権上公開しない)
 * - 静的 HTML には載せず、カード表示時にブラウザから fetch する (クローラー対策)
 * - search-client (MiniSearch 同梱) を import するとカードのバンドルが重くなるので独立させている
 */

export type ArticleInfo = {
  t: string; // title
  p: string; // preview_text
  s: string | null; // summary_ja
  c: string | null; // cover image url
  a: string; // 記事を持つツイートの ID (v='quote' なら引用先)
  v: 'self' | 'quote';
};

let promise: Promise<Map<string, ArticleInfo>> | null = null;

export function loadArticles(): Promise<Map<string, ArticleInfo>> {
  promise ??= (async () => {
    const res = await fetch('/data/articles.json.gz', { cache: 'default' });
    if (!res.ok) throw new Error(`articles.json.gz -> ${res.status}`);
    const stream = (await res.blob()).stream().pipeThrough(new DecompressionStream('gzip'));
    const json = (await new Response(stream).json()) as Record<string, ArticleInfo>;
    return new Map(Object.entries(json));
  })();
  promise.catch(() => {
    promise = null; // 失敗時は次回再試行
  });
  return promise;
}
