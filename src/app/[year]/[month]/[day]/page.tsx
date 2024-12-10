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
      return null;
    }
    throw error;
  }
}

export default async function DayPage({ params }: Props) {
  const { year, month, day } = await Promise.resolve(params);

  const content: DayJson = await getContentData(year, month, day);
  // if (!content) {
  //   return notFound();
  // }

  return (
    <div className="">
      <div className="w-full max-w-md mx-auto space-y-4 py-4 p-0 relative">
        {/* mix-blend-overlay text-yellow-300 */}
        <h1 className="text-center sticky top-6 z-50 mix-blend-overlay italic w-fit mx-auto">
          liked on: {year}/{month}/{day}
        </h1>
        <div className="text-center absolute -top-0 left-0 right-0 italic w-fit mx-auto mt-0">
          liked on: {year}/{month}/{day}
        </div>
        {content?.body.map(
          (tweet) =>
            tweet.tweet_id &&
            (tweet.private || tweet.notfound ? (
              <TweetNotFound key={tweet.tweet_id} />
            ) : (
              <Suspense key={tweet.tweet_id} fallback={<TweetSkeleton />}>
                {tweet.react_tweet_data ? (
                  <EmbeddedTweet
                    tweet={tweet.react_tweet_data}
                    key={tweet.tweet_id}
                  />
                ) : (
                  <Tweet id={tweet.tweet_id} key={tweet.tweet_id} />
                )}
              </Suspense>
            )),
        )}

        {content === null && (
          <div className="text-center italic text-lg underline underline-offset-8">
            Not Found : (ง ˙ω˙)ว{' '}
          </div>
        )}
      </div>
    </div>
  );
}
