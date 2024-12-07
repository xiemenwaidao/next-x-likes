import { DayJson } from '@/types/like';
import { promises as fs } from 'fs';
import path from 'path';
import { Suspense } from 'react';
import {
  EmbeddedTweet,
  Tweet,
  TweetNotFound,
  TweetSkeleton,
} from 'react-tweet';

type Props = {
  params: Promise<{
    year: string;
    month: string;
    day: string;
  }>;
};

// 静的パスを生成する関数
export async function generateStaticParams() {
  const contentDir = path.join(process.cwd(), 'src', 'content', 'likes');
  const years = await fs.readdir(contentDir);

  const paths = [];

  for (const year of years) {
    const yearPath = path.join(contentDir, year);
    const months = await fs.readdir(yearPath);

    for (const month of months) {
      const monthPath = path.join(yearPath, month);
      const days = await fs.readdir(monthPath);

      for (const day of days) {
        paths.push({
          year,
          month,
          day: day.replace('.json', ''),
        });
      }
    }
  }

  return paths;
}

async function getContentData(year: string, month: string, day: string) {
  try {
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
      throw new Error(`Content not found for ${year}/${month}/${day}`);
    }
    throw error;
  }
}

export default async function DayPage({ params }: Props) {
  const { year, month, day } = await Promise.resolve(params);

  const content: DayJson = await getContentData(year, month, day);
  if (!content) {
    return <div>No Data (ง ˙ω˙)ว</div>;
  }

  return (
    <div className="pt-8">
      <div className="w-full max-w-md mx-auto space-y-4 p-0">
        <h1 className="text-center">
          liked on: {year}/{month}/{day}
        </h1>
        {content.body.map(
          (tweet) =>
            tweet.tweet_id &&
            (tweet.private || tweet.notfound ? (
              <TweetNotFound />
            ) : (
              <Suspense key={tweet.tweet_id} fallback={<TweetSkeleton />}>
                {tweet.react_tweet_data ? (
                  <EmbeddedTweet tweet={tweet.react_tweet_data} />
                ) : (
                  <Tweet id={tweet.tweet_id} />
                )}
              </Suspense>
            )),
        )}
      </div>
    </div>
  );
}

// async function TweetComponent({ id }: { id: string }) {
//   try {
//     const tweet = await getTweet(id);
//     return tweet ? <EmbeddedTweet tweet={tweet} /> : <TweetNotFound />;
//   } catch (error) {
//     console.error('Error rendering tweet:', error);
//     return <TweetNotFound error={error as Error} />;
//   }
// }
