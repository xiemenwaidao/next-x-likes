export const dynamic = 'force-static';
export const revalidate = false;

import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SearchPageClient } from '@/components/search-page-client';

export const metadata: Metadata = {
  title: '検索 | 集讚館',
  description:
    'いいねしたツイートをカテゴリ・本文・要約を横断して検索。日付・カテゴリ・キーワード/意味検索に対応。',
};

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchPageClient />
    </Suspense>
  );
}
