'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  Search as SearchIcon,
  X,
  Loader2,
  Settings as GearIcon,
  Sparkles,
  Download,
  CalendarDays,
} from 'lucide-react';
import { CATEGORIES } from '@/data/categories';
import {
  loadSearchAssets,
  loadEmbeddingsAddon,
  searchFts,
  searchSemantic,
  searchHybrid,
  type SearchAssets,
  type SearchHit,
} from '@/lib/search-client';
import { TweetEmbedCard } from '@/components/tweet-embed-card';

const PAGE_SIZE = 12;
const ONBOARDING_KEY = 'zk_onboarding_dismissed_v1';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type LoadState = 'idle' | 'loading' | 'ready' | 'error';
type Mode = 'fts' | 'semantic' | 'hybrid';

export function SearchPageClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // ---- アセット (FTS) ----
  const [assets, setAssets] = useState<SearchAssets | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);

  // ---- 入力 / 絞り込み ----
  const [inputValue, setInputValue] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<string | null>(null);
  const [pageLimit, setPageLimit] = useState(PAGE_SIZE);

  // ---- モード ----
  const [mode, setMode] = useState<Mode>('hybrid');
  const [hybridWeight, setHybridWeight] = useState(0.6);

  // ---- 設定パネル ----
  const [showSettings, setShowSettings] = useState(false);

  // ---- onboarding ----
  const [onboardingState, setOnboardingState] = useState<
    'hidden' | 'idle' | 'downloading' | 'ready'
  >('hidden');

  // ---- Semantic / embedder lazy ロード ----
  const [embedAssetsState, setEmbedAssetsState] = useState<LoadState>('idle');
  const [embedderState, setEmbedderState] = useState<LoadState>('idle');
  const [embedderProgress, setEmbedderProgress] = useState<number>(0);
  const [queryVec, setQueryVec] = useState<Float32Array | null>(null);
  const [encodingState, setEncodingState] = useState<LoadState>('idle');

  const onComposition = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- URL の ?date= を初期化時に読む ----
  useEffect(() => {
    const d = searchParams?.get('date');
    if (d && DATE_RE.test(d)) {
      setDateFilter(d);
    } else {
      setDateFilter(null);
    }
  }, [searchParams]);

  const clearDateFilter = useCallback(() => {
    setDateFilter(null);
    setPageLimit(PAGE_SIZE);
    // URL からも除去
    const sp = new URLSearchParams(searchParams?.toString() ?? '');
    sp.delete('date');
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [router, pathname, searchParams]);

  // ---- localStorage から onboarding 状態 ----
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const dismissed = window.localStorage.getItem(ONBOARDING_KEY);
      setOnboardingState(dismissed === '1' ? 'hidden' : 'idle');
    } catch {
      setOnboardingState('idle');
    }
  }, []);

  const dismissOnboarding = useCallback(() => {
    setOnboardingState('hidden');
    try {
      window.localStorage.setItem(ONBOARDING_KEY, '1');
    } catch {
      /* noop */
    }
  }, []);

  // ---- アセットロード ----
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

  // ---- semantic bootstrap ----
  const startSemanticBootstrap = useCallback(() => {
    if (!assets || loadState !== 'ready') return;
    if (embedAssetsState === 'idle' && !assets.embeddings) {
      setEmbedAssetsState('loading');
      loadEmbeddingsAddon(assets)
        .then((next) => {
          setAssets(next);
          setEmbedAssetsState('ready');
        })
        .catch((err) => {
          console.error('[search] failed to load embeddings', err);
          setEmbedAssetsState('error');
        });
    }
    if (embedderState === 'idle') {
      setEmbedderState('loading');
      setEmbedderProgress(0);
      import('@/lib/query-embedder')
        .then(({ loadQueryEmbedder }) =>
          loadQueryEmbedder((p) => {
            if (p.fraction !== null) setEmbedderProgress(p.fraction);
          }),
        )
        .then(() => {
          setEmbedderProgress(1);
          setEmbedderState('ready');
        })
        .catch((err) => {
          console.error('[search] failed to load embedder', err);
          setEmbedderState('error');
        });
    }
  }, [assets, loadState, embedAssetsState, embedderState]);

  useEffect(() => {
    if (mode === 'fts') return;
    if (loadState !== 'ready') return;
    if (onboardingState === 'hidden') startSemanticBootstrap();
  }, [mode, loadState, onboardingState, startSemanticBootstrap]);

  const handleStartDownload = useCallback(() => {
    setOnboardingState('downloading');
    startSemanticBootstrap();
  }, [startSemanticBootstrap]);

  useEffect(() => {
    if (
      onboardingState === 'downloading' &&
      embedderState === 'ready' &&
      embedAssetsState === 'ready'
    ) {
      setOnboardingState('ready');
    }
  }, [onboardingState, embedderState, embedAssetsState]);

  // ---- デバウンス ----
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

  // ---- クエリ encode ----
  useEffect(() => {
    if (mode === 'fts') {
      setQueryVec(null);
      setEncodingState('idle');
      return;
    }
    if (!debouncedQuery) {
      setQueryVec(null);
      setEncodingState('idle');
      return;
    }
    if (embedderState !== 'ready') return;

    let cancelled = false;
    setEncodingState('loading');
    import('@/lib/query-embedder')
      .then(({ embedQuery }) => embedQuery(debouncedQuery))
      .then((vec) => {
        if (cancelled) return;
        setQueryVec(vec);
        setEncodingState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[search] encode failed', err);
        setEncodingState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, mode, embedderState]);

  // ---- 検索結果 + date filter ----
  const results = useMemo<SearchHit[]>(() => {
    if (!assets || loadState !== 'ready') return [];

    // date のみ指定 (クエリ・カテゴリなし)
    if (!debouncedQuery && !category && dateFilter) {
      const hits: SearchHit[] = [];
      for (const m of assets.meta) {
        if (m.l.slice(0, 10) !== dateFilter) continue;
        hits.push({ tweet_id: m.i, score: 0, matchedBy: 'fts', meta: m });
        if (hits.length >= 500) break;
      }
      return hits;
    }

    if (!debouncedQuery && !category) return [];

    // カテゴリのみ
    if (!debouncedQuery && category) {
      const hits: SearchHit[] = [];
      for (const m of assets.meta) {
        if (m.c !== category) continue;
        if (dateFilter && m.l.slice(0, 10) !== dateFilter) continue;
        hits.push({ tweet_id: m.i, score: 0, matchedBy: 'fts', meta: m });
        if (hits.length >= 500) break;
      }
      return hits;
    }

    let baseHits: SearchHit[];
    if (mode === 'fts') {
      baseHits = searchFts(assets, debouncedQuery, {
        limit: 1000,
        category: category ?? undefined,
      });
    } else if (!queryVec || !assets.embeddings) {
      baseHits = searchFts(assets, debouncedQuery, {
        limit: 1000,
        category: category ?? undefined,
      });
    } else if (mode === 'semantic') {
      baseHits = searchSemantic(assets, queryVec, {
        limit: 1000,
        category: category ?? undefined,
      });
    } else {
      baseHits = searchHybrid(assets, debouncedQuery, queryVec, {
        limit: 1000,
        category: category ?? undefined,
        ftsWeight: 1 - hybridWeight,
        semanticWeight: hybridWeight,
      });
    }

    if (dateFilter) {
      return baseHits.filter((h) => h.meta.l.slice(0, 10) === dateFilter).slice(0, 500);
    }
    return baseHits.slice(0, 500);
  }, [assets, loadState, debouncedQuery, category, dateFilter, mode, queryVec, hybridWeight]);

  const visibleResults = results.slice(0, pageLimit);
  const totalHits = results.length;
  const hasMore = totalHits > pageLimit;
  const totalDocs = assets?.meta.length ?? 0;

  // ---- カテゴリ集計 ----
  const categoryCounts = useMemo(() => {
    if (!assets || loadState !== 'ready') return new Map<string, number>();
    const counts = new Map<string, number>();
    if (!debouncedQuery) {
      for (const m of assets.meta) {
        if (!m.c) continue;
        if (dateFilter && m.l.slice(0, 10) !== dateFilter) continue;
        counts.set(m.c, (counts.get(m.c) ?? 0) + 1);
      }
      return counts;
    }
    const all = searchFts(assets, debouncedQuery, { limit: 2000 });
    for (const h of all) {
      const c = h.meta.c;
      if (!c) continue;
      if (dateFilter && h.meta.l.slice(0, 10) !== dateFilter) continue;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return counts;
  }, [assets, loadState, debouncedQuery, dateFilter]);

  // ---- 入力ハンドラ ----
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.currentTarget.value),
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

  const semanticReady = embedAssetsState === 'ready' && embedderState === 'ready';
  const modeLabel: Record<Mode, string> = {
    fts: 'キーワード',
    semantic: '意味',
    hybrid: '両方',
  };
  const placeholder =
    mode === 'fts'
      ? 'キーワードで検索 (例: tailwind)'
      : mode === 'semantic'
        ? '文章で意味検索 (例: 余白の使い方について)'
        : 'キーワードや文章を入力';

  return (
    <div className="col-28" style={{ padding: '16px 16px 60px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* タイトル */}
      <div className="flex flex-col gap-1.5" style={{ padding: '4px 2px 0' }}>
        <div className="zk-section-label">search</div>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-0)', margin: 0 }}>
          検索
        </h1>
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
          {loadState === 'ready'
            ? `${totalDocs.toLocaleString()} 件のいいねから探します。`
            : loadState === 'loading'
              ? 'インデックスを読み込み中…'
              : '読み込みに失敗しました'}
        </div>
      </div>

      {/* Onboarding banner */}
      {onboardingState === 'idle' && (
        <OnboardingBanner onStart={handleStartDownload} onLater={dismissOnboarding} />
      )}
      {onboardingState === 'downloading' && (
        <DownloadingBanner progress={embedderProgress} />
      )}
      {onboardingState === 'ready' && (
        <ReadyBanner onClose={dismissOnboarding} />
      )}

      {/* date filter chip */}
      {dateFilter && (
        <div
          className="flex items-center gap-2"
          style={{
            padding: '8px 12px',
            borderRadius: 10,
            background: 'var(--zk-accent-soft)',
            color: 'var(--text-0)',
            boxShadow: 'inset 0 0 0 0.5px var(--zk-accent-line)',
            fontSize: 12.5,
          }}
        >
          <CalendarDays size={14} strokeWidth={1.75} style={{ color: 'var(--zk-accent)' }} />
          <span className="font-mono">{dateFilter}</span>
          <span style={{ color: 'var(--text-2)' }}>のいいねに絞り込み中</span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={clearDateFilter}
            className="zk-icon-btn"
            style={{ width: 24, height: 24 }}
            aria-label="日付フィルタを解除"
          >
            <X size={12} strokeWidth={1.75} />
          </button>
        </div>
      )}

      {/* 検索入力 */}
      <div className="zk-search-shell">
        <SearchIcon size={16} strokeWidth={1.75} style={{ color: 'var(--text-2)' }} />
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder={placeholder}
          style={{ marginLeft: 10 }}
          autoFocus
          disabled={loadState !== 'ready'}
        />
        {encodingState === 'loading' && (
          <Loader2
            size={14}
            strokeWidth={1.75}
            className="animate-spin flex-shrink-0"
            style={{ color: 'var(--text-3)' }}
          />
        )}
        {inputValue && (
          <button
            type="button"
            className="zk-icon-btn"
            style={{ width: 28, height: 28, marginRight: -4 }}
            onClick={() => setInputValue('')}
            aria-label="クリア"
          >
            <X size={12} strokeWidth={1.75} />
          </button>
        )}
        <div style={{ width: 1, height: 18, background: 'var(--line-soft)', margin: '0 4px' }} />
        <button
          type="button"
          className="zk-icon-btn"
          style={{ width: 28, height: 28 }}
          data-active={showSettings ? '1' : '0'}
          onClick={() => setShowSettings((v) => !v)}
          aria-label="検索の設定"
        >
          <GearIcon size={14} strokeWidth={1.5} />
        </button>
      </div>

      {/* Settings sheet */}
      {showSettings && (
        <div className="zk-sheet">
          <div className="flex items-center justify-between" style={{ paddingBottom: 4, borderBottom: '0.5px solid var(--line-soft)', marginBottom: 2 }}>
            <div className="zk-section-label">search · advanced</div>
            <span style={{ fontSize: 10.5, color: 'var(--text-3)' }}>通常は触らなくて OK</span>
          </div>

          <div className="row">
            <div>
              <div style={{ color: 'var(--text-1)', fontSize: 12.5, fontWeight: 500 }}>探し方</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2 }}>キーワード / 意味 / 両方</div>
            </div>
            <div className="seg">
              <button type="button" data-on={mode === 'fts' ? '1' : '0'} onClick={() => setMode('fts')}>FTS</button>
              <button type="button" data-on={mode === 'semantic' ? '1' : '0'} onClick={() => semanticReady && setMode('semantic')} disabled={!semanticReady} style={{ opacity: semanticReady ? 1 : 0.4 }}>Semantic</button>
              <button type="button" data-on={mode === 'hybrid' ? '1' : '0'} onClick={() => semanticReady && setMode('hybrid')} disabled={!semanticReady} style={{ opacity: semanticReady ? 1 : 0.4 }}>Hybrid</button>
            </div>
          </div>

          {mode === 'hybrid' && (
            <div className="row">
              <div>
                <div style={{ color: 'var(--text-1)', fontSize: 12.5, fontWeight: 500 }}>意味の重み</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2 }}>
                  FTS ←→ Semantic ({Math.round(hybridWeight * 100)}%)
                </div>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(hybridWeight * 100)}
                onChange={(e) => setHybridWeight(Number(e.target.value) / 100)}
                style={{ width: 120, accentColor: 'var(--zk-accent)' }}
              />
            </div>
          )}

          <div className="row">
            <div>
              <div style={{ color: 'var(--text-1)', fontSize: 12.5, fontWeight: 500 }}>セマンティックモデル</div>
              <div className="font-mono" style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2 }}>
                multilingual-e5-small · 384 dim
              </div>
            </div>
            <span
              className="zk-pill-xs"
              style={{
                color: semanticReady
                  ? 'oklch(70% 0.13 160)'
                  : embedderState === 'loading'
                    ? 'var(--text-2)'
                    : 'var(--text-3)',
              }}
            >
              {semanticReady
                ? '準備済み'
                : embedderState === 'loading'
                  ? `DL ${Math.round(embedderProgress * 100)}%`
                  : '未 DL'}
            </span>
          </div>
        </div>
      )}

      {/* カテゴリチップ */}
      {loadState === 'ready' && (
        <div className="flex flex-wrap gap-1.5" style={{ marginTop: 2 }}>
          <button type="button" className="zk-pill" data-on={category === null ? '1' : '0'} onClick={() => setCategory(null)}>
            すべて
            <span className="count">{totalDocs.toLocaleString()}</span>
          </button>
          {CATEGORIES.map((c) => {
            const count = categoryCounts.get(c.name) ?? 0;
            if (count === 0 && c.name !== category) return null;
            const active = category === c.name;
            return (
              <button
                key={c.name}
                type="button"
                className="zk-pill"
                data-on={active ? '1' : '0'}
                onClick={() => setCategory((cur) => (cur === c.name ? null : c.name))}
              >
                {!active && (
                  <i
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: `oklch(60% 0.18 ${c.hue})`,
                      display: 'inline-block',
                    }}
                  />
                )}
                {c.label_ja}
                <span className="count">{count.toLocaleString()}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Result meta */}
      {loadState === 'ready' && (
        <div className="flex items-center gap-2" style={{ padding: '4px 4px', fontSize: 11, color: 'var(--text-3)' }}>
          <span className="font-mono">{totalHits.toLocaleString()} 件</span>
          <span>·</span>
          <span style={{ color: 'var(--text-2)' }}>{modeLabel[mode]}</span>
          {debouncedQuery && (
            <>
              <span>·</span>
              <span style={{ fontStyle: 'italic' }}>&quot;{debouncedQuery}&quot;</span>
            </>
          )}
          <span className="flex-1" />
          {totalHits > 0 && <span className="font-mono">{dateFilter ? '日付順' : '関連度順'}</span>}
        </div>
      )}

      {/* Loading / Error */}
      {loadState === 'loading' && (
        <div className="zk-empty">
          <Loader2 size={20} strokeWidth={1.5} className="animate-spin" />
          <div>検索インデックスを読み込み中…</div>
        </div>
      )}
      {loadState === 'error' && (
        <div className="zk-empty" style={{ color: 'oklch(60% 0.16 20)' }}>
          <div>—</div>
          <div>インデックスの読み込みに失敗しました{loadError ? `: ${loadError}` : ''}</div>
        </div>
      )}

      {/* Results */}
      {loadState === 'ready' && (
        <>
          {totalHits === 0 && (debouncedQuery || category || dateFilter) ? (
            <div className="zk-empty">
              <div style={{ fontSize: 24, opacity: 0.4 }}>—</div>
              <div style={{ fontSize: 12 }}>該当するいいねが見つかりませんでした</div>
            </div>
          ) : totalHits === 0 ? (
            <div className="zk-empty">
              <div style={{ fontSize: 24, opacity: 0.4 }}>—</div>
              <div style={{ fontSize: 12 }}>キーワードを入力するか、カテゴリ・日付で絞り込んでください</div>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {visibleResults.map((hit) => (
                <TweetEmbedCard
                  key={hit.tweet_id}
                  meta={{
                    tweet_id: hit.meta.i,
                    username: hit.meta.u,
                    liked_at: hit.meta.l,
                    category: hit.meta.c,
                    summary_ja: hit.meta.s,
                    sub_tags: hit.meta.g,
                    text: hit.meta.t,
                    score: hit.score,
                    showScore: mode !== 'fts',
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
              さらに表示 ({totalHits - pageLimit} 件)
            </button>
          )}
        </>
      )}
    </div>
  );
}

function OnboardingBanner({ onStart, onLater }: { onStart: () => void; onLater: () => void }) {
  return (
    <div className="zk-banner">
      <div className="flex items-start gap-3">
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'var(--zk-accent-soft)',
            color: 'var(--zk-accent)',
            boxShadow: 'inset 0 0 0 0.5px var(--zk-accent-line)',
          }}
        >
          <Sparkles size={16} strokeWidth={1.5} />
        </div>
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-0)', lineHeight: 1.4 }}>
            「意味で探す」を使えるようにする
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 4, lineHeight: 1.5 }}>
            文章で似た内容を探せるようになります。
            <br />
            初回のみ <span className="font-mono" style={{ color: 'var(--text-1)' }}>25 MB</span> のモデルを端末に保存します — 一度きりです。
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              type="button"
              onClick={onStart}
              style={{
                background: 'var(--zk-accent)',
                color: 'var(--zk-accent-fg)',
                border: 0,
                height: 32,
                padding: '0 14px',
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: 500,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Download size={13} strokeWidth={1.75} /> 準備する (25 MB)
            </button>
            <button
              type="button"
              onClick={onLater}
              style={{
                background: 'transparent',
                color: 'var(--text-2)',
                border: 0,
                height: 32,
                padding: '0 12px',
                borderRadius: 8,
                fontSize: 12.5,
                cursor: 'pointer',
              }}
            >
              あとで
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DownloadingBanner({ progress }: { progress: number }) {
  return (
    <div className="zk-banner">
      <div className="flex items-start gap-3">
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'var(--zk-accent-soft)',
            color: 'var(--zk-accent)',
            boxShadow: 'inset 0 0 0 0.5px var(--zk-accent-line)',
          }}
        >
          <Loader2 size={16} strokeWidth={1.5} className="animate-spin" />
        </div>
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-0)' }}>
            モデルを準備しています…
          </div>
          <div
            style={{
              marginTop: 10,
              height: 4,
              borderRadius: 2,
              background: 'oklch(28% 0.012 250)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, Math.round(progress * 100))}%`,
                background: 'var(--zk-accent)',
                transition: 'width .12s linear',
              }}
            />
          </div>
          <div
            className="font-mono flex justify-between"
            style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 6 }}
          >
            <span>multilingual-e5-small</span>
            <span>{Math.min(100, Math.round(progress * 100))}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReadyBanner({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="flex items-center gap-2"
      style={{
        fontSize: 11.5,
        color: 'oklch(70% 0.13 160)',
        padding: '8px 12px',
        borderRadius: 8,
        background: 'oklch(20% 0.04 160 / 0.4)',
        boxShadow: 'inset 0 0 0 0.5px oklch(50% 0.12 160 / 0.4)',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: 'oklch(70% 0.18 160)',
          boxShadow: '0 0 8px oklch(70% 0.18 160 / 0.6)',
        }}
      />
      意味検索が使えるようになりました
      <span className="flex-1" />
      <button
        type="button"
        onClick={onClose}
        className="font-mono"
        style={{ background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer', opacity: 0.7, fontSize: 10.5 }}
      >
        ✕
      </button>
    </div>
  );
}
