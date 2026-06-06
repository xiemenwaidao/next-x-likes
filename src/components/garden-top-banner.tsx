'use client';

/**
 * GardenTopBanner — トップに置く「讚の庭」バナー。
 * stats は Server Component（page.tsx）が public/garden-stats.json を読んで
 * props で渡す（fetch 不要・レイアウトシフト無し）。
 * トップのカレンダーで月を選ぶと、その月の stats に切り替わる（HomeTabs が制御）。
 */
import { HelpCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import ZanNoNiwa, { verdict } from './zan-no-niwa';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover';
import { CATEGORIES } from '@/data/categories';

/** 1 ヶ月分の庭 stats */
export interface MonthStats {
  /** その月の経過日数（過去月は月の日数＝満成長、当月は今日） */
  elapsedDays: number;
  /** その月のいいね総数 */
  totalLikes: number;
  /** CATEGORIES 順のカテゴリ別件数 */
  categoryWeights: number[];
}

/** 全月分 + 当月キー */
export interface GardenData {
  current: string; // 'YYYY-MM'
  months: Record<string, MonthStats>;
}

/** '2026-06' → '6月' */
function monthLabel(month: string): string {
  const m = month.split('-')[1];
  return m ? `${Number(m)}月` : '今月';
}

/** カテゴリ割合の上位を取り出す */
function topCategories(weights: number[], n: number) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return [];
  return weights
    .map((w, i) => ({ cat: CATEGORIES[i], w, pct: Math.round((w / sum) * 100) }))
    .filter((d) => d.cat && d.w > 0)
    .sort((a, b) => b.w - a.w)
    .slice(0, n);
}

/** 木エリア左右の月送りボタン */
function MonthNavButton({
  side,
  disabled,
  onClick,
}: {
  side: 'left' | 'right';
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={side === 'left' ? '前の月へ' : '次の月へ'}
      onClick={onClick}
      disabled={disabled}
      style={{
        position: 'absolute',
        top: '50%',
        transform: 'translateY(-50%)',
        [side]: -2,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 40,
        padding: 0,
        border: 0,
        background: 'transparent',
        color: 'var(--text-3)',
        opacity: disabled ? 0.25 : 0.7,
        cursor: disabled ? 'default' : 'pointer',
        transition: 'opacity .15s',
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.opacity = '1';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = disabled ? '0.25' : '0.7';
      }}
    >
      <Icon size={22} strokeWidth={1.75} />
    </button>
  );
}

export function GardenTopBanner({
  stats,
  monthKey,
  isCurrent,
  canPrev,
  canNext,
  onPrev,
  onNext,
}: {
  stats: MonthStats;
  monthKey: string;
  isCurrent: boolean;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  // 過去月（完了済み）は確定結果、当月は進行中の予測表現
  const v = verdict(stats.elapsedDays, stats.totalLikes, !isCurrent);
  const label = monthLabel(monthKey);
  const tops = topCategories(stats.categoryWeights, 3);

  return (
    <section
      aria-label="今月のいいねで育つ庭"
      style={{ position: 'relative', width: '100%' }}
    >
      <MonthNavButton side="left" disabled={!canPrev} onClick={onPrev} />
      <MonthNavButton side="right" disabled={!canNext} onClick={onNext} />

      <ZanNoNiwa
        elapsedDays={stats.elapsedDays}
        totalLikes={stats.totalLikes}
        categoryWeights={stats.categoryWeights}
        categoryColor
      />

      {/* 判定ラベル（右上） */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 4,
          textAlign: 'right',
          pointerEvents: 'none',
          maxWidth: '70%',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: v.color }}>
          {v.label}
        </div>
        <div
          className="font-mono"
          style={{
            fontSize: 11,
            color: 'var(--text-3)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {label} {stats.totalLikes.toLocaleString()} いいね
        </div>
      </div>

      {/* カテゴリ割合（上位3）— 植木の下・右詰め */}
      {tops.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            gap: '2px 10px',
            marginTop: 2,
            paddingRight: 4,
          }}
        >
          {tops.map((d) => (
            <span
              key={d.cat.name}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 10.5,
                color: 'var(--text-2)',
                whiteSpace: 'nowrap',
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: `oklch(73% 0.18 ${d.cat.hue})`,
                }}
              />
              {d.cat.short}{' '}
              <span
                className="font-mono"
                style={{
                  color: 'var(--text-3)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {d.pct}%
              </span>
            </span>
          ))}
        </div>
      )}

      {/* ヘルプ（左上）— 木の見方とカテゴリ色の説明 */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="この木の説明"
            style={{
              position: 'absolute',
              top: 4,
              left: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 26,
              height: 26,
              padding: 0,
              border: 0,
              background: 'transparent',
              color: 'var(--text-3)',
              cursor: 'pointer',
            }}
          >
            <HelpCircle size={16} strokeWidth={1.75} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-72"
          style={{
            // Liquid Glass — 半透明 + 背景ブラー + 光るリム
            background:
              'linear-gradient(135deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.05) 38%, rgba(255,255,255,0.02) 100%), rgba(18,20,26,0.42)',
            backdropFilter: 'blur(18px) saturate(180%)',
            WebkitBackdropFilter: 'blur(18px) saturate(180%)',
            border: '1px solid rgba(255,255,255,0.16)',
            boxShadow:
              '0 12px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.25), inset 0 0 0 0.5px rgba(255,255,255,0.06)',
            color: 'var(--text-1)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-0)' }}
            >
              讚の庭 — その月のいいねで育つ桜
            </div>
            <ul
              style={{
                margin: 0,
                paddingLeft: 16,
                fontSize: 11.5,
                lineHeight: 1.7,
                color: 'var(--text-2)',
              }}
            >
              <li>
                <b style={{ color: 'var(--text-1)' }}>幹・枝</b> … その月の経過日数で育つ（1日目=苗 → 月末=完成）
              </li>
              <li>
                <b style={{ color: 'var(--text-1)' }}>花の数</b> … その月のいいね数（多いほど満開）
              </li>
              <li>
                <b style={{ color: 'var(--text-1)' }}>花の色</b> … いいねしたカテゴリ（下の凡例）
              </li>
              <li>
                <b style={{ color: 'var(--text-1)' }}>右上の判定</b> … 1日あたりのペースで大木⇄枯れ木
              </li>
              <li>カレンダーで月を選ぶと、その月の木に変わります</li>
              <li>木をタップすると揺れて花びらが散ります</li>
            </ul>

            <div
              style={{
                marginTop: 2,
                paddingTop: 8,
                borderTop: '0.5px solid var(--line-soft, #2a2d33)',
              }}
            >
              <div
                className="font-mono"
                style={{
                  fontSize: 10,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--text-3)',
                  marginBottom: 6,
                }}
              >
                花の色 = カテゴリ
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '4px 10px',
                }}
              >
                {CATEGORIES.map((c) => (
                  <div
                    key={c.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 11,
                      color: 'var(--text-2)',
                    }}
                  >
                    <span
                      style={{
                        flex: '0 0 auto',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: `oklch(73% 0.18 ${c.hue})`,
                      }}
                    />
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {c.label_ja}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </section>
  );
}
