export const dynamic = 'force-static';
export const revalidate = false;

import type { Metadata } from 'next';
import { SearchPageClient } from '@/components/search-page-client';

export const metadata: Metadata = {
  title: '検索 | 集讚館',
  description:
    'いいねしたツイートをカテゴリ・本文・要約を横断して検索できる Phase 2 検索ページ。',
};

export default function SearchPage() {
  return <SearchPageClient />;
}
