'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Search as SearchIcon, X, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CATEGORIES } from '@/data/categories';
import {
  loadSearchAssets,
  searchFts,
  type SearchAssets,
  type SearchHit,
} from '@/lib/search-client';

const PAGE_SIZE = 50;

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export function SearchPageClient() {
  const [assets, setAssets] = useState<SearchAssets | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [inputValue, setInputValue] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [pageLimit, setPageLimit] = useState(PAGE_SIZE);

  const onComposition = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- アセットのロード ----
  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    loadSearchAssets({ withEmbeddings: false })
      .then((a) => {
        if (cancelled) return;
        setAssets(a);
        setLoadState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[search] failed to load assets', err);
        setLoadError(err instanceof Error ? err.message : String(err));
        setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- デバウンス (200ms) ----
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedQuery(inputValue.trim());
      setPageLimit(PAGE_SIZE);
    }, 200);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [inputValue]);

  // ---- 検索結果 ----
  const results = useMemo<SearchHit[]>(() => {
    if (!assets || loadState !== 'ready') return [];
    if (!debouncedQuery && !category) return [];
    if (!debouncedQuery && category) {
      // カテゴリのみ指定: メタから直接フィルタして liked_at DESC で返す
      const hits: SearchHit[] = [];
      for (const m of assets.meta) {
        if (m.c !== category) continue;
        hits.push({ tweet_id: m.i, score: 0, matchedBy: 'fts', meta: m });
        if (hits.length >= 500) break;
      }
      return hits;
    }
    return searchFts(assets, debouncedQuery, {
      limit: 500,
      category: category ?? undefined,
    });
  }, [assets, loadState, debouncedQuery, category]);

  const visibleResults = results.slice(0, pageLimit);
  const totalHits = results.length;
  const hasMore = totalHits > pageLimit;

  // ---- 入力ハンドラ (IME 対応) ----
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.currentTarget.value);
    },
    [],
  );
  const handleCompositionStart = useCallback(() => {
    onComposition.current = true;
  }, []);
  const handleCompositionEnd = useCallback(
    (e: React.CompositionEvent<HTMLInputElement>) => {
      onComposition.current = false;
      setInputValue(e.currentTarget.value);
    },
    [],
  );

  // ---- カテゴリ集計 (現在の検索結果に対するヒット数) ----
  const categoryCounts = useMemo(() => {
    if (!assets || loadState !== 'ready') return new Map<string, number>();
    const counts = new Map<string, number>();
    if (!debouncedQuery) {
      // クエリなし: 全体集計
      for (const m of assets.meta) {
        if (!m.c) continue;
        counts.set(m.c, (counts.get(m.c) ?? 0) + 1);
      }
      return counts;
    }
    // クエリあり: カテゴリ無視で再検索して集計
    const all = searchFts(assets, debouncedQuery, { limit: 2000 });
    for (const h of all) {
      const c = h.meta.c;
      if (!c) continue;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return counts;
  }, [assets, loadState, debouncedQuery]);

  const totalDocs = assets?.meta.length ?? 0;

  return (
    <div className="w-full px-4 py-6">
      {/* タイトル + 概要 */}
      <div className="mb-4 flex items-baseline gap-2">
        <h2 className="text-lg font-semibold text-white">検索</h2>
        {loadState === 'ready' && (
          <span className="text-xs text-gray-500">
            {totalDocs.toLocaleString()} 件のいいねから検索
          </span>
        )}
      </div>

      {/* 検索入力 */}
      <div className="mb-3">
        <div className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 focus-within:border-gray-500 transition-colors">
          <SearchIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            placeholder="キーワード、ユーザー名、要約から検索…"
            className="flex-1 bg-transparent text-white placeholder-gray-500 outline-none text-sm min-w-0"
            autoFocus
            disabled={loadState !== 'ready'}
          />
          {inputValue && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setInputValue('')}
              className="h-6 w-6 flex-shrink-0"
              aria-label="クリア"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* カテゴリフィルタ */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        <CategoryChip
          label="すべて"
          active={category === null}
          count={debouncedQuery ? totalHits : totalDocs}
          onClick={() => setCategory(null)}
        />
        {CATEGORIES.map((c) => {
          const count = categoryCounts.get(c.name) ?? 0;
          if (count === 0 && c.name !== category) return null;
          return (
            <CategoryChip
              key={c.name}
              label={c.label_ja}
              active={category === c.name}
              count={count}
              onClick={() => setCategory((cur) => (cur === c.name ? null : c.name))}
            />
          );
        })}
      </div>

      {/* ローディング / エラー */}
      {loadState === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          検索インデックスを読み込み中…
        </div>
      )}
      {loadState === 'error' && (
        <div className="text-sm text-red-400 py-8 text-center">
          インデックスの読み込みに失敗しました
          {loadError ? `: ${loadError}` : ''}
        </div>
      )}

      {/* 結果 */}
      {loadState === 'ready' && (
        <>
          <div className="mb-2 text-xs text-gray-500">
            {debouncedQuery || category ? (
              <>
                {totalHits.toLocaleString()} 件ヒット
                {category && (
                  <>
                    {' '}
                    · カテゴリ:{' '}
                    {CATEGORIES.find((c) => c.name === category)?.label_ja ?? category}
                  </>
                )}
                {debouncedQuery && <> · クエリ: 「{debouncedQuery}」</>}
              </>
            ) : (
              'キーワードを入力するか、カテゴリを選択してください'
            )}
          </div>

          <ul className="space-y-2">
            {visibleResults.map((hit) => (
              <SearchResultRow key={hit.tweet_id} hit={hit} />
            ))}
          </ul>

          {hasMore && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="secondary"
                onClick={() => setPageLimit((p) => p + PAGE_SIZE)}
                className="text-xs"
              >
                さらに {Math.min(PAGE_SIZE, totalHits - pageLimit)} 件表示
              </Button>
            </div>
          )}

          {debouncedQuery && totalHits === 0 && (
            <div className="text-sm text-gray-400 py-8 text-center">
              該当するツイートは見つかりませんでした
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CategoryChip({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors cursor-pointer ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
      }`}
      aria-pressed={active}
    >
      <span>{label}</span>
      <span className={active ? 'text-blue-100' : 'text-gray-500'}>
        {count.toLocaleString()}
      </span>
    </button>
  );
}

function SearchResultRow({ hit }: { hit: SearchHit }) {
  const { meta } = hit;
  const date = meta.l ? meta.l.slice(0, 10) : '';
  const categoryLabel =
    CATEGORIES.find((c) => c.name === meta.c)?.label_ja ?? null;

  return (
    <li>
      <Link
        href={`/tweet/${meta.i}`}
        className="block rounded-lg border border-gray-700/50 bg-gray-800/40 px-3 py-2.5 hover:bg-gray-800 hover:border-gray-600 transition-colors"
      >
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-1 flex-wrap">
          <span className="truncate">@{meta.u}</span>
          {date && (
            <>
              <span className="text-gray-600">·</span>
              <span>{date}</span>
            </>
          )}
          {categoryLabel && (
            <Badge
              variant="secondary"
              className="bg-gray-700 text-gray-200 text-[10px] py-0 px-1.5"
            >
              {categoryLabel}
            </Badge>
          )}
        </div>
        {meta.s && (
          <div className="text-sm text-white line-clamp-2 mb-1">{meta.s}</div>
        )}
        <div className={`text-xs text-gray-300 ${meta.s ? 'line-clamp-2' : 'line-clamp-3'}`}>
          {meta.t}
        </div>
        {meta.g.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {meta.g.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="text-[10px] text-gray-500 bg-gray-900/60 rounded px-1.5 py-0.5"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </Link>
    </li>
  );
}
