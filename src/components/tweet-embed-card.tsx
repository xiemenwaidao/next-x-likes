'use client';

/**
 * TweetEmbedCard — 集讚館 redesign の中核カード。
 *
 * 構成 (上から下):
 *   1. meta header     : @user · date · category · score (我々のメタ)
 *   2. official embed  : X widgets.js による lazy iframe (viewport 入り時のみロード)
 *   3. footer          : summary_ja + sub_tags (我々の追記)
 *
 * 削除済みツイートや widgets.js が tweet を取得できなかった場合は埋め込み領域に
 * 何も表示しない (X 公式の "Post not available" を見せる仕様だが、現実には null が
 * 返るのでそのまま空)。
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { CATEGORY_BY_NAME } from '@/data/categories';
import { createTweetEmbed } from '@/lib/twitter-widgets';

export type TweetEmbedMeta = {
  tweet_id: string;
  username: string;
  liked_at: string; // ISO
  category?: string | null;
  summary_ja?: string | null;
  sub_tags?: string[];
  text?: string; // fallback (notfound 時にだけ small で出す可能性あり)
  /** semantic 検索のスコア (0..1). 未指定なら表示しない */
  score?: number | null;
  /** matchedBy ラベル (fts / semantic / both). semantic 系のときに star を出す判断 */
  showScore?: boolean;
};

export function TweetEmbedCard({ meta }: { meta: TweetEmbedMeta }) {
  const date = meta.liked_at ? meta.liked_at.slice(0, 10) : '';
  const cat = meta.category ? CATEGORY_BY_NAME[meta.category] : undefined;
  const hasScore =
    meta.showScore !== false &&
    typeof meta.score === 'number' &&
    meta.score > 0;

  return (
    <article
      className="zk-card"
      style={{
        padding: '14px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* meta row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono" style={{ fontSize: 11.5, color: 'var(--text-2)' }}>
          @{meta.username}
        </span>
        {date && (
          <>
            <span style={{ color: 'var(--text-3)', fontSize: 11 }}>·</span>
            <span className="font-mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>
              {date}
            </span>
          </>
        )}
        {cat && (
          <Link
            href={`/categories/${cat.name}`}
            className="zk-pill-xs"
            style={{ ['--hue' as never]: cat.hue, cursor: 'pointer' }}
          >
            <i
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: `oklch(60% 0.18 ${cat.hue})`,
              }}
            />
            {cat.label_ja}
          </Link>
        )}
        <span className="flex-1" />
        {hasScore && <Score value={meta.score as number} />}
        <a
          href={`https://x.com/${meta.username}/status/${meta.tweet_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="zk-icon-btn"
          style={{ width: 28, height: 28, color: 'var(--text-3)' }}
          aria-label="X で開く"
        >
          <ExternalLink size={12} strokeWidth={1.75} />
        </a>
      </div>

      {/* official embed (lazy) */}
      <LazyTweetEmbed tweetId={meta.tweet_id} username={meta.username} />

      {/* footer: summary + tags */}
      {(meta.summary_ja || (meta.sub_tags && meta.sub_tags.length > 0)) && (
        <div className="flex flex-col gap-2" style={{ marginTop: 2 }}>
          {meta.summary_ja && (
            <div
              style={{
                fontSize: 13,
                color: 'var(--text-1)',
                lineHeight: 1.55,
                textWrap: 'pretty',
              }}
            >
              {meta.summary_ja}
            </div>
          )}
          {meta.sub_tags && meta.sub_tags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {meta.sub_tags.slice(0, 6).map((t) =>
                meta.category ? (
                  // 親カテゴリが分かっているなら /categories/[cat]?tag=... に
                  // 飛ばして sub-tag 絞り込み済みの一覧を見せる
                  <Link
                    key={t}
                    href={`/categories/${meta.category}?tag=${encodeURIComponent(t)}`}
                    className="zk-tag zk-tag-link"
                  >
                    #{t}
                  </Link>
                ) : (
                  <span key={t} className="zk-tag">
                    #{t}
                  </span>
                ),
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function Score({ value }: { value: number }) {
  const tier = value >= 0.85 ? 3 : value >= 0.7 ? 2 : 1;
  return (
    <span className="zk-score-stars" aria-label={`関連度 ${tier}/3`}>
      <i />
      <i className={tier < 2 ? 'dim' : ''} />
      <i className={tier < 3 ? 'dim' : ''} />
    </span>
  );
}

/**
 * widgets.js による埋め込みを viewport 入り時にのみロード。
 * - IntersectionObserver で `containerRef` の可視を検知し、初回交差時に
 *   `createTweetEmbed` を呼ぶ。
 * - 取得不能 (削除済み等) は state を 'missing' にし、何も描画しない。
 */
function LazyTweetEmbed({
  tweetId,
  username,
}: {
  tweetId: string;
  username: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const placeholderRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'missing' | 'error'>(
    'idle',
  );

  useEffect(() => {
    if (!containerRef.current) return;
    if (state !== 'idle') return;

    const target = containerRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.disconnect();
          if (!placeholderRef.current) return;
          setState('loading');
          createTweetEmbed(tweetId, placeholderRef.current)
            .then((el) => {
              if (!el) {
                setState('missing');
              } else {
                setState('ready');
              }
            })
            .catch(() => setState('error'));
          break;
        }
      },
      { rootMargin: '320px 0px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [tweetId, state]);

  return (
    <div ref={containerRef} style={{ minHeight: state === 'idle' || state === 'loading' ? 120 : 0 }}>
      {/* widgets.js が iframe を埋める対象。最終的にこのノードの中に
          iframe が挿入される (widgets.js が我々の placeholder を replace する仕様)。
          missing / error 時は (timeout 後に遅れて iframe が来ても) 見せないよう隠す。 */}
      <div
        ref={placeholderRef}
        style={{ display: state === 'missing' || state === 'error' ? 'none' : undefined }}
      />
      {state === 'loading' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            height: 120,
          }}
          aria-live="polite"
        >
          {/* matrix-loader: SMIL アニメーション SVG。img なら確実にアニメする */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/matrix-loader.svg"
            alt=""
            width={52}
            height={52}
            style={{ display: 'block' }}
          />
          <span className="font-mono" style={{ color: 'var(--text-3)', fontSize: 11.5 }}>
            loading post…
          </span>
        </div>
      )}
      {state === 'missing' && (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 8,
            background: 'oklch(20% 0.012 250 / 0.6)',
            color: 'var(--text-3)',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>このポストは表示できません (削除済み / 非公開)</span>
          <a
            href={`https://x.com/${username}/status/${tweetId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono"
            style={{ color: 'var(--text-2)', fontSize: 10.5 }}
          >
            x.com ↗
          </a>
        </div>
      )}
    </div>
  );
}
