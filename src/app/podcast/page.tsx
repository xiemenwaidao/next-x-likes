export const dynamic = 'force-static';
export const revalidate = false;

import type { Metadata } from 'next';
import { PodcastListClient } from '@/components/podcast-list-client';

export const metadata: Metadata = {
  title: '集讚館.fm | 集讚館',
  description:
    'その週にいいねした投稿を、動物キャラの親友たちがゆるく振り返るポッドキャスト「集讚館.fm」のエピソード一覧。',
};

export default function PodcastPage() {
  return <PodcastListClient />;
}
