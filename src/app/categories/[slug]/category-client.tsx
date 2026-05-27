'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import type { Category } from '@/data/categories';
import { TweetEmbedCard } from '@/components/tweet-embed-card';
import type { CategoryTweet } from './page';

type Props = {
  category: Category;
  count: number;
  total: number;
  tweets: CategoryTweet[];
  subTags: { tag: string; count: number }[];
};

const PAGE_SIZE = 20;

export function CategoryPageClient({ category, count, total, tweets, subTags }: Props) {
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [pageLimit, setPageLimit] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    if (!selectedTag) return tweets;
    return tweets.filter((t) => t.sub_tags.includes(selectedTag));
  }, [tweets, selectedTag]);

  const visible = filtered.slice(0, pageLimit);
  const hasMore = filtered.length > pageLimit;
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <div className="col-28" style={{ padding: '12px 16px 60px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Back link */}
      <div className="flex items-center">
        <Link
          href="/?tab=categories"
          className="inline-flex items-center gap-1"
          style={{
            padding: '6px 8px 6px 4px',
            marginLeft: -8,
            background: 'transparent',
            color: 'var(--text-2)',
            fontSize: 12,
            borderRadius: 8,
          }}
        >
          <ChevronLeft size={14} strokeWidth={1.75} /> ホーム
        </Link>
      </div>

      {/* Category hero */}
      <div
        className="zk-card"
        style={{
          padding: '20px 18px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            right: -40,
            top: -60,
            width: 180,
            height: 180,
            borderRadius: '50%',
            background: `oklch(60% 0.18 ${category.hue} / 0.18)`,
            filter: 'blur(20px)',
            pointerEvents: 'none',
          }}
        />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: `oklch(60% 0.18 ${category.hue})`,
                boxShadow: `0 0 12px oklch(60% 0.18 ${category.hue} / 0.5)`,
              }}
            />
            <span className="zk-section-label">{category.name}</span>
          </div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 600,
              color: 'var(--text-0)',
              margin: 0,
              letterSpacing: '-0.01em',
            }}
          >
            {category.label_ja}
          </h1>
          <div
            style={{
              fontSize: 12.5,
              color: 'var(--text-2)',
              marginTop: 8,
              lineHeight: 1.6,
              maxWidth: '90%',
            }}
          >
            {category.description}
          </div>
          <div
            className="flex items-baseline gap-3"
            style={{
              marginTop: 14,
              paddingTop: 12,
              borderTop: '0.5px solid var(--line-soft)',
            }}
          >
            <div
              className="font-mono"
              style={{
                fontSize: 22,
                color: 'var(--text-0)',
                fontWeight: 500,
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '-0.02em',
              }}
            >
              {count.toLocaleString()}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>件のいいね</div>
            <div className="flex-1" />
            <div className="font-mono" style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
              全体の {pct}%
            </div>
          </div>
        </div>
      </div>

      {/* Sub-tags */}
      {subTags.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="zk-section-label" style={{ padding: '0 2px' }}>
            tags · {subTags.length}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className="zk-pill"
              data-on={selectedTag === null ? '1' : '0'}
              onClick={() => {
                setSelectedTag(null);
                setPageLimit(PAGE_SIZE);
              }}
            >
              すべて<span className="count">{tweets.length}</span>
            </button>
            {subTags.map(({ tag, count: n }) => (
              <button
                key={tag}
                type="button"
                className="zk-pill"
                data-on={selectedTag === tag ? '1' : '0'}
                onClick={() => {
                  setSelectedTag((cur) => (cur === tag ? null : tag));
                  setPageLimit(PAGE_SIZE);
                }}
              >
                #{tag}<span className="count">{n}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between" style={{ padding: '0 2px' }}>
          <div className="zk-section-label">
            {selectedTag
              ? `#${selectedTag} · ${filtered.length} 件`
              : `最近のいいね · ${tweets.length} 件`}
          </div>
          <span className="font-mono" style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
            新しい順
          </span>
        </div>

        {visible.length === 0 ? (
          <div className="zk-empty">
            <div>—</div>
            <div>該当なし</div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {visible.map((t) => (
              <TweetEmbedCard
                key={t.tweet_id}
                meta={{
                  tweet_id: t.tweet_id,
                  username: t.username,
                  liked_at: t.liked_at,
                  category: category.name,
                  summary_ja: t.summary_ja,
                  sub_tags: t.sub_tags,
                  text: t.text,
                  showScore: false,
                }}
              />
            ))}
          </div>
        )}

        {hasMore && (
          <button
            type="button"
            onClick={() => setPageLimit((p) => p + PAGE_SIZE)}
            style={{
              marginTop: 6,
              padding: '10px 14px',
              background: 'var(--bg-2)',
              border: 0,
              borderRadius: 10,
              color: 'var(--text-1)',
              fontSize: 12.5,
              cursor: 'pointer',
              boxShadow: 'inset 0 0 0 0.5px var(--line-soft)',
            }}
          >
            さらに表示 ({filtered.length - pageLimit} 件)
          </button>
        )}
      </div>
    </div>
  );
}

