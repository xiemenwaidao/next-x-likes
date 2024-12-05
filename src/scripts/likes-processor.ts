import { join } from 'path';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import type { Like } from '../types/like';
import { getTweetIdFromUrl } from '../lib/tweet-helper';

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

    yearMonths.forEach((yearMonth) => {
      const files = readdirSync(join(dataDir, yearMonth));

      files.forEach((file) => {
        if (!file.endsWith('.json')) return;

        const data: Like = JSON.parse(
          readFileSync(join(dataDir, yearMonth, file), 'utf-8'),
        );
        const tweetId = getTweetIdFromUrl(data['tweet_url']);
        if (!tweetId) return;
        data.tweet_id = tweetId;

        const date = new Date(data.liked_at);
        const year = date.getFullYear().toString();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');

        // 不要な情報の削除
        if (data.embed_code) {
          delete data.embed_code;
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
        processedData[year].months[month].days[day].tweets.push({
          [tweetId]: data,
        });
        // processedData[year].months[month].days[day].tweets[tweetId] = data;
      });
    });

    // いいねした日付降順で並び替え

    // return console.log(processedData);

    // 年ごとのMarkdownファイルを生成
    Object.entries(processedData).forEach(([year, yearData]) => {
      // const content = matter.stringify('', {
      //   year: parseInt(year),
      //   data: yearData,
      //   createdAt: new Date().toISOString(),
      // });

      Object.entries(yearData.months).forEach(([month, monthData]) => {
        Object.entries(monthData.days).forEach(([day, dayData]) => {
          const dayContentArray: Like[] = [];

          Object.entries(dayData).forEach(([, tweetDataArray]) => {
            tweetDataArray.map((tweetData) => {
              Object.entries(tweetData).forEach(([, tweetDetailData]) => {
                dayContentArray.push(tweetDetailData);
              });
            });
          });

          dayContentArray.sort(
            (a, b) =>
              new Date(b.liked_at).getTime() - new Date(a.liked_at).getTime(),
          );

          const dayContent = JSON.stringify({ body: dayContentArray });
          const dayContentSaveDir = join(contentDir, year, month);
          mkdirSync(dayContentSaveDir, { recursive: true });
          writeFileSync(join(dayContentSaveDir, `${day}.json`), dayContent);
        });
      });

      return;

      const content = JSON.stringify({
        year: parseInt(year),
        data: yearData,
        createdAt: new Date().toISOString(),
      });

      writeFileSync(join(contentDir, `${year}.json`), content);
    });

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
