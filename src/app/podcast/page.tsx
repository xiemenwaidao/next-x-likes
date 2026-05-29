export const dynamic = 'force-static';
export const revalidate = false;

import type { Metadata } from 'next';
import { PodcastListClient } from '@/components/podcast-list-client';

export const metadata: Metadata = {
  title: '集讚館ラジオ | 集讚館',
  description:
    'その週にいいねした投稿を、ウサギと猫の 2 人がゆるく振り返るポッドキャスト「集讚館ラジオ」のエピソード一覧。',
};

export default function PodcastPage() {
  return <PodcastListClient />;
}
