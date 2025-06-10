export const dynamic = 'force-static';
export const revalidate = false;

import { CustomTweet } from '@/components/custom-tweet';
import { DayJson } from '@/types/like';
import { promises as fs } from 'fs';
import path from 'path';
import { notFound } from 'next/navigation';

type Props = {
  params: Promise<{
    date: string;
  }>;
};

// 静的パスを生成する関数（フラットな構造で高速化）
export async function generateStaticParams() {
  const contentDir = path.join(process.cwd(), 'src', 'content', 'likes');
  const paths = [];

  const years = await fs.readdir(contentDir);

  for (const year of years) {
    const yearPath = path.join(contentDir, year);
    const months = await fs.readdir(yearPath);

    for (const month of months) {
      const monthPath = path.join(yearPath, month);
      const days = await fs.readdir(monthPath);

      for (const day of days) {
        if (day.endsWith('.json')) {
          paths.push({
            date: `${year}-${month}-${day.replace('.json', '')}`,
          });
        }
      }
    }
  }

  return paths;
}

async function getContentData(date: string) {
  try {
    // date形式: "2025-01-10" を分解
    const [year, month, day] = date.split('-');
    
    if (!year || !month || !day) {
      return null;
    }

    const filePath = path.join(
      process.cwd(),
      'src',
      'content',
      'likes',
      year,
      month,
      `${day}.json`,
    );

    const fileContent = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export default async function DayPage({ params }: Props) {
  const { date } = await params;
  const content: DayJson = await getContentData(date);

  if (!content) {
    notFound();
  }

  // 表示用に日付をフォーマット
  const [year, month, day] = date.split('-');

  return (
    <div className="">
      <div className="w-full max-w-md mx-auto space-y-4 py-4 p-0 relative">
        {/* Sticky date indicator */}
        <div className="sticky top-[4.25rem] z-40 text-center mb-6">
          <h1 className="inline-flex items-center gap-2 px-4 py-1.5 backdrop-blur-md bg-gray-800/60 border border-gray-700/50 rounded-full text-sm font-medium text-gray-300 shadow-lg">
            <span className="text-gray-500">liked on</span>
            <span className="text-gray-200">{year}/{month}/{day}</span>
          </h1>
        </div>
        
        {content.body.map(
          (tweet) =>
            tweet.tweet_id && (
              <CustomTweet
                key={tweet.tweet_id}
                tweetData={tweet.react_tweet_data}
                tweetId={tweet.tweet_id}
                isPrivate={tweet.private}
                isNotFound={tweet.notfound}
              />
            ),
        )}
      </div>
    </div>
  );
}