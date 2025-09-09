import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { promises as fs } from 'fs';
import { join, basename } from 'path';
import dotenv from 'dotenv';
import { toZonedTime, format } from 'date-fns-tz';

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
  // 日本時間の現在時刻から24時間前を取得
  const now = new Date();
  const nowJapan = toZonedTime(now, 'Asia/Tokyo');
  nowJapan.setHours(nowJapan.getHours() - 24);
  return nowJapan;
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

    // 古いファイルの削除処理
    console.log('\nChecking for old files to delete from S3...');
    const localFiles = await fs.readdir(tweetsV2Dir);
    const localFileSet = new Set(localFiles.filter(f => f.endsWith('.json')));
    
    // lastSyncTime以前のS3ファイルで、既にローカルに存在するものを削除
    const oldFiles = Contents.filter(
      (file) => new Date(file.LastModified!) <= lastSyncTime
    );
    
    let deletedCount = 0;
    for (const file of oldFiles) {
      const fileName = basename(file.Key!);
      
      // ローカルに存在するファイルのみ削除対象とする
      if (localFileSet.has(fileName)) {
        try {
          const deleteCommand = new DeleteObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: file.Key,
          });
          
          await s3Client.send(deleteCommand);
          console.log(`Deleted from S3: ${fileName}`);
          deletedCount++;
        } catch (error) {
          console.error(`Failed to delete ${fileName}:`, error);
        }
      }
    }
    
    console.log(`\nDeleted ${deletedCount} old files from S3`);

    // 最終同期日時を更新（日本時間で記録）
    try {
      const nowJapan = toZonedTime(new Date(), 'Asia/Tokyo');
      await fs.writeFile(
        join(process.cwd(), ...lastSyncSavePathList),
        format(nowJapan, "yyyy-MM-dd'T'HH:mm:ssXXX", { timeZone: 'Asia/Tokyo' }),
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
