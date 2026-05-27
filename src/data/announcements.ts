export interface Announcement {
  id: string;
  icon: string;
  title: string;
  description: string;
  isNew?: boolean;
  date: string; // YYYY-MM-DD format for sorting
}

export const announcements: Announcement[] = [
  {
    id: 'reply-conversation-2026-05-28',
    icon: '💬',
    title: '返信ツイートで親も表示',
    description:
      'いいねしたツイートが返信 (reply) のとき、X 公式埋め込みで親ツイートも同時に出すように切替。文脈を失わずに見返せます。',
    isNew: true,
    date: '2026-05-28',
  },
  {
    id: 'mobile-polish-2026-05-28',
    icon: '📱',
    title: 'モバイル UX を整備',
    description:
      'iPhone でタップ時にズームしてしまう挙動を抑止、横スクロール発生も解消。ページトップへ戻るボタンも刷新。',
    isNew: true,
    date: '2026-05-28',
  },
  {
    id: 'home-insights-2026-05-28',
    icon: '📊',
    title: 'ホームのインサイト刷新',
    description:
      '直近 7 日の棒グラフを廃し、直近 30 日の件数 / 前月比 / ホットなカテゴリ / よく見るユーザー / 月別チャートで振り返れるように。',
    isNew: true,
    date: '2026-05-28',
  },
  {
    id: 'ios-semantic-temporarily-off',
    icon: '⚠️',
    title: 'iOS では意味検索を一時停止',
    description:
      'iOS Safari / PWA で AI モデル (multilingual-e5-small) の読み込みが不安定なため、当面 iPhone・iPad ではキーワード検索のみ。Android / PC では従来通り意味検索を利用可能。',
    isNew: true,
    date: '2026-05-28',
  },
  {
    id: 'redesign-2026-05',
    icon: '🎨',
    title: '全面リデザイン',
    description:
      'ホームに [日付で / カテゴリで] のタブを追加、検索 UI を歯車格納の設定 + onboarding バナーに整理、結果カードを 4 階層化。',
    isNew: false,
    date: '2026-05-27',
  },
  {
    id: 'categories-2026-05',
    icon: '🗂️',
    title: 'カテゴリ別ブラウジング',
    description:
      '12,000+ 件のいいねを 11 カテゴリに AI 自動分類。/categories/[slug] で sub-tag 絞り込み付きの一覧。',
    isNew: false,
    date: '2026-05-27',
  },
  {
    id: 'hybrid-search-2026-05',
    icon: '✨',
    title: 'ハイブリッド検索を導入',
    description:
      'キーワード (FTS) + 意味 (multilingual-e5-small による semantic) のハイブリッド検索を /search に実装。カレンダー連動の日付絞り込みも対応。',
    isNew: false,
    date: '2026-05-26',
  },
  {
    id: 'tweet-card-rebuild-2026-05',
    icon: '🪶',
    title: 'カード描画を軽量化',
    description:
      'X 公式 widgets.js を IntersectionObserver で lazy 埋め込みに切替、SSG ページ数を 5,684 → 470 (-92%) に圧縮。',
    isNew: false,
    date: '2026-05-27',
  },
  {
    id: 'archive-page',
    icon: '🚧',
    title: 'アーカイブページ',
    description: '2024年11月以前にいいねしたツイート一覧（調整中）',
    isNew: false,
    date: '2025-06-10',
  },
  {
    id: 'url-list',
    icon: '🔗',
    title: 'URL一覧',
    description: 'URL付きツイート一覧',
    isNew: false,
    date: '2025-06-03',
  },
];

// Helper function to check if there are any new announcements
export const hasNewAnnouncements = () =>
  announcements.some((item) => item.isNew);
