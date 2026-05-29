/**
 * PodcastTweetBundle (stdin) からカテゴリ分布上位 2 つの関連ニュース検索クエリを組み立てる。
 *
 * Usage:
 *   pnpm tsx src/scripts/podcast/build-news-queries.ts < /tmp/podcast-tweets.json > /tmp/podcast-news-queries.json
 *
 * Output (stdout, JSON):
 *   {
 *     period: PeriodSpec,
 *     queries: [
 *       { category: "tech-ai", label_ja: "AI / 機械学習", query: "AI / 機械学習 2026年5月 注目 話題 ニュース" },
 *       ...
 *     ]
 *   }
 *
 * pick-persona と同じ stats 計算を内部で再実行しているのは、依存関係を単純に保つため
 * (news fetch を persona 確定の前後どちらにも置けるようにする)。
 */
import { CATEGORY_BY_NAME } from '../../data/categories';
import type { CategoryStat, PeriodSpec, PodcastTweetBundle } from './types';

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (buf += c));
    process.stdin.on('end', () => resolve(buf));
    process.stdin.on('error', (e) => reject(e));
  });
}

function computeStats(bundle: PodcastTweetBundle): CategoryStat[] {
  const counter = new Map<string, number>();
  for (const t of bundle.tweets) {
    const c = t.parent_category ?? 'other';
    counter.set(c, (counter.get(c) ?? 0) + 1);
  }
  const total = bundle.tweets.length || 1;
  return [...counter.entries()]
    .map(([category, count]) => ({ category, count, ratio: count / total }))
    .sort((a, b) => b.count - a.count);
}

function monthYearJa(period: PeriodSpec): string {
  // period.from を起点に「YYYY年M月」(期間が月またぎなら from の月優先)
  const m = period.from.match(/^(\d{4})-(\d{2})/);
  if (!m) return '';
  const year = m[1];
  const month = parseInt(m[2], 10);
  return `${year}年${month}月`;
}

async function main() {
  const raw = await readStdin();
  let bundle: PodcastTweetBundle;
  try {
    bundle = JSON.parse(raw) as PodcastTweetBundle;
  } catch (e) {
    process.stderr.write(`[build-news-queries] parse error: ${e}\n`);
    process.exit(1);
    return;
  }
  if (!bundle?.tweets || !Array.isArray(bundle.tweets)) {
    process.stderr.write('[build-news-queries] stdin is not a PodcastTweetBundle\n');
    process.exit(1);
    return;
  }

  const stats = computeStats(bundle);
  const top2 = stats.slice(0, 2);
  const ym = monthYearJa(bundle.period);
  const queries = top2
    .filter((s) => s.count > 0)
    .map((s) => {
      const cat = CATEGORY_BY_NAME[s.category];
      const label_ja = cat?.label_ja ?? s.category;
      const query = ym
        ? `${label_ja} ${ym} 注目 話題 ニュース`
        : `${label_ja} 注目 話題 ニュース`;
      return { category: s.category, label_ja, query };
    });

  const out = { period: bundle.period, queries };
  process.stdout.write(JSON.stringify(out, null, 2));
  process.stderr.write(
    `[build-news-queries] generated ${queries.length} queries for ${ym || '(unknown month)'}\n`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
