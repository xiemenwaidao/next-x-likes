export const dynamic = 'force-static';
export const revalidate = false;

import { CustomTweet } from '@/components/custom-tweet';
import { Like, DayJson } from '@/types/like';
import { promises as fs } from 'fs';
import path from 'path';
import { notFound } from 'next/navigation';
import Link from 'next/link';

type Props = {
  params: Promise<{
    id: string;
  }>;
};

interface TweetIndexEntry {
  id: string;
  filePath: string;
  year: string;
  month: string;
  day: string;
  likedAt: string;
}

interface TweetIndex {
  [tweetId: string]: TweetIndexEntry;
}

// Generate static paths from tweet index
export async function generateStaticParams() {
  try {
    const indexPath = path.join(
      process.cwd(),
      'src',
      'content',
      'tweet-index.json',
    );
    const indexContent = await fs.readFile(indexPath, 'utf-8');
    const index: TweetIndex = JSON.parse(indexContent);

    return Object.keys(index).map((id) => ({
      id,
    }));
  } catch (error) {
    console.error('Error reading tweet index:', error);
    return [];
  }
}

async function getTweetData(tweetId: string): Promise<Like | null> {
  try {
    // Read tweet index
    const indexPath = path.join(
      process.cwd(),
      'src',
      'content',
      'tweet-index.json',
    );
    const indexContent = await fs.readFile(indexPath, 'utf-8');
    const index: TweetIndex = JSON.parse(indexContent);

    const indexEntry = index[tweetId];
    if (!indexEntry) {
      return null;
    }

    // Read the day file containing the tweet
    const dayFilePath = path.join(
      process.cwd(),
      'src',
      'content',
      indexEntry.filePath,
    );
    const dayContent = await fs.readFile(dayFilePath, 'utf-8');
    const dayData: DayJson = JSON.parse(dayContent);

    // Find the specific tweet in the day's data
    const tweet = dayData.body.find((t) => t.tweet_id === tweetId);

    return tweet || null;
  } catch (error) {
    console.error('Error getting tweet data:', error);
    return null;
  }
}

export default async function TweetPage({ params }: Props) {
  const { id } = await Promise.resolve(params);

  const tweetData = await getTweetData(id);

  if (!tweetData) {
    notFound();
  }

  // Get date from tweet index
  const indexPath = path.join(
    process.cwd(),
    'src',
    'content',
    'tweet-index.json',
  );
  const indexContent = await fs.readFile(indexPath, 'utf-8');
  const index: TweetIndex = JSON.parse(indexContent);
  const indexEntry = index[id];

  const year = indexEntry?.year || '????';
  const month = indexEntry?.month || '??';
  const day = indexEntry?.day || '??';

  return (
    <div className="">
      <div className="w-full max-w-md mx-auto space-y-4 py-4 p-0 relative">
        <h1 className="text-center sticky top-6 z-50 mix-blend-overlay italic w-fit mx-auto">
          liked on: {year}/{month}/{day}
        </h1>
        <div className="text-center absolute -top-0 left-0 right-0 italic w-fit mx-auto mt-0">
          liked on: {year}/{month}/{day}
        </div>

        {tweetData.react_tweet_data ? (
          <CustomTweet
            tweetData={tweetData.react_tweet_data}
            tweetId={tweetData.tweet_id || id}
            isPrivate={tweetData.private || false}
            isNotFound={tweetData.notfound || false}
          />
        ) : (
          <div className="border rounded-lg p-4 space-y-2">
            <p className="text-sm text-gray-500">Tweet ID: {id}</p>
            <p>{tweetData.text}</p>
            <p className="text-sm text-gray-500">@{tweetData.username}</p>
            <p className="text-sm text-gray-500">
              Liked at: {tweetData.liked_at}
            </p>
            <a
              href={tweetData.tweet_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline text-sm"
            >
              View on X
            </a>
          </div>
        )}

        <div className="text-center mt-8">
          <Link
            href={`/${year}/${month}/${day}`}
            className="text-blue-500 hover:underline"
          >
            View all tweets from {year}/{month}/{day}
          </Link>
        </div>
      </div>
    </div>
  );
}
