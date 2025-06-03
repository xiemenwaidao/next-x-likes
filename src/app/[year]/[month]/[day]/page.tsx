export const dynamic = 'force-static';
export const revalidate = false;

import { CustomTweet } from '@/components/custom-tweet';
import { DayJson } from '@/types/like';
import { promises as fs } from 'fs';
import path from 'path';

type Props = {
  params: Promise<{
    year: string;
    month: string;
    day: string;
  }>;
};

// export const dynamic = 'force-static';
// export const revalidate = false;

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
        {/* Sticky date indicator */}
        <div className="sticky top-[4.25rem] z-40 text-center mb-6">
          <h1 className="inline-flex items-center gap-2 px-4 py-1.5 backdrop-blur-md bg-gray-800/60 border border-gray-700/50 rounded-full text-sm font-medium text-gray-300 shadow-lg">
            <span className="text-gray-500">liked on</span>
            <span className="text-gray-200">{year}/{month}/{day}</span>
          </h1>
        </div>
        {content?.body.map(
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

        {content === null && (
          <div className="text-center italic text-lg underline underline-offset-8">
            Not Found : (ง ˙ω˙)ว{' '}
          </div>
        )}
      </div>
    </div>
  );
}
