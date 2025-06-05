import { RecentActivityGraph } from '@/components/recent-activity-graph';
import { ActivityData } from '@/lib/activity-helper';
import path from 'path';
import { readdir, readFile } from 'fs/promises';
import { cache } from 'react';

const getAllDates = cache(async () => {
  const contentPath = path.join(process.cwd(), 'src/content/likes');
  const years = await readdir(contentPath);
  const dates = [];

  for (const year of years) {
    const monthsPath = path.join(contentPath, year);
    const months = await readdir(monthsPath);

    for (const month of months) {
      const daysPath = path.join(monthsPath, month);
      const days = await readdir(daysPath);

      for (const day of days) {
        if (day.endsWith('.json')) {
          dates.push({
            year,
            month: month.replace(/^0/, ''),
            day: day.replace('.json', '').replace(/^0/, ''),
          });
        }
      }
    }
  }

  return dates;
});


const getRecentActivityData = cache(async (): Promise<ActivityData[]> => {
  try {
    // 本番環境では静的に生成されたactivity-data.jsonを使用
    const activityFilePath = path.join(process.cwd(), 'public/activity-data.json');
    
    if (await readFile(activityFilePath, 'utf-8').then(() => true).catch(() => false)) {
      const activityCache = JSON.parse(await readFile(activityFilePath, 'utf-8'));
      return activityCache.activities || [];
    }
  } catch {
    console.log('Static activity data not found, generating dynamically...');
  }

  // フォールバック: 動的にデータを生成（開発環境など）
  const allDates = await getAllDates();
  const activityData: ActivityData[] = [];
  
  // 利用可能な日付から最新の7日分を取得
  const sortedDates = allDates
    .map(d => ({
      ...d,
      dateObj: new Date(Number(d.year), Number(d.month) - 1, Number(d.day))
    }))
    .sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime())
    .slice(0, 7);
  
  for (const dateInfo of sortedDates) {
    try {
      const filePath = path.join(
        process.cwd(),
        'src/content/likes',
        dateInfo.year,
        dateInfo.month.padStart(2, '0'),
        `${dateInfo.day.padStart(2, '0')}.json`
      );
      
      const fileContent = await readFile(filePath, 'utf-8');
      const tweets = JSON.parse(fileContent);
      const count = Array.isArray(tweets.body) ? tweets.body.length : 0;
      
      const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
      const dayName = dayNames[dateInfo.dateObj.getDay()];
      
      activityData.push({
        date: `${dateInfo.year}-${dateInfo.month.padStart(2, '0')}-${dateInfo.day.padStart(2, '0')}`,
        count,
        dayName
      });
    } catch (error) {
      console.error(`Error reading file for ${dateInfo.year}/${dateInfo.month}/${dateInfo.day}:`, error);
    }
  }
  
  // 日付順にソート（古い順）
  return activityData.sort((a, b) => a.date.localeCompare(b.date));
});

export default async function Home() {
  const activityData = await getRecentActivityData();

  return (
    <div className="flex flex-col items-center justify-center py-8">
      {/* グラフセクション */}
      <div className="w-full">
        <RecentActivityGraph activityData={activityData} />
      </div>
    </div>
  );
}
