import fs from 'fs';
import path from 'path';
import glob from 'glob';
import { Like } from '@/types/like';

interface SearchIndexItem {
  id: string;
  text: string;
  username: string;
  date: string;
  path: string;
}

async function buildSearchIndex() {
  console.log('Building search index...');

  const contentDir = path.join(process.cwd(), 'src/content/likes');
  const pattern = path.join(contentDir, '**/[0-9][0-9].json');
  const files = glob.sync(pattern);

  const searchIndex: SearchIndexItem[] = [];
  const tweetIndex = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), 'src/content/tweet-index.json'),
      'utf-8',
    ),
  );

  for (const file of files) {
    // const relativePath = path.relative(contentDir, file);
    const content = JSON.parse(fs.readFileSync(file, 'utf-8'));

    if (content.body && Array.isArray(content.body)) {
      for (const like of content.body as Like[]) {
        if (like.tweet_id && !like.private && !like.notfound) {
          const tweetInfo = tweetIndex[like.tweet_id];
          const date = tweetInfo
            ? `${tweetInfo.year}/${tweetInfo.month}/${tweetInfo.day}`
            : '';

          searchIndex.push({
            id: like.tweet_id,
            text: like.text || '',
            username: like.username || '',
            date,
            path: `/tweet/${like.tweet_id}`,
          });
        }
      }
    }
  }

  // 重複を削除
  const uniqueIndex = Array.from(
    new Map(searchIndex.map((item) => [item.id, item])).values(),
  );

  // 日付でソート（新しい順）
  uniqueIndex.sort((a, b) => b.date.localeCompare(a.date));

  const outputPath = path.join(process.cwd(), 'public/search-index.json');
  fs.writeFileSync(outputPath, JSON.stringify(uniqueIndex, null, 2));

  console.log(`Search index built with ${uniqueIndex.length} tweets`);
}

buildSearchIndex().catch(console.error);
