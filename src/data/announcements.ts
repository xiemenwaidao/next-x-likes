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
    id: 'activity-graph',
    icon: '📊',
    title: 'いいね活動グラフ',
    description: '直近7日間のいいね数を可視化',
    isNew: true,
    date: '2025-06-05'
  },
  {
    id: 'url-list',
    icon: '🔗',
    title: 'URL一覧',
    description: 'URL付きツイートを閲覧',
    isNew: false,
    date: '2025-06-03'
  },
  {
    id: 'search',
    icon: '🔍',
    title: '全文検索',
    description: '全ツイートを検索可能',
    isNew: false,
    date: '2025-06-02'
  }
];

// Helper function to check if there are any new announcements
export const hasNewAnnouncements = () => announcements.some(item => item.isNew);