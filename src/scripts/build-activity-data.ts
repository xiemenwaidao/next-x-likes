import fs from 'fs';
import path from 'path';
import glob from 'glob';
import { toZonedTime, format } from 'date-fns-tz';

interface ActivityData {
  date: string;
  count: number;
  dayName: string;
}

interface ActivityCache {
  activities: ActivityData[];
  lastUpdated: string;
}

async function buildActivityData() {
  console.log('Building activity data...');

  const contentDir = path.join(process.cwd(), 'src/content/likes');
  const pattern = path.join(contentDir, '**/[0-9][0-9].json');
  const files = glob.sync(pattern);

  const activityData: ActivityData[] = [];
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

  // 各ファイルを処理
  for (const file of files) {
    try {
      const relativePath = path.relative(contentDir, file);
      const pathParts = relativePath.split(path.sep);
      
      if (pathParts.length !== 3) continue;
      
      const [year, month, dayFile] = pathParts;
      const day = path.basename(dayFile, '.json');
      
      // JSONファイルを読み込み
      const fileContent = fs.readFileSync(file, 'utf-8');
      const tweetData = JSON.parse(fileContent);
      const count = Array.isArray(tweetData.body) ? tweetData.body.length : 0;
      
      // 日付オブジェクトを作成
      const dateObj = new Date(Number(year), Number(month) - 1, Number(day));
      const dayName = dayNames[dateObj.getDay()];
      
      activityData.push({
        date: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
        count,
        dayName
      });
    } catch (error) {
      console.error(`Error processing file ${file}:`, error);
    }
  }

  // 最新の7日分を取得
  const sortedActivities = activityData
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 7)
    .sort((a, b) => a.date.localeCompare(b.date));

  // アクティビティキャッシュを作成（日本時間で記録）
  const nowJapan = toZonedTime(new Date(), 'Asia/Tokyo');
  const activityCache: ActivityCache = {
    activities: sortedActivities,
    lastUpdated: format(nowJapan, "yyyy-MM-dd'T'HH:mm:ssXXX", { timeZone: 'Asia/Tokyo' })
  };

  // publicディレクトリに保存
  const outputPath = path.join(process.cwd(), 'public/activity-data.json');
  fs.writeFileSync(outputPath, JSON.stringify(activityCache, null, 2));

  console.log(`Activity data built successfully. ${sortedActivities.length} days included.`);
  console.log('Activity summary:');
  sortedActivities.forEach(activity => {
    console.log(`  ${activity.date} (${activity.dayName}): ${activity.count} tweets`);
  });
}

buildActivityData().catch(console.error);