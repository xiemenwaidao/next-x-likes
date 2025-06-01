import { join } from 'path';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import type { DayJson, Like } from '../types/like';
import { getTweetIdFromUrl } from '../lib/tweet-helper';
import { promises as fs } from 'fs';
import { parseISO } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

export async function processAndGenerateContent() {
  try {
    // データディレクトリのパス（src/assets/data/x/likes/）
    const dataDir = join(process.cwd(), 'src/assets/data/x/likes');
    // 出力先のコンテンツディレクトリ（src/content/likes/）
    const contentDir = join(process.cwd(), 'src/content/likes');

    // コンテンツディレクトリがない場合は作成
    mkdirSync(contentDir, { recursive: true });

    // tweets_v2ディレクトリがあるかチェック
    const tweetsV2Dir = join(dataDir, 'tweets_v2');
    let hasNewStructure = false;
    try {
      await fs.access(tweetsV2Dir);
      hasNewStructure = true;
    } catch {
      // tweets_v2ディレクトリが存在しない
    }

    // 新構造（tweets_v2）の処理
    if (hasNewStructure) {
      console.log('Processing tweets_v2 directory...');
      const files = readdirSync(tweetsV2Dir);
      
      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const data: Like = JSON.parse(
          readFileSync(join(tweetsV2Dir, file), 'utf-8'),
        );
        
        // tweet_idは既にデータに含まれているはず
        const tweetId = data.tweet_id || getTweetIdFromUrl(data['tweet_url']);
        if (!tweetId) {
          console.log('tweetID not found');
          continue;
        }
        data.tweet_id = tweetId;
        data.private = data.private ?? false;
        data.notfound = data.notfound ?? false;

        // 不要な情報の削除
        if (data.embed_code) {
          delete data.embed_code;
        }

        const date = parseISO(data.liked_at + 'Z');
        const jpDate = toZonedTime(date, 'Asia/Tokyo');
        const year = jpDate.getFullYear().toString();
        const month = (jpDate.getMonth() + 1).toString().padStart(2, '0');
        const day = jpDate.getDate().toString().padStart(2, '0');

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
            // console.log(`ID重複:${tweetId}`);
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

          // console.log(`追記:${tweetId}`);
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

          // console.log(`新規作成:${tweetId}`);
          continue;
        }
      }
    }

    // 旧構造（年月ディレクトリ）の処理も残しておく（既存データの互換性のため）
    const yearMonths = readdirSync(dataDir).filter(
      (dir) => dir !== 'tweets_v2' && /^\d{6}$/.test(dir),
    );

    for (const yearMonth of yearMonths) {
      const files = readdirSync(join(dataDir, yearMonth));

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const data: Like = JSON.parse(
          readFileSync(join(dataDir, yearMonth, file), 'utf-8'),
        );
        const tweetId = getTweetIdFromUrl(data['tweet_url']);
        if (!tweetId) {
          console.log('tweetID not found');
          continue;
        }
        data.tweet_id = tweetId;
        data.private = false;
        data.notfound = false;

        // 不要な情報の削除
        if (data.embed_code) {
          delete data.embed_code;
        }

        const date = parseISO(data.liked_at + 'Z');
        const jpDate = toZonedTime(date, 'Asia/Tokyo');
        const year = jpDate.getFullYear().toString();
        const month = (jpDate.getMonth() + 1).toString().padStart(2, '0');
        const day = jpDate.getDate().toString().padStart(2, '0');

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
            // console.log(`ID重複:${tweetId}`);
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

          // console.log(`追記:${tweetId}`);
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

          // console.log(`新規作成:${tweetId}`);
          continue;
        }
      }
    }

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
