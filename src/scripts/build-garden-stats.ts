/**
 * build-garden-stats.ts — GitHub Actions の「いいね取り込み」ジョブ末尾で実行。
 * トップの「讚の庭」桜コンポーネント（ZanNoNiwa）に渡す JSON を書き出す。
 *
 *   出力: public/garden-stats.json
 *   {
 *     "current": "2026-06",         // 当月（Asia/Tokyo）
 *     "generatedAt": "2026-06-06T...",
 *     "months": {
 *       "2025-07": { "elapsedDays": 31, "totalLikes": 267, "categoryWeights": [..11..] },
 *       ...
 *       "2026-06": { "elapsedDays": 6,  "totalLikes": 84,  "categoryWeights": [..11..] }
 *     }
 *   }
 *
 * ★ 月（カレンダー月）ごとに集計し、トップのカレンダーで月を選ぶと木がその月の姿に
 *   なる。過去の完了月は elapsedDays = その月の日数（＝満成長）、当月は今日の日付。
 *
 * データ源の使い分け（このプロジェクトの 2 段階パイプラインに合わせる）:
 *   - totalLikes … 日別 JSON（src/content/likes/**.json）から月別集計。
 *       Actions が毎日 enrich する最新源なので、取り込んだ分だけ当月の木が育つ。
 *   - categoryWeights … SQLite（data/likes.db）の parent_category から月別集計。
 *       カテゴリ分類はローカル手動運用なので JSON には載らない。花色の比率を決める
 *       だけなので、未分類の最新ツイートは色に寄与しない（graceful degrade）。
 *       ※ source='ifttt' に限定。archive（旧Twitterエクスポートの一括取り込み）は
 *         liked_at がインポート月に固まるため、月別集計に混ぜると歪む。日別 JSON
 *         （= ifttt のみ）の totalLikes と母集団を揃える意味でも ifttt 限定。
 */

import fs from 'fs';
import path from 'path';
import { toZonedTime, format } from 'date-fns-tz';
import { getDb } from '../lib/db';
import { CATEGORY_NAMES } from '../data/categories';

const TZ = 'Asia/Tokyo';

interface DailyLike {
  liked_at?: string;
}
interface DailyFile {
  body?: DailyLike[];
}
interface MonthStats {
  elapsedDays: number;
  totalLikes: number;
  categoryWeights: number[];
}

/** 'YYYY-MM' のその月の日数 */
function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** src/content/likes/YYYY/MM/DD.json を再帰的に集める（glob 非依存）。 */
function collectDailyFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/^\d{2}\.json$/.test(entry.name)) out.push(full);
    }
  };
  walk(root);
  return out;
}

/** 日別 JSON から月別（'YYYY-MM' → 件数）のいいね総数を数える。 */
function countLikesByMonth(): Map<string, number> {
  const totals = new Map<string, number>();
  const contentDir = path.join(process.cwd(), 'src/content/likes');
  if (!fs.existsSync(contentDir)) return totals;
  for (const file of collectDailyFiles(contentDir)) {
    let parsed: DailyFile;
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {
      continue;
    }
    if (!Array.isArray(parsed.body)) continue;
    for (const like of parsed.body) {
      // liked_at は Asia/Tokyo の壁時計（タイムゾーン無し）。'YYYY-MM' 前方一致。
      if (typeof like.liked_at !== 'string') continue;
      const ym = like.liked_at.slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(ym)) continue;
      totals.set(ym, (totals.get(ym) ?? 0) + 1);
    }
  }
  return totals;
}

/** SQLite からカテゴリ別件数を月別（'YYYY-MM' → CATEGORY_NAMES 順 weights）で返す。 */
async function loadCategoryWeightsByMonth(): Promise<Map<string, number[]>> {
  const byMonth = new Map<string, number[]>();
  try {
    const db = getDb();
    const res = await db.execute(
      `SELECT strftime('%Y-%m', liked_at) AS ym,
              parent_category AS name,
              COUNT(*) AS n
       FROM likes
       WHERE private = 0 AND notfound = 0
         AND parent_category IS NOT NULL
         AND source = 'ifttt'
       GROUP BY ym, parent_category`,
    );
    for (const row of res.rows) {
      const ym = String(row.ym ?? '');
      if (!/^\d{4}-\d{2}$/.test(ym)) continue;
      let weights = byMonth.get(ym);
      if (!weights) {
        weights = new Array(CATEGORY_NAMES.length).fill(0);
        byMonth.set(ym, weights);
      }
      const idx = CATEGORY_NAMES.indexOf(String(row.name));
      const target = idx >= 0 ? idx : CATEGORY_NAMES.length - 1; // 未知は other
      weights[target] += Number(row.n ?? 0);
    }
  } catch (e) {
    console.warn(
      'garden-stats: SQLite からカテゴリを取得できませんでした（花色は均一になります）:',
      e instanceof Error ? e.message : e,
    );
  }
  return byMonth;
}

async function main() {
  const nowTokyo = toZonedTime(new Date(), TZ);
  const current = format(nowTokyo, 'yyyy-MM', { timeZone: TZ });
  const today = nowTokyo.getDate();

  const [totalsByMonth, weightsByMonth] = await Promise.all([
    Promise.resolve(countLikesByMonth()),
    loadCategoryWeightsByMonth(),
  ]);

  // いいねがある全月（JSON 由来）＋カテゴリだけある月も拾う
  const months = new Set<string>([
    ...totalsByMonth.keys(),
    ...weightsByMonth.keys(),
  ]);

  const monthsOut: Record<string, MonthStats> = {};
  for (const ym of [...months].sort()) {
    if (ym > current) continue; // 未来月は出さない
    monthsOut[ym] = {
      // 過去の完了月は満成長（その月の日数）、当月は今日まで
      elapsedDays: ym === current ? today : daysInMonth(ym),
      totalLikes: totalsByMonth.get(ym) ?? 0,
      categoryWeights:
        weightsByMonth.get(ym) ?? new Array(CATEGORY_NAMES.length).fill(0),
    };
  }

  // 当月のエントリは必ず用意（今月まだ 0 件でも木が出るように）
  if (!monthsOut[current]) {
    monthsOut[current] = {
      elapsedDays: today,
      totalLikes: 0,
      categoryWeights: new Array(CATEGORY_NAMES.length).fill(0),
    };
  }

  const stats = {
    current,
    generatedAt: new Date().toISOString(),
    months: monthsOut,
  };

  const outDir = path.join(process.cwd(), 'public');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, 'garden-stats.json');
  fs.writeFileSync(out, JSON.stringify(stats, null, 2));
  console.log(
    `garden-stats.json written: current=${current}, months=${Object.keys(monthsOut).length}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
