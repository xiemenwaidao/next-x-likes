export const dynamic = 'force-static';
export const revalidate = false;

import path from 'path';
import { readdir, readFile } from 'fs/promises';
import { cache } from 'react';
import { toZonedTime, format } from 'date-fns-tz';
import { ActivityData } from '@/lib/activity-helper';
import { getDb } from '@/lib/db';
import { HomeTabs } from '@/components/home-tabs';
import type { DateInfo } from '@/types/like';

const getAllDates = cache(async (): Promise<DateInfo[]> => {
  const contentPath = path.join(process.cwd(), 'src/content/likes');
  const years = await readdir(contentPath);
  const dates: DateInfo[] = [];

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
    const activityFilePath = path.join(process.cwd(), 'public/activity-data.json');
    if (
      await readFile(activityFilePath, 'utf-8')
        .then(() => true)
        .catch(() => false)
    ) {
      const activityCache = JSON.parse(await readFile(activityFilePath, 'utf-8'));
      return activityCache.activities || [];
    }
  } catch {
    console.log('Static activity data not found, generating dynamically...');
  }

  const allDates = await getAllDates();
  const activityData: ActivityData[] = [];

  const nowJapan = toZonedTime(new Date(), 'Asia/Tokyo');
  const todayJapan = format(nowJapan, 'yyyy-MM-dd', { timeZone: 'Asia/Tokyo' });

  const sortedDates = allDates
    .map((d) => ({
      ...d,
      dateObj: new Date(Number(d.year), Number(d.month) - 1, Number(d.day)),
      dateString: `${d.year}-${d.month.padStart(2, '0')}-${d.day.padStart(2, '0')}`,
    }))
    .filter((d) => d.dateString < todayJapan)
    .sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime())
    .slice(0, 7);

  for (const dateInfo of sortedDates) {
    try {
      const filePath = path.join(
        process.cwd(),
        'src/content/likes',
        dateInfo.year,
        dateInfo.month.padStart(2, '0'),
        `${dateInfo.day.padStart(2, '0')}.json`,
      );

      const fileContent = await readFile(filePath, 'utf-8');
      const tweets = JSON.parse(fileContent);
      const count = Array.isArray(tweets.body) ? tweets.body.length : 0;

      const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
      const dayName = dayNames[dateInfo.dateObj.getDay()];

      activityData.push({
        date: dateInfo.dateString,
        count,
        dayName,
      });
    } catch (error) {
      console.error(`Error reading file for ${dateInfo.year}/${dateInfo.month}/${dateInfo.day}:`, error);
    }
  }

  return activityData.sort((a, b) => a.date.localeCompare(b.date));
});

const getCategoryCounts = cache(
  async (): Promise<{
    counts: { name: string; count: number }[];
    total: number;
  }> => {
    const db = getDb();
    const res = await db.execute(
      `SELECT parent_category AS name, COUNT(*) AS n
       FROM likes
       WHERE private = 0 AND notfound = 0 AND parent_category IS NOT NULL
       GROUP BY parent_category`,
    );
    const counts = res.rows.map((r) => ({
      name: String(r.name),
      count: Number(r.n ?? 0),
    }));
    const totalRes = await db.execute(
      `SELECT COUNT(*) AS n FROM likes WHERE private = 0 AND notfound = 0`,
    );
    const total = Number(totalRes.rows[0]?.n ?? 0);
    return { counts, total };
  },
);

export default async function Home() {
  const [allDates, activityData, categoryData] = await Promise.all([
    getAllDates(),
    getRecentActivityData(),
    getCategoryCounts(),
  ]);

  return (
    <HomeTabs
      allDates={allDates}
      activityData={activityData}
      categoryCounts={categoryData.counts}
      totalCount={categoryData.total}
    />
  );
}
