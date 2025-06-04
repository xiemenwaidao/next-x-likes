import { RecentActivityGraph } from '@/components/recent-activity-graph';
import { getRecentActivityData } from '@/lib/activity-helper';
import path from 'path';
import { readdir } from 'fs/promises';
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

export default async function Home() {
  const allDates = await getAllDates();
  const activityData = await getRecentActivityData(allDates);

  return (
    <div className="flex items-center justify-center py-8">
      <RecentActivityGraph activityData={activityData} />
    </div>
  );
}
