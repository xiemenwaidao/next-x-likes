import { DayJson, Like } from '@/types/like';
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fetchTweet } from 'react-tweet/api';

export async function insertTweetDataToJson() {
  const dirPath = 'src/content/likes/';

  const years = readdirSync(dirPath);

  for (const year of years) {
    const yearDirPath = join(dirPath, year);
    const months = readdirSync(yearDirPath);

    for (const month of months) {
      const monthDirPath = join(yearDirPath, month);
      const dayFiles = readdirSync(monthDirPath);

      for (const dayFile of dayFiles) {
        if (!dayFile.endsWith('.json')) return;

        const dayJsonPath = join(monthDirPath, dayFile);
        const json: DayJson = JSON.parse(readFileSync(dayJsonPath, 'utf-8'));

        const likes = json.body;

        const newLikeList: Like[] = [];

        for (const like of likes) {
          if (like.react_tweet_data) {
            newLikeList.push(like);
            console.log(`skip:${like.tweet_id}`);
            continue;
          }

          if (!like.tweet_id) {
            newLikeList.push(like);
            console.log(`tweet_id not found:${like.tweet_id}`);
            continue;
          }

          const { data, tombstone, notFound } = await fetchTweet(like.tweet_id);
          like.react_tweet_data = data;
          like.private = tombstone ? true : false;
          like.notfound = notFound ? true : false;
          newLikeList.push(like);
        }

        // sort
        newLikeList.sort(
          (a, b) =>
            new Date(b.liked_at).getTime() - new Date(a.liked_at).getTime(),
        );
        const dayContent = JSON.stringify({ body: newLikeList });
        writeFileSync(dayJsonPath, dayContent);

        // return console.log(dayJsonPath);
      }
    }
  }
}

insertTweetDataToJson();
