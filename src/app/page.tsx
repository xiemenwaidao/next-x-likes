export const dynamic = 'force-static';
export const revalidate = false;

import path from 'path';
import { readdir, readFile } from 'fs/promises';
import { cache } from 'react';
import { getDb } from '@/lib/db';
import { HomeTabs } from '@/components/home-tabs';
import type { GardenData, MonthStats } from '@/components/garden-top-banner';
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

export type HomeInsightsData = {
  /** 直近 30 日のいいね件数 */
  last30: number;
  /** その前の 30 日 (= 31〜60 日前) のいいね件数。前月比 delta 計算用 */
  prev30: number;
  /** 直近 30 日に新規分類されたカテゴリ Top 3 (件数で並べる) */
  hotCategories: { name: string; count: number }[];
  /** 直近 30 日に最もよくいいねしたユーザー Top 5 */
  topUsers: { username: string; count: number }[];
  /** 直近 6 ヶ月の月別件数 (古い順) */
  monthly: { ym: string; count: number }[];
};

const getHomeInsights = cache(async (): Promise<HomeInsightsData> => {
  const db = getDb();

  // 直近 30 日と前 30 日 (件数の delta 用)
  const [last30Res, prev30Res] = await Promise.all([
    db.execute(
      `SELECT COUNT(*) AS n FROM likes
       WHERE private = 0 AND notfound = 0
         AND liked_at >= datetime('now', '-30 days')`,
    ),
    db.execute(
      `SELECT COUNT(*) AS n FROM likes
       WHERE private = 0 AND notfound = 0
         AND liked_at >= datetime('now', '-60 days')
         AND liked_at <  datetime('now', '-30 days')`,
    ),
  ]);
  const last30 = Number(last30Res.rows[0]?.n ?? 0);
  const prev30 = Number(prev30Res.rows[0]?.n ?? 0);

  // 直近 30 日の hot カテゴリ Top 3
  const hotRes = await db.execute(
    `SELECT parent_category AS name, COUNT(*) AS n
     FROM likes
     WHERE private = 0 AND notfound = 0
       AND parent_category IS NOT NULL
       AND liked_at >= datetime('now', '-30 days')
     GROUP BY parent_category
     ORDER BY n DESC
     LIMIT 3`,
  );
  const hotCategories = hotRes.rows.map((r) => ({
    name: String(r.name),
    count: Number(r.n ?? 0),
  }));

  // 直近 30 日の頻度上位ユーザー Top 5
  const usersRes = await db.execute(
    `SELECT username, COUNT(*) AS n
     FROM likes
     WHERE private = 0 AND notfound = 0
       AND username != ''
       AND liked_at >= datetime('now', '-30 days')
     GROUP BY username
     ORDER BY n DESC
     LIMIT 5`,
  );
  const topUsers = usersRes.rows.map((r) => ({
    username: String(r.username ?? ''),
    count: Number(r.n ?? 0),
  }));

  // 直近 6 ヶ月の月別 (古い順)
  const monthlyRes = await db.execute(
    `SELECT strftime('%Y-%m', liked_at) AS ym, COUNT(*) AS n
     FROM likes
     WHERE private = 0 AND notfound = 0
       AND liked_at >= datetime('now', '-6 months')
     GROUP BY ym
     ORDER BY ym ASC`,
  );
  const monthly = monthlyRes.rows.map((r) => ({
    ym: String(r.ym ?? ''),
    count: Number(r.n ?? 0),
  }));

  return { last30, prev30, hotCategories, topUsers, monthly };
});

// 「讚の庭」バナー用の月別 stats。Actions が public/garden-stats.json を毎日更新する。
// 無い / 壊れている場合は穏当なフォールバックで描画（ビルドは落とさない）。
const getGardenData = cache(async (): Promise<GardenData> => {
  const now = new Date();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const fallback: GardenData = {
    current,
    months: {
      [current]: {
        elapsedDays: now.getDate(),
        totalLikes: 0,
        categoryWeights: new Array(11).fill(0),
      },
    },
  };
  try {
    const file = path.join(process.cwd(), 'public', 'garden-stats.json');
    const parsed = JSON.parse(await readFile(file, 'utf-8'));
    if (!parsed.months || typeof parsed.months !== 'object') return fallback;
    const months: Record<string, MonthStats> = {};
    for (const [ym, raw] of Object.entries<Record<string, unknown>>(
      parsed.months,
    )) {
      months[ym] = {
        elapsedDays: Number(raw.elapsedDays) || 1,
        totalLikes: Number(raw.totalLikes) || 0,
        categoryWeights: Array.isArray(raw.categoryWeights)
          ? raw.categoryWeights.map(Number)
          : new Array(11).fill(0),
      };
    }
    return {
      current: typeof parsed.current === 'string' ? parsed.current : current,
      months,
    };
  } catch {
    return fallback;
  }
});

export default async function Home() {
  const [allDates, categoryData, insights, gardenData] = await Promise.all([
    getAllDates(),
    getCategoryCounts(),
    getHomeInsights(),
    getGardenData(),
  ]);

  return (
    <HomeTabs
      allDates={allDates}
      categoryCounts={categoryData.counts}
      totalCount={categoryData.total}
      insights={insights}
      gardenData={gardenData}
    />
  );
}
