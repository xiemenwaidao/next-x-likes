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

interface DateInfo {
  year: string;
  month: string;
  day: string;
}

const getRecentActivityData = cache(async (allDates: DateInfo[]): Promise<ActivityData[]> => {
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
      const count = Array.isArray(tweets) ? tweets.length : 0;
      
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
  const allDates = await getAllDates();
  const activityData = await getRecentActivityData(allDates);

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <RecentActivityGraph activityData={activityData} />
    </div>
  );
}
