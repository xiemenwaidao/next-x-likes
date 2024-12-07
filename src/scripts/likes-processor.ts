import { join } from 'path';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import type { DayJson, Like } from '../types/like';
import { getTweetIdFromUrl } from '../lib/tweet-helper';
import { promises as fs } from 'fs';

// function splitDateString(dateStr: string) {
//   // 入力が6桁の文字列であることを確認
//   if (dateStr.length !== 6) {
//     throw new Error('Input must be a 6-digit string');
//   }

//   // 数値として有効かチェック
//   if (!/^\d{6}$/.test(dateStr)) {
//     throw new Error('Input must contain only numbers');
//   }

//   const year = dateStr.substring(0, 4);
//   const month = dateStr.substring(4, 6);

//   return {
//     year: year,
//     month: month,
//   };
// }

export async function processAndGenerateContent() {
  try {
    // データディレクトリのパス（src/data/likes/）
    const dataDir = join(process.cwd(), 'src/assets/data/x/likes');
    // 出力先のコンテンツディレクトリ（src/content/likes/）
    const contentDir = join(process.cwd(), 'src/content/likes');

    // コンテンツディレクトリがない場合は作成
    mkdirSync(contentDir, { recursive: true });

    // 年月ごとのデータを処理
    const yearMonths = readdirSync(dataDir);
    const processedData: Record<
      string,
      {
        months: Record<
          string,
          {
            days: Record<
              string,
              {
                tweets: {
                  [key: number]: Like;
                }[];
              }
            >;
          }
        >;
      }
    > = {};

    for (const yearMonth of yearMonths) {
      const files = readdirSync(join(dataDir, yearMonth));

      // const {year, month} = splitDateString(yearMonth);
      // const json = JSON.parse(
      //   readFileSync(join(contentDir, , file), 'utf-8'),
      // );

      for (const file of files) {
        if (!file.endsWith('.json')) return;

        const data: Like = JSON.parse(
          readFileSync(join(dataDir, yearMonth, file), 'utf-8'),
        );
        const tweetId = getTweetIdFromUrl(data['tweet_url']);
        if (!tweetId) {
          console.log('tweetID not fount');
          continue;
        }
        data.tweet_id = tweetId;
        data.private = false;
        data.notfound = false;

        // 不要な情報の削除
        if (data.embed_code) {
          delete data.embed_code;
        }

        // const tweet = await getTweet(tweetId);
        // if (tweet) {
        //   data.data = tweet;
        // }

        const date = new Date(data.liked_at);
        const year = date.getFullYear().toString();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');

        // const dayJsonPath = join(contentDir, year, month, `${day}.json`);
        // const json = JSON.parse(
        //   readFileSync(join(contentDir, year, month, `${day}.json`), 'utf-8'),
        // );

        // json存在チェック
        const dayJsonPath = join(contentDir, year, month, `${day}.json`);
        try {
          // ファイル存在チェック
          await fs.access(dayJsonPath);
          const dayJson: DayJson = JSON.parse(
            readFileSync(dayJsonPath, 'utf-8'),
          );

          // jsonに同一idが存在するか否か
          if (dayJson.body.some((tweet) => tweet.tweet_id === tweetId)) {
            console.log(`ID重複:${tweetId}`);
            continue;
          }

          // 新規であればpush/sort/save
          dayJson.body.push(data);
          dayJson.body.sort(
            (a, b) =>
              new Date(b.liked_at).getTime() - new Date(a.liked_at).getTime(),
          );
          const dayContent = JSON.stringify(dayJson);
          writeFileSync(
            join(contentDir, year, month, `${day}.json`),
            dayContent,
          );

          console.log(`追記:${tweetId}`);
          continue;
        } catch {
          // ファイルが存在しない
          const dayJson: DayJson = { body: [] };
          dayJson.body.push(data);
          const dayContent = JSON.stringify(dayJson);
          mkdirSync(join(contentDir, year, month), { recursive: true });
          writeFileSync(
            join(contentDir, year, month, `${day}.json`),
            dayContent,
          );

          console.log(`新規作成:${tweetId}`);
          continue;
        }

        // データ構造を初期化
        if (!processedData[year]) {
          processedData[year] = { months: {} };
        }
        if (!processedData[year].months[month]) {
          processedData[year].months[month] = { days: {} };
        }
        if (!processedData[year].months[month].days[day]) {
          processedData[year].months[month].days[day] = { tweets: [] };
        }

        // ツイートIDを追加
        // processedData[year].months[month].days[day].tweets.push({
        //   [tweetId]: data,
        // });
        // processedData[year].months[month].days[day].tweets[tweetId] = data;
      }
    }

    // いいねした日付降順で並び替え

    // return console.log(processedData);

    // 年ごとのMarkdownファイルを生成
    // Object.entries(processedData).forEach(([year, yearData]) => {
    //   Object.entries(yearData.months).forEach(([month, monthData]) => {
    //     Object.entries(monthData.days).forEach(([day, dayData]) => {
    //       const dayContentArray: Like[] = [];

    //       Object.entries(dayData).forEach(([, tweetDataArray]) => {
    //         tweetDataArray.map((tweetData) => {
    //           Object.entries(tweetData).forEach(([, tweetDetailData]) => {
    //             dayContentArray.push(tweetDetailData);
    //           });
    //         });
    //       });

    //       dayContentArray.sort(
    //         (a, b) =>
    //           new Date(b.liked_at).getTime() - new Date(a.liked_at).getTime(),
    //       );

    //       const dayContent = JSON.stringify({ body: dayContentArray });
    //       const dayContentSaveDir = join(contentDir, year, month);
    //       mkdirSync(dayContentSaveDir, { recursive: true });
    //       writeFileSync(join(dayContentSaveDir, `${day}.json`), dayContent);
    //     });
    //   });

    //   return;

    //   const content = JSON.stringify({
    //     year: parseInt(year),
    //     data: yearData,
    //     createdAt: new Date().toISOString(),
    //   });

    //   writeFileSync(join(contentDir, `${year}.json`), content);
    // });

    console.log('Content generation completed successfully!');
  } catch (error) {
    console.error('Error generating content:', error);
    throw error;
  }
}

// メイン処理の実行
if (import.meta.url === `file://${process.argv[1]}`) {
  processAndGenerateContent()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to process content:', error);
      process.exit(1);
    });
}
