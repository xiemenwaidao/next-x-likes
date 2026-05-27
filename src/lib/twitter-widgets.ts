/**
 * X 公式 widgets.js のシングルトンローダー。
 *
 * - クライアントサイドでのみ動作 (Server Component から呼ばない)。
 * - 初回 createTweet 呼び出し時に platform.twitter.com/widgets.js を 1 度だけ
 *   注入する。
 * - createTweet は内部で window.twttr.widgets.createTweet を呼び、対象の
 *   DOM ノードに iframe ベースの埋め込みを生成する。
 * - 公式 SDK が tweet を取得できなかった場合 (削除済み、保護中、誤 ID) は
 *   createTweet が null を解決するので、呼び出し側で notfound 扱いに分岐できる。
 */

const SCRIPT_SRC = 'https://platform.twitter.com/widgets.js';

type TwttrEvents = {
  bind(event: 'rendered', cb: (e: { target: HTMLElement }) => void): void;
};

type TwttrWidgets = {
  createTweet(
    tweetId: string,
    container: HTMLElement,
    options?: {
      theme?: 'dark' | 'light';
      dnt?: boolean;
      align?: 'left' | 'center' | 'right';
      conversation?: 'none' | 'all';
      cards?: 'visible' | 'hidden';
      width?: number | 'auto';
      lang?: string;
    },
  ): Promise<HTMLElement | null>;
  load(node?: HTMLElement): void;
};

type Twttr = {
  ready(cb: (twttr: { events: TwttrEvents; widgets: TwttrWidgets }) => void): void;
  events: TwttrEvents;
  widgets: TwttrWidgets;
  _e?: Array<(t: Twttr) => void>;
};

declare global {
  interface Window {
    twttr?: Twttr;
  }
}

let loadPromise: Promise<Twttr> | null = null;

function injectScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${SCRIPT_SRC}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.async = true;
    s.src = SCRIPT_SRC;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load widgets.js'));
    document.head.appendChild(s);
  });
}

/**
 * widgets.js をロードし、`window.twttr.widgets` が ready になった Twttr を返す。
 * 同時呼び出しは同じ Promise を共有する。
 */
export function loadWidgets(): Promise<Twttr> {
  if (loadPromise) return loadPromise;
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('twitter-widgets: client only'));
  }

  loadPromise = new Promise<Twttr>((resolve, reject) => {
    // すでに window.twttr がある場合はそちらを使う
    const existing = window.twttr;
    if (existing && existing.widgets && typeof existing.widgets.createTweet === 'function') {
      resolve(existing);
      return;
    }

    injectScript()
      .then(() => {
        // widgets.js は読み込み完了後に window.twttr.ready を呼べるようにする
        const w = window.twttr;
        if (!w) {
          reject(new Error('window.twttr unavailable after load'));
          return;
        }
        w.ready(() => resolve(w));
      })
      .catch(reject);
  });

  loadPromise.catch(() => {
    loadPromise = null;
  });
  return loadPromise;
}

/**
 * 指定 tweet を container に埋め込む。
 * 戻り値の Promise は iframe 要素 (成功時) または null (削除済み等) を解決。
 */
export async function createTweetEmbed(
  tweetId: string,
  container: HTMLElement,
  options: { theme?: 'dark' | 'light'; dnt?: boolean; conversation?: 'none' | 'all' } = {},
): Promise<HTMLElement | null> {
  const twttr = await loadWidgets();
  return twttr.widgets.createTweet(tweetId, container, {
    theme: 'dark',
    dnt: true,
    conversation: 'none',
    ...options,
  });
}
