import { DateInfo } from '@/types/like';
import { promises as fs } from 'fs';
import path from 'path';

export interface ActivityData {
  date: string;
  count: number;
  dayName: string;
}

export async function getRecentActivityData(allDates: DateInfo[]): Promise<ActivityData[]> {
  const activityData: ActivityData[] = [];
  const today = new Date();
  
  // 直近7日間のデータを取得
  for (let i = 6; i >= 0; i--) {
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() - i);
    
    const year = targetDate.getFullYear().toString();
    const month = (targetDate.getMonth() + 1).toString();
    const day = targetDate.getDate().toString();
    
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
        
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const tweets = JSON.parse(fileContent);
        count = Array.isArray(tweets) ? tweets.length : 0;
      } catch (error) {
        console.error(`Error reading file for ${year}/${month}/${day}:`, error);
      }
    }
    
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const dayName = dayNames[targetDate.getDay()];
    
    activityData.push({
      date: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
      count,
      dayName
    });
  }
  
  return activityData;
}