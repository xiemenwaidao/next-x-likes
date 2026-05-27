'use client';

import Link from 'next/link';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { CATEGORY_BY_NAME } from '@/data/categories';
import type { HomeInsightsData } from '@/app/page';

/**
 * ホーム下部に出すインサイトセクション。
 * 旧 RecentActivityGraph (直近 7 日の棒グラフ) を置き換えるもので、
 * SQLite から build 時に集計したデータを 4 ブロックで提示する。
 *
 *   1. 直近 30 日サマリ: 件数 + 前 30 日比
 *   2. 直近 30 日のホットなカテゴリ Top 3 (横並びカード)
 *   3. 直近 30 日にいいねしたユーザー Top 5
 *   4. 直近 6 ヶ月の月別ミニ棒グラフ
 */
export function HomeInsights({ data }: { data: HomeInsightsData }) {
  const { last30, prev30, hotCategories, topUsers, monthly } = data;

  const delta = last30 - prev30;
  const deltaPct = prev30 === 0 ? null : Math.round((delta / prev30) * 100);
  const avgPerDay = Math.round((last30 / 30) * 10) / 10;

  const maxMonthly = Math.max(1, ...monthly.map((m) => m.count));

  return (
    <div className="flex flex-col gap-4">
      <div className="zk-section-label" style={{ padding: '0 2px' }}>
        insights · last 30 days
      </div>

      {/* 1. サマリカード */}
      <div className="zk-card-quiet" style={{ padding: 16 }}>
        <div className="flex items-baseline gap-3 flex-wrap">
          <div
            className="font-mono"
            style={{
              fontSize: 28,
              color: 'var(--text-0)',
              fontWeight: 500,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.02em',
              lineHeight: 1,
            }}
          >
            {last30.toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>件のいいね</div>
          <span className="flex-1" />
          <DeltaPill delta={delta} pct={deltaPct} />
        </div>
        <div
          className="font-mono"
          style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}
        >
          1 日あたり {avgPerDay} 件 / 直前 30 日: {prev30.toLocaleString()} 件
        </div>
      </div>

      {/* 2. ホットなカテゴリ Top 3 */}
      {hotCategories.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="zk-section-label" style={{ padding: '0 2px' }}>
            hot categories
          </div>
          <div className="grid grid-cols-3 gap-2">
            {hotCategories.map((c) => {
              const meta = CATEGORY_BY_NAME[c.name];
              return (
                <Link
                  key={c.name}
                  href={`/categories/${c.name}`}
                  className="zk-cat-card"
                  style={{
                    ['--hue' as never]: meta?.hue ?? 250,
                    minHeight: 84,
                    padding: 12,
                  }}
                >
                  <span className="dot" style={{ top: 10, right: 10 }} />
                  <div
                    className="num"
                    style={{ fontSize: 18, lineHeight: 1 }}
                  >
                    {c.count}
                  </div>
                  <div
                    className="name"
                    style={{ fontSize: 11.5, lineHeight: 1.3 }}
                  >
                    {meta?.label_ja ?? c.name}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. ユーザー Top 5 */}
      {topUsers.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="zk-section-label" style={{ padding: '0 2px' }}>
            top users
          </div>
          <div className="zk-card-quiet" style={{ padding: 6 }}>
            {topUsers.map((u, i) => (
              <div
                key={u.username}
                className="flex items-center gap-3"
                style={{
                  padding: '8px 10px',
                  borderTop: i === 0 ? 'none' : '0.5px solid var(--line-soft)',
                }}
              >
                <span
                  className="font-mono"
                  style={{
                    fontSize: 10.5,
                    color: 'var(--text-3)',
                    width: 18,
                    textAlign: 'right',
                  }}
                >
                  {i + 1}
                </span>
                <a
                  href={`https://x.com/${u.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono"
                  style={{
                    fontSize: 12.5,
                    color: 'var(--text-1)',
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  @{u.username}
                </a>
                <UserBar count={u.count} max={topUsers[0].count} />
                <span
                  className="font-mono"
                  style={{
                    fontSize: 11.5,
                    color: 'var(--text-2)',
                    fontVariantNumeric: 'tabular-nums',
                    width: 24,
                    textAlign: 'right',
                  }}
                >
                  {u.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. 月別ミニチャート */}
      {monthly.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="zk-section-label" style={{ padding: '0 2px' }}>
            last 6 months
          </div>
          <div className="zk-card-quiet" style={{ padding: 14 }}>
            <div
              className="flex items-end gap-2"
              style={{ height: 64 }}
            >
              {monthly.map((m) => {
                const h = Math.max(4, Math.round((m.count / maxMonthly) * 60));
                return (
                  <div
                    key={m.ym}
                    className="flex flex-col items-center gap-1"
                    style={{ flex: 1 }}
                  >
                    <div
                      style={{
                        flex: 1,
                        width: '100%',
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'center',
                      }}
                    >
                      <div
                        style={{
                          width: '100%',
                          height: h,
                          borderRadius: '4px 4px 2px 2px',
                          background:
                            'linear-gradient(180deg, var(--zk-accent) 0%, oklch(40% 0.12 var(--zk-accent-hue, 255)) 100%)',
                        }}
                        title={`${m.ym}: ${m.count} 件`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {/* 軸ラベル (月) */}
            <div className="flex gap-2" style={{ marginTop: 6 }}>
              {monthly.map((m) => (
                <div
                  key={m.ym}
                  className="font-mono"
                  style={{
                    flex: 1,
                    fontSize: 9.5,
                    color: 'var(--text-3)',
                    textAlign: 'center',
                  }}
                >
                  {m.ym.slice(5)}月
                </div>
              ))}
            </div>
            <div
              className="font-mono flex justify-between"
              style={{
                marginTop: 8,
                paddingTop: 8,
                borderTop: '0.5px solid var(--line-soft)',
                fontSize: 10.5,
                color: 'var(--text-3)',
              }}
            >
              <span>合計 {monthly.reduce((a, m) => a + m.count, 0).toLocaleString()} 件</span>
              <span>最多月 {Math.max(...monthly.map((m) => m.count)).toLocaleString()} 件</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DeltaPill({ delta, pct }: { delta: number; pct: number | null }) {
  const tone = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  const color =
    tone === 'up'
      ? 'oklch(70% 0.13 160)'
      : tone === 'down'
        ? 'oklch(65% 0.14 20)'
        : 'var(--text-3)';
  const Icon = tone === 'up' ? TrendingUp : tone === 'down' ? TrendingDown : Minus;
  const label =
    pct === null
      ? delta === 0
        ? '前月と同じ'
        : `前月 0 → ${delta > 0 ? '+' : ''}${delta}`
      : `${pct > 0 ? '+' : ''}${pct}%`;
  return (
    <span
      className="zk-pill-xs"
      style={{ color, gap: 4 }}
      title={`前 30 日との差分: ${delta > 0 ? '+' : ''}${delta} 件`}
    >
      <Icon size={11} strokeWidth={1.75} />
      {label}
    </span>
  );
}

function UserBar({ count, max }: { count: number; max: number }) {
  const w = Math.max(8, Math.round((count / max) * 60));
  return (
    <div
      style={{
        width: 60,
        height: 3,
        borderRadius: 999,
        background: 'oklch(24% 0.012 250)',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: w,
          height: '100%',
          background: 'var(--zk-accent)',
        }}
      />
    </div>
  );
}
