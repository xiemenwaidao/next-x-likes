import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { promises as fs } from 'fs';
import { join, basename } from 'path';
import dotenv from 'dotenv';

// .envファイルを読み込む
dotenv.config();

// 環境変数の確認
console.log('Checking environment variables:');
console.log('AWS_REGION:', process.env.AWS_REGION ? 'Set' : 'Not set');
console.log(
  'AWS_BUCKET_NAME:',
  process.env.AWS_BUCKET_NAME ? 'Set' : 'Not set',
);
console.log(
  'AWS_ACCESS_KEY_ID:',
  process.env.AWS_ACCESS_KEY_ID ? 'Set' : 'Not set',
);
console.log(
  'AWS_SECRET_ACCESS_KEY:',
  process.env.AWS_SECRET_ACCESS_KEY ? 'Set' : 'Not set',
);

// 必要な環境変数が設定されているか確認
if (
  !process.env.AWS_REGION ||
  !process.env.AWS_BUCKET_NAME ||
  !process.env.AWS_ACCESS_KEY_ID ||
  !process.env.AWS_SECRET_ACCESS_KEY
) {
  console.error('Required environment variables are not set');
  process.exit(1);
}

// 最終取得日時ファイルの保存先
const lastSyncSavePathList = ['src', 'scripts', 'last-sync.txt'];
// jsonの保存先ディレクトリ
const SaveJsonBaseDirPathList = ['src', 'assets', 'data', 'x', 'likes'];

// bucket名/tweets_v2
const s3bucketMainDir = 'tweets_v2';

// S3 接続情報設定
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const getNowDate = () => {
  // return new Date('2024-01-01T00:00:00Z'); // 仮
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
};

// tweet-index.jsonを読み込んで、既にいいねしたツイートのIDを取得
async function getExistingTweetIds(): Promise<Set<string>> {
  const indexPath = join(process.cwd(), 'src', 'content', 'tweet-index.json');
  try {
    const data = await fs.readFile(indexPath, 'utf8');
    const index = JSON.parse(data);
    return new Set(Object.keys(index));
  } catch {
    console.log('tweet-index.json not found, treating as empty');
    return new Set();
  }
}

// 既存のtweets_v2ファイルからツイートIDを取得
async function getExistingRawTweetIds(): Promise<Set<string>> {
  const tweetsV2Dir = join(process.cwd(), ...SaveJsonBaseDirPathList, 'tweets_v2');
  const existingIds = new Set<string>();
  
  try {
    const files = await fs.readdir(tweetsV2Dir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        // ファイル名がツイートIDになっている
        const tweetId = file.replace('.json', '');
        existingIds.add(tweetId);
      }
    }
  } catch {
    console.log('tweets_v2 directory not found, treating as empty');
  }
  
  return existingIds;
}

async function getLastSyncTime() {
  const syncFilePath = join(process.cwd(), ...lastSyncSavePathList);
  try {
    const data = await fs.readFile(syncFilePath, 'utf8');
    const trimmedDate = data.trim();
    const parsedDate = new Date(trimmedDate);

    // 日付が無効な場合（Invalid Date）のチェック
    if (isNaN(parsedDate.getTime())) {
      console.warn('Invalid date found in sync file. Using default time.');
      return getNowDate();
    }

    return parsedDate;
  } catch {
    console.log('最終更新日時保存ファイルの読み取り失敗');
    return getNowDate();
  }
}

async function downloadNewFiles() {
  const lastSyncTime = await getLastSyncTime();
  console.log(`lastSyncTime:${lastSyncTime.toISOString()}`);

  // 既存のツイートIDを取得
  console.log('Loading existing tweet data...');
  const existingTweetIds = await getExistingTweetIds();
  const existingRawTweetIds = await getExistingRawTweetIds();
  console.log(`Found ${existingTweetIds.size} tweets in index, ${existingRawTweetIds.size} in raw files`);

  try {
    console.log(`Checking for files in: ${s3bucketMainDir}`);
    console.log(`Looking for files modified after: ${lastSyncTime}`);

    // tweets_v2ディレクトリ全体をリストアップ
    const listCommand = new ListObjectsV2Command({
      Bucket: process.env.AWS_BUCKET_NAME,
      Prefix: s3bucketMainDir,
    });

    const { Contents = [] } = await s3Client.send(listCommand);

    console.log(`Found ${Contents.length} total files`);

    // 最終同期日時より新しいファイルをフィルタリング
    const newFiles = Contents.filter(
      (file) => new Date(file.LastModified!) > lastSyncTime,
    );

    console.log(`Found ${newFiles.length} new files to download`);

    if (newFiles.length === 0) {
      console.log('No new files to download');
      return;
    }

    // ベースとなるデータディレクトリを作成
    const baseDir = join(process.cwd(), ...SaveJsonBaseDirPathList);
    await fs.mkdir(baseDir, { recursive: true });

    // tweets_v2ディレクトリを作成
    const tweetsV2Dir = join(baseDir, 'tweets_v2');
    await fs.mkdir(tweetsV2Dir, { recursive: true });

    // カウンター
    let downloadedCount = 0;
    let skippedCount = 0;
    let duplicateCount = 0;

    for (const file of newFiles) {
      const fileName = basename(file.Key!);
      const filePath = join(tweetsV2Dir, fileName);
      
      // ファイル名からツイートIDを抽出（.json拡張子を除去）
      const tweetId = fileName.replace('.json', '');

      // 既にいいねしたツイートかチェック
      if (existingTweetIds.has(tweetId) || existingRawTweetIds.has(tweetId)) {
        console.log(`Skipped: ${fileName} (Already liked tweet)`);
        duplicateCount++;
        continue;
      }

      // ファイルの存在チェック（念のため）
      try {
        await fs.access(filePath);
        console.log(`Skipped: ${fileName} (File already exists)`);
        skippedCount++;
        continue; // 既存のファイルはスキップ
      } catch {
        // ファイルが存在しない場合は処理を続行
      }

      const getCommand = new GetObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: file.Key,
      });

      const response = await s3Client.send(getCommand);
      const content = await response.Body?.transformToString();

      if (content) {
        await fs.writeFile(filePath, content);

        console.log(
          `Downloaded: ${fileName} (Modified: ${file.LastModified})`,
        );

        downloadedCount++;
      }
    }

    // 処理結果のサマリーを表示
    console.log('\nDownload Summary:');
    console.log(`Total files processed: ${newFiles.length}`);
    console.log(`Downloaded: ${downloadedCount}`);
    console.log(`Skipped (file exists): ${skippedCount}`);
    console.log(`Skipped (already liked): ${duplicateCount}`);

    // 最終同期日時を更新
    try {
      await fs.writeFile(
        join(process.cwd(), ...lastSyncSavePathList),
        new Date().toISOString(),
      );
    } catch (error) {
      console.error('Error updating last sync time:', error);
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// メインスクリプトの実行チェックを修正
downloadNewFiles();
