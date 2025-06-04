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

const getRecentActivityData = cache(async (allDates: any[]): Promise<ActivityData[]> => {
  const activityData: ActivityData[] = [];
  const today = new Date();
  
  console.log('Available dates:', allDates.slice(0, 5)); // デバッグログ
  
  // 直近7日間のデータを取得
  for (let i = 6; i >= 0; i--) {
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() - i);
    
    const year = targetDate.getFullYear().toString();
    const month = (targetDate.getMonth() + 1).toString();
    const day = targetDate.getDate().toString();
    
    console.log(`Looking for: ${year}/${month}/${day}`); // デバッグログ
    
    // 該当する日付のデータを検索
    const dateInfo = allDates.find(d => 
      d.year === year && 
      d.month === month && 
      d.day === day
    );
    
    let count = 0;
    if (dateInfo) {
      try {
        const filePath = path.join(
          process.cwd(),
          'src/content/likes',
          dateInfo.year,
          dateInfo.month.padStart(2, '0'),
          `${dateInfo.day.padStart(2, '0')}.json`
        );
        
        console.log(`Reading file: ${filePath}`); // デバッグログ
        
        const fileContent = await readFile(filePath, 'utf-8');
        const tweets = JSON.parse(fileContent);
        count = Array.isArray(tweets) ? tweets.length : 0;
        
        console.log(`Found ${count} tweets for ${year}/${month}/${day}`); // デバッグログ
      } catch (error) {
        console.error(`Error reading file for ${year}/${month}/${day}:`, error);
      }
    } else {
      console.log(`No data found for ${year}/${month}/${day}`); // デバッグログ
    }
    
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const dayName = dayNames[targetDate.getDay()];
    
    activityData.push({
      date: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
      count,
      dayName
    });
  }
  
  console.log('Final activity data:', activityData); // デバッグログ
  
  return activityData;
});

export default async function Home() {
  const allDates = await getAllDates();
  const activityData = await getRecentActivityData(allDates);

  return (
    <div className="flex items-center justify-center py-8">
      <RecentActivityGraph activityData={activityData} />
    </div>
  );
}
