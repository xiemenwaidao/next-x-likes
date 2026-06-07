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
  ChevronDown,
  History as HistoryIcon,
} from 'lucide-react';
import { CATEGORIES } from '@/data/categories';
import {
  loadMetaAssets,
  loadFtsIndexAddon,
  loadEmbeddingsAddon,
  searchFts,
  searchSemantic,
  searchHybrid,
  type SearchAssets,
  type SearchHit,
} from '@/lib/search-client';
import { TweetEmbedCard } from '@/components/tweet-embed-card';
import { PodcastWeekCard } from '@/components/podcast-week-card';
import { buildPodcastDateSet, toYmd } from '@/lib/podcast-episodes';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';

const PAGE_SIZE = 12;
const ONBOARDING_KEY = 'zk_onboarding_dismissed_v1';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HISTORY_KEY = 'zk_search_history_v1';
const HISTORY_MAX = 5;
// 「キーストロークごとの中間クエリ (c, cl, clau...) を履歴に積まない」ため、
// debouncedQuery が安定してから追加で待つ時間 (ms)
const HISTORY_STABLE_MS = 1500;

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
  // FTS 索引 (search-index.json.gz, ~2.9MB) の遅延ロード状態。
  // メタ (loadState) とは別管理で、キーワードを打ったときに初めて読む。
  const [ftsIndexState, setFtsIndexState] = useState<LoadState>('idle');

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
  const inputRef = useRef<HTMLInputElement>(null);

  // 検索インデックスのロードが完了したら input に focus。
  // autoFocus 属性は disabled な要素を focus できないので、ready 遷移で
  // 明示的に focus し直す。これで「/search に着いたらすぐ打ち始められる」
  // 体験になる。
  useEffect(() => {
    if (loadState === 'ready') {
      inputRef.current?.focus();
    }
  }, [loadState]);

  // X クリアボタンで入力を空にしたら、すぐ次の入力に移れるように focus を
  // input に戻す。
  const handleClearInput = useCallback(() => {
    setInputValue('');
    inputRef.current?.focus();
  }, []);

  // ---- 検索履歴 (localStorage、ブラウザ単位) ----
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  // 初回マウント時に localStorage から読み込む
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(HISTORY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setSearchHistory(
          parsed
            .filter((s): s is string => typeof s === 'string' && s.length > 0)
            .slice(0, HISTORY_MAX),
        );
      }
    } catch {
      /* corrupt JSON → ignore */
    }
  }, []);

  // 履歴の永続化
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(searchHistory));
    } catch {
      /* quota / private mode → ignore */
    }
  }, [searchHistory]);

  // debouncedQuery が安定してから HISTORY_STABLE_MS 待って履歴に積む。
  // 入力中の "c" → "cl" → "clau" → "claude" は途中で timer がリセットされる
  // ので "claude" だけが保存される。さらに prefix dedup でうっかり "cl" が
  // 残った場合も次の "clau" / "claude" 保存時に追い出される。
  useEffect(() => {
    const q = debouncedQuery.trim();
    if (q.length === 0) return;
    // ASCII (Latin/数字/記号) は 2 文字未満を skip (= "j" 等の入力途中ノイズ
    // を抑止)。「魚」「猫」「あ」のような CJK / かな単漢字検索は length 1
    // でも意味があるので通す。
    if (q.length === 1 && /^[\x00-\x7F]$/.test(q)) return;
    const t = window.setTimeout(() => {
      setSearchHistory((prev) => {
        const next = prev.filter((x) => {
          if (x === q) return false;
          // x は q の prefix (= 短い途中入力) → 追い出す
          if (q.startsWith(x) && q.length > x.length) return false;
          // q は x の prefix (= 新クエリの方が短い、別検索でない可能性が高い)
          //   → x を残し、後で q を先頭に置くと x が下がるが OK
          return true;
        });
        return [q, ...next].slice(0, HISTORY_MAX);
      });
    }, HISTORY_STABLE_MS);
    return () => window.clearTimeout(t);
  }, [debouncedQuery]);

  // 履歴アイテム click → input に流し込んで focus
  const applyHistoryItem = useCallback((q: string) => {
    setInputValue(q);
    inputRef.current?.focus();
  }, []);

  // 個別 1 件削除
  const removeHistoryItem = useCallback((q: string) => {
    setSearchHistory((prev) => prev.filter((x) => x !== q));
  }, []);

  // 全削除
  const clearAllHistory = useCallback(() => {
    setSearchHistory([]);
    inputRef.current?.focus();
  }, []);

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

  // 日付チップから別の日付に切り替えるとき用。assets が読まれた後は
  // 利用可能な日付のみ enable する Calendar を popover に出す。
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  // 日付ビューで下までスクロールしたときに出す浮遊カレンダー (別日付ジャンプ用)
  const [floatingPickerOpen, setFloatingPickerOpen] = useState(false);
  const [showDateFab, setShowDateFab] = useState(false);
  // podcast がある週の日付を ● マーク
  const podcastDateSet = useMemo(() => buildPodcastDateSet(), []);
  const changeDate = useCallback(
    (next: Date | undefined) => {
      if (!next) return;
      const ymd = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(
        2,
        '0',
      )}-${String(next.getDate()).padStart(2, '0')}`;
      setDateFilter(ymd);
      setPageLimit(PAGE_SIZE);
      const sp = new URLSearchParams(searchParams?.toString() ?? '');
      sp.set('date', ymd);
      router.replace(`${pathname}?${sp.toString()}`);
      setDatePickerOpen(false);
      setFloatingPickerOpen(false);
      // 別の日付に切り替えたら、新しい日の先頭から見られるようトップへ戻す
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    [router, pathname, searchParams],
  );

  // 日付ビューで一定以上スクロールしたら、別日付ジャンプ用 FAB を出す
  useEffect(() => {
    if (!dateFilter) {
      setShowDateFab(false);
      return;
    }
    const onScroll = () => setShowDateFab(window.scrollY > 500);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [dateFilter]);

  // ---- iOS / iOS PWA 判定 (一度だけ) ----
  // iOS Safari / PWA は transformers.js (WASM + IndexedDB) が不安定で、
  // モデル DL が 100% で white-out するなど壊れる事例が継続発生中。
  // 当面 iOS では semantic / hybrid を無効化し、FTS のみ提供する。
  const [isIosLike, setIsIosLike] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = navigator.userAgent || '';
    const isIosUa = /iPad|iPhone|iPod/.test(ua);
    // iPadOS は Mac とほぼ同じ UA を返すので touch 数で判定補正
    const isIpadOs =
      ua.includes('Macintosh') &&
      typeof navigator.maxTouchPoints === 'number' &&
      navigator.maxTouchPoints > 1;
    if (isIosUa || isIpadOs) {
      setIsIosLike(true);
      setMode('fts');
    }
  }, []);

  // ---- localStorage から onboarding 状態 ----
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isIosLike) {
      setOnboardingState('hidden');
      return;
    }
    try {
      const dismissed = window.localStorage.getItem(ONBOARDING_KEY);
      setOnboardingState(dismissed === '1' ? 'hidden' : 'idle');
    } catch {
      setOnboardingState('idle');
    }
  }, [isIosLike]);

  const dismissOnboarding = useCallback(() => {
    setOnboardingState('hidden');
    try {
      window.localStorage.setItem(ONBOARDING_KEY, '1');
    } catch {
      /* noop */
    }
  }, []);

  // ---- アセットロード (メタのみ。FTS 索引は遅延) ----
  // /search を開いた瞬間は likes-meta (~1.7MB) だけ読む。これで日付絞り込み・
  // カテゴリ閲覧・件数・カード描画は成立する。重い FTS 索引 (~2.9MB) は
  // ユーザーがキーワードを打つまで読まない (下の遅延ロード effect)。
  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    loadMetaAssets()
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

  // ---- FTS 索引の遅延ロード ----
  // ユーザーが何か入力し始めた瞬間 (= キーワード検索の意思) に search-index を
  // 取得する。focus だけでは発火しない (ready 時の autoFocus で誤発火しないため)。
  useEffect(() => {
    if (loadState !== 'ready' || !assets) return;
    if (ftsIndexState !== 'idle') return;
    if (inputValue.trim().length === 0) return;
    setFtsIndexState('loading');
    loadFtsIndexAddon(assets)
      .then((next) => {
        // 他の addon (embeddings) と競合しても壊れないよう関数更新でマージ
        setAssets((prev) => (prev ? { ...prev, miniSearch: next.miniSearch } : next));
        setFtsIndexState('ready');
      })
      .catch((err) => {
        console.error('[search] failed to load FTS index', err);
        setFtsIndexState('error');
      });
  }, [inputValue, loadState, assets, ftsIndexState]);

  // ---- semantic bootstrap ----
  const startSemanticBootstrap = useCallback(() => {
    if (!assets || loadState !== 'ready') return;
    if (embedAssetsState === 'idle' && !assets.embeddings) {
      setEmbedAssetsState('loading');
      loadEmbeddingsAddon(assets)
        .then((next) => {
          // FTS 索引の遅延ロードと競合しても壊れないよう関数更新でマージ
          setAssets((prev) =>
            prev
              ? {
                  ...prev,
                  embeddings: next.embeddings,
                  embedOrder: next.embedOrder,
                  embedIndexById: next.embedIndexById,
                }
              : next,
          );
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

  // 日付ピッカー用: assets.meta から「いいねがある YYYY-MM-DD」の集合と
  // 日付範囲 (最古〜最新) を導出する。assets ロード前は空集合 = どの日も
  // 無効化されないが選択は可能 (空ヒットでも UX 上クラッシュしない)。
  const { availableDateSet, fromDate, toDate } = useMemo(() => {
    if (!assets) {
      return {
        availableDateSet: new Set<string>(),
        fromDate: undefined as Date | undefined,
        toDate: undefined as Date | undefined,
      };
    }
    const set = new Set<string>();
    let minMs = Number.POSITIVE_INFINITY;
    let maxMs = 0;
    for (const m of assets.meta) {
      if (m.p === 1 || m.n === 1) continue;
      const ymd = (m.l || '').slice(0, 10);
      if (!ymd) continue;
      set.add(ymd);
      const t = Date.parse(ymd);
      if (Number.isFinite(t)) {
        if (t < minMs) minMs = t;
        if (t > maxMs) maxMs = t;
      }
    }
    return {
      availableDateSet: set,
      fromDate: Number.isFinite(minMs) ? new Date(minMs) : undefined,
      toDate: maxMs ? new Date(maxMs) : undefined,
    };
  }, [assets]);

  // dateFilter (YYYY-MM-DD string) を Calendar が期待する Date に変換
  const dateFilterAsDate = useMemo(() => {
    if (!dateFilter) return undefined;
    const [y, m, d] = dateFilter.split('-').map(Number);
    if (!y || !m || !d) return undefined;
    return new Date(y, m - 1, d);
  }, [dateFilter]);

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

      {/* date filter chip — 日付テキスト自体が Popover トリガーになり、
          別の日付に切り替えるカレンダーを開ける */}
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
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1"
                style={{
                  padding: '2px 6px',
                  margin: '-2px -2px -2px -6px',
                  borderRadius: 6,
                  background: 'transparent',
                  color: 'inherit',
                  fontSize: 'inherit',
                  cursor: 'pointer',
                  transition: 'background 120ms ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
                aria-label="別の日付を選ぶ"
              >
                <span className="font-mono">{dateFilter}</span>
                <ChevronDown size={11} strokeWidth={1.75} style={{ opacity: 0.6 }} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-2">
              <Calendar
                mode="single"
                selected={dateFilterAsDate}
                onSelect={changeDate}
                modifiers={{ podcast: (date) => podcastDateSet.has(toYmd(date)) }}
                modifiersClassNames={{ podcast: 'zk-day-podcast' }}
                disabled={(date) => {
                  // assets 未ロード時は無効化しない (set が空 = 全部 enable)
                  if (availableDateSet.size === 0) return false;
                  const ymd = `${date.getFullYear()}-${String(
                    date.getMonth() + 1,
                  ).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                  return !availableDateSet.has(ymd);
                }}
                fromDate={fromDate}
                toDate={toDate}
                defaultMonth={dateFilterAsDate}
              />
            </PopoverContent>
          </Popover>
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

      {/* この週のポッドキャスト (episode があれば再生カード) */}
      <PodcastWeekCard dateYmd={dateFilter} />

      {/* 検索入力 */}
      <div className="zk-search-shell">
        <SearchIcon size={16} strokeWidth={1.75} style={{ color: 'var(--text-2)' }} />
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder={placeholder}
          style={{ marginLeft: 10 }}
          disabled={loadState !== 'ready'}
        />
        {(encodingState === 'loading' || ftsIndexState === 'loading') && (
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
            onClick={handleClearInput}
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

      {/* 検索履歴 — 入力欄が空のときだけ、検索 shell 直下に横並びで控えめに */}
      {!inputValue && searchHistory.length > 0 && (
        <div className="zk-history">
          <span className="zk-history-label" aria-hidden>
            <HistoryIcon size={10.5} strokeWidth={1.75} /> 最近
          </span>
          <ul className="zk-history-list">
            {searchHistory.map((q) => (
              <li key={q} className="zk-history-item">
                <button
                  type="button"
                  className="zk-history-pick"
                  onClick={() => applyHistoryItem(q)}
                  title={q}
                >
                  <span className="zk-history-text">{q}</span>
                </button>
                <button
                  type="button"
                  className="zk-history-remove"
                  onClick={() => removeHistoryItem(q)}
                  aria-label={`「${q}」を履歴から削除`}
                >
                  <X size={10} strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={clearAllHistory}
            className="zk-history-clear"
            aria-label="検索履歴をすべて消去"
            title="すべて消去"
          >
            <X size={11} strokeWidth={1.75} />
          </button>
        </div>
      )}

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
              <button
                type="button"
                data-on={mode === 'semantic' ? '1' : '0'}
                onClick={() => !isIosLike && semanticReady && setMode('semantic')}
                disabled={isIosLike || !semanticReady}
                style={{ opacity: !isIosLike && semanticReady ? 1 : 0.4 }}
              >
                Semantic
              </button>
              <button
                type="button"
                data-on={mode === 'hybrid' ? '1' : '0'}
                onClick={() => !isIosLike && semanticReady && setMode('hybrid')}
                disabled={isIosLike || !semanticReady}
                style={{ opacity: !isIosLike && semanticReady ? 1 : 0.4 }}
              >
                Hybrid
              </button>
            </div>
          </div>

          {isIosLike && (
            <div
              style={{
                fontSize: 11,
                color: 'var(--text-3)',
                padding: '6px 10px',
                borderRadius: 6,
                background: 'oklch(20% 0.012 250 / 0.4)',
                boxShadow: 'inset 0 0 0 0.5px var(--line-soft)',
                lineHeight: 1.5,
              }}
            >
              iOS では端末側の制約でモデル読み込みが不安定なため、意味検索は一時的に無効です。キーワード検索 (FTS) のみご利用いただけます。
            </div>
          )}

          {mode === 'hybrid' && !isIosLike && (
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

          {!isIosLike && (
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
          )}
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
        <div className="zk-loading">
          <div className="zk-loading-bar" aria-hidden>
            <div className="zk-loading-bar-fill" />
          </div>
          <div className="zk-loading-text" aria-live="polite">
            検索インデックスを準備中
          </div>
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
          {totalHits === 0 && debouncedQuery && ftsIndexState === 'loading' ? (
            <div className="zk-empty">
              <div style={{ fontSize: 24, opacity: 0.4 }}>
                <Loader2 size={20} strokeWidth={1.75} className="animate-spin" style={{ opacity: 0.6 }} />
              </div>
              <div style={{ fontSize: 12 }}>検索インデックスを準備中…</div>
            </div>
          ) : totalHits === 0 && (debouncedQuery || category || dateFilter) ? (
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

      {/* 日付ビューで下までスクロールしたとき、トップに戻らず別日付へ飛べる FAB。
          ScrollTopButton と同じくコンテンツ列 (max-w 28rem) の右端に揃え、画面端には飛ばさない。
          ScrollTopButton (bottom 20px / 高さ 40px) の上に重ならないよう +52px 持ち上げる。 */}
      {dateFilter && (
        <div
          className="fixed z-50"
          style={{
            left: 0,
            right: 0,
            // ScrollTopButton (+52px) の上 + 永続プレイヤー表示中はさらに上へ逃がす
            bottom:
              'calc(max(20px, env(safe-area-inset-bottom)) + 52px + var(--zk-player-offset, 0px))',
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
            transition: 'bottom 240ms cubic-bezier(0.22, 0.61, 0.36, 1)',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '28rem',
              paddingInline: 16,
              boxSizing: 'border-box',
              display: 'flex',
              justifyContent: 'flex-end',
            }}
          >
            <Popover open={floatingPickerOpen} onOpenChange={setFloatingPickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="別の日付へ移動"
                  style={{
                    // 常時マウントしておき、表示/非表示は opacity+transform で滑らかに
                    opacity: showDateFab ? 1 : 0,
                    transform: showDateFab
                      ? 'translateY(0) scale(1)'
                      : 'translateY(10px) scale(0.8)',
                    pointerEvents: showDateFab ? 'auto' : 'none',
                    transition:
                      'opacity 280ms cubic-bezier(0.22, 0.61, 0.36, 1), transform 280ms cubic-bezier(0.22, 0.61, 0.36, 1)',
                    willChange: 'opacity, transform',
                    width: 40,
                    height: 40,
                    borderRadius: 999,
                    border: 0,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'oklch(22% 0.012 250 / 0.55)',
                    backdropFilter: 'blur(18px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(18px) saturate(180%)',
                    color: 'var(--zk-accent)',
                    boxShadow:
                      '0 8px 24px rgba(0,0,0,0.4), inset 0 0.5px 0 oklch(100% 0 0 / 0.18), inset 0 0 0 0.5px var(--zk-accent-line)',
                  }}
                >
                  <CalendarDays size={18} strokeWidth={1.9} />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                side="top"
                className="zk-glass-popover w-auto p-2"
              >
                <Calendar
                  mode="single"
                  selected={dateFilterAsDate}
                  onSelect={changeDate}
                  modifiers={{ podcast: (date) => podcastDateSet.has(toYmd(date)) }}
                  modifiersClassNames={{ podcast: 'zk-day-podcast' }}
                  disabled={(date) => {
                    if (availableDateSet.size === 0) return false;
                    const ymd = `${date.getFullYear()}-${String(
                      date.getMonth() + 1,
                    ).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                    return !availableDateSet.has(ymd);
                  }}
                  fromDate={fromDate}
                  toDate={toDate}
                  defaultMonth={dateFilterAsDate}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
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
