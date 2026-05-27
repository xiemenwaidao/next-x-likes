'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { CalendarDays, LayoutGrid, ArrowRight, Search as SearchIcon } from 'lucide-react';
import { CalendarPicker } from './calendar-picker';
import { HomeInsights } from './home-insights';
import { CATEGORIES } from '@/data/categories';
import type { DateInfo } from '@/types/like';
import type { HomeInsightsData } from '@/app/page';

type CategoryCount = { name: string; count: number };

export function HomeTabs({
  allDates,
  categoryCounts,
  totalCount,
  insights,
}: {
  allDates: DateInfo[];
  categoryCounts: CategoryCount[];
  totalCount: number;
  insights: HomeInsightsData;
}) {
  const [tab, setTab] = useState<'calendar' | 'categories'>('calendar');
  const thumbRef = useRef<HTMLDivElement | null>(null);

  // Read ?tab=categories on first render (from MenuGrid "カテゴリ" entry)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const t = url.searchParams.get('tab');
    if (t === 'categories') setTab('categories');
  }, []);

  // Animated thumb
  useEffect(() => {
    if (!thumbRef.current) return;
    const parent = thumbRef.current.parentElement;
    if (!parent) return;
    const sel = parent.querySelector<HTMLElement>(`button[data-tab='${tab}']`);
    if (!sel) return;
    thumbRef.current.style.left = `${sel.offsetLeft}px`;
    thumbRef.current.style.width = `${sel.offsetWidth}px`;
  }, [tab]);

  const countMap = new Map(categoryCounts.map((c) => [c.name, c.count]));

  return (
    <div className="col-28" style={{ padding: '20px 16px 60px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Hero stat */}
      <div className="flex flex-col gap-1.5" style={{ padding: '8px 2px 0' }}>
        <div className="zk-section-label">archive</div>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-0)', letterSpacing: '-0.01em', lineHeight: 1.3, margin: 0 }}>
          <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>これまでに</span>{' '}
          <span className="font-mono" style={{ color: 'var(--zk-accent)', fontVariantNumeric: 'tabular-nums' }}>
            {totalCount.toLocaleString()}
          </span>{' '}
          <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>件いいねしました</span>
        </h1>
        <div style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5, marginTop: 4 }}>
          ある日に何をいいねしたか、どんなテーマで集めてきたか、ふたつの軸で振り返ります。
        </div>
      </div>

      {/* Tab switch */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div className="zk-tab-switch">
          <div className="thumb" ref={thumbRef} />
          <button
            type="button"
            data-tab="calendar"
            data-on={tab === 'calendar' ? '1' : '0'}
            onClick={() => setTab('calendar')}
          >
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays size={12} strokeWidth={1.75} />
              日付で
            </span>
          </button>
          <button
            type="button"
            data-tab="categories"
            data-on={tab === 'categories' ? '1' : '0'}
            onClick={() => setTab('categories')}
          >
            <span className="inline-flex items-center gap-1.5">
              <LayoutGrid size={12} strokeWidth={1.75} />
              カテゴリで
            </span>
          </button>
        </div>
      </div>

      {/* Tab content */}
      {tab === 'calendar' && (
        <div className="flex flex-col gap-6">
          <CalendarPicker allDates={allDates} />
          <HomeInsights data={insights} />
        </div>
      )}

      {tab === 'categories' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between" style={{ padding: '0 2px' }}>
            <div className="zk-section-label">
              11 カテゴリ · {totalCount.toLocaleString()} 件
            </div>
            <Link
              href="/search"
              className="inline-flex items-center gap-1"
              style={{
                fontSize: 11.5,
                color: 'var(--text-2)',
              }}
            >
              すべて検索 <ArrowRight size={12} strokeWidth={1.75} />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {CATEGORIES.map((c) => (
              <Link
                key={c.name}
                href={`/categories/${c.name}`}
                className="zk-cat-card"
                style={{ ['--hue' as never]: c.hue }}
              >
                <span className="dot" />
                <div className="num">{(countMap.get(c.name) ?? 0).toLocaleString()}</div>
                <div className="flex flex-col gap-0.5">
                  <div className="name">{c.label_ja}</div>
                  <div className="sub">{c.short}</div>
                </div>
              </Link>
            ))}
          </div>

          <Link
            href="/search"
            className="w-full inline-flex items-center justify-center gap-2"
            style={{
              padding: '12px 14px',
              background: 'var(--bg-2)',
              color: 'var(--text-1)',
              border: 0,
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 500,
              boxShadow: 'inset 0 0 0 0.5px var(--line-soft)',
              marginTop: 4,
            }}
          >
            <SearchIcon size={14} strokeWidth={1.75} /> キーワードや文章でも探す
          </Link>
        </div>
      )}
    </div>
  );
}
