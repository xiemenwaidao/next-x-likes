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

// bucket名/tweets/202411
const s3bucketMainDir = 'tweets';

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

/**
 * DateからYYYYMM形式の文字列を生成
 */
const createYearMonthString = (date: Date) => {
  return date.toISOString().slice(0, 4) + date.toISOString().slice(5, 7);
};

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
    return getNowDate();
  }
}
/**
 *
 * @param {Date} startDate
 */
function getYearMonthsBetween(startDate: Date) {
  const results: string[] = [];
  const currentDate = new Date();
  const workingDate = new Date(startDate);

  // 開始日を月初めに設定
  workingDate.setDate(1);

  const currentYM = createYearMonthString(currentDate);

  while (true) {
    const workingYM = createYearMonthString(workingDate);
    results.push(workingYM);

    // 同じであればループを抜ける
    if (workingYM === currentYM) {
      break;
    }

    // 次の月へ
    workingDate.setMonth(workingDate.getMonth() + 1);
  }

  return results;
}

async function downloadNewFiles() {
  const lastSyncTime = await getLastSyncTime();

  // 現在の年月までのフォルダを対象とする
  const prefixList = getYearMonthsBetween(lastSyncTime);

  // return console.log(prefixList);

  for (const prefix of prefixList) {
    try {
      console.log(`Checking for files in prefix: ${prefix}`);
      console.log(`Looking for files modified after: ${lastSyncTime}`);

      const listCommand = new ListObjectsV2Command({
        Bucket: process.env.AWS_BUCKET_NAME,
        Prefix: `${s3bucketMainDir}/${prefix}`,
      });

      const { Contents = [] } = await s3Client.send(listCommand);

      console.log(`Found ${Contents.length} total files`);

      const newFiles = Contents.filter(
        (file) => new Date(file.LastModified!) > lastSyncTime,
      );

      console.log(`Found ${newFiles.length} new files to download`);

      if (newFiles.length === 0) continue;

      // ベースとなるデータディレクトリを作成
      const baseDir = join(process.cwd(), ...SaveJsonBaseDirPathList);
      await fs.mkdir(baseDir, { recursive: true });

      // 年月ディレクトリを作成
      const yearMonthDir = join(baseDir, prefix);
      await fs.mkdir(yearMonthDir, { recursive: true });

      // カウンター
      let downloadedCount = 0;
      let skippedCount = 0;

      for (const file of newFiles) {
        const fileName = basename(file.Key!);
        const filePath = join(yearMonthDir, fileName);

        // ファイルの存在チェック
        try {
          await fs.access(filePath);
          console.log(`Skipped: ${prefix}/${fileName} (File already exists)`);
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
            `Downloaded: ${prefix}/${fileName} (Modified: ${file.LastModified})`,
          );

          downloadedCount++;
        }
      }

      // 処理結果のサマリーを表示
      console.log('\nDownload Summary:');
      console.log(`Total files processed: ${newFiles.length}`);
      console.log(`Downloaded: ${downloadedCount}`);
      console.log(`Skipped: ${skippedCount}`);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }

    try {
      await fs.writeFile(
        join(process.cwd(), ...lastSyncSavePathList),
        new Date().toISOString(),
      );
    } catch (error) {
      console.error('Error updating last sync time:', error);
      process.exit(1);
    }
  }
}

// メインスクリプトの実行チェックを修正
downloadNewFiles();
