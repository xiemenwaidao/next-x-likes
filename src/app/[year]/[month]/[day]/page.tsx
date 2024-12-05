import { promises as fs } from 'fs';
import path from 'path';
import { Tweet } from 'react-tweet';

type Props = {
  params: Promise<{
    year: string;
    month: string;
    day: string;
  }>;
};

interface Like {
  text: string;
  username: string;
  tweet_url: string;
  first_link: string;
  created_at: string;
  embed_code?: string;
  liked_at: string;
  source: 'ifttt';
  tweet_id?: string;
}

interface DayJson {
  body: Like[];
}

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
            tweet.tweet_id && (
              <Tweet id={tweet.tweet_id} key={tweet.tweet_id} />
            ),
        )}
      </div>
    </div>
  );
}
