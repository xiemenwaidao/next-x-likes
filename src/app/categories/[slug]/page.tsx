export const dynamic = 'force-static';
export const revalidate = false;

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { CATEGORIES, CATEGORY_BY_NAME, isValidCategory } from '@/data/categories';
import { getDb } from '@/lib/db';
import { CategoryPageClient } from './category-client';

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return CATEGORIES.map((c) => ({ slug: c.name }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const cat = CATEGORY_BY_NAME[slug];
  if (!cat) return { title: 'カテゴリ | 集讚館' };
  return {
    title: `${cat.label_ja} | 集讚館`,
    description: cat.description,
  };
}

export type CategoryTweet = {
  tweet_id: string;
  username: string;
  summary_ja: string | null;
  sub_tags: string[];
  liked_at: string;
};
// 注: text (ツイート本文) は公式 widgets.js が CDN から取得するので props で
// ship しない。3,000 件規模で hydration が重くなり、View Transitions が
// timeout する原因になっていた (~430KB 削減)。

async function loadCategoryData(slug: string) {
  const db = getDb();

  const totalRes = await db.execute(
    `SELECT COUNT(*) AS n FROM likes WHERE private = 0 AND notfound = 0`,
  );
  const total = Number(totalRes.rows[0]?.n ?? 0);

  const countRes = await db.execute({
    sql: `SELECT COUNT(*) AS n
          FROM likes
          WHERE private = 0 AND notfound = 0 AND parent_category = ?`,
    args: [slug],
  });
  const count = Number(countRes.rows[0]?.n ?? 0);

  // カテゴリ内全件 (sub-tag フィルタの結果が「直近 200 件にたまたま入って
  // いない古いツイートを取り逃がす」のを防ぐため LIMIT は外す)。
  // 最大カテゴリの art-creative でも 3,558 件なので SSG 出力 / props サイズ
  // ともに許容範囲。クライアント側で PAGE_SIZE=20 のページング済み。
  const tweetsRes = await db.execute({
    sql: `SELECT tweet_id, username, summary_ja, sub_tags, liked_at
          FROM likes
          WHERE private = 0 AND notfound = 0 AND parent_category = ?
          ORDER BY liked_at DESC`,
    args: [slug],
  });

  const tweets: CategoryTweet[] = tweetsRes.rows.map((r) => {
    let subs: string[] = [];
    if (r.sub_tags) {
      try {
        const parsed = JSON.parse(String(r.sub_tags));
        if (Array.isArray(parsed)) subs = parsed.filter((t) => typeof t === 'string');
      } catch {
        /* noop */
      }
    }
    return {
      tweet_id: String(r.tweet_id),
      username: String(r.username ?? ''),
      summary_ja: r.summary_ja ? String(r.summary_ja) : null,
      sub_tags: subs,
      liked_at: String(r.liked_at ?? ''),
    };
  });

  // sub_tag 集計
  const tagCounts = new Map<string, number>();
  for (const t of tweets) {
    for (const tag of t.sub_tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  // top 30 まで pill 表示用に拾う。これ以上は UI が重くなる + 利用頻度低い
  const subTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([tag, n]) => ({ tag, count: n }));

  return { count, total, tweets, subTags };
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  if (!isValidCategory(slug)) {
    notFound();
  }
  const cat = CATEGORY_BY_NAME[slug];
  const { count, total, tweets, subTags } = await loadCategoryData(slug);

  return (
    <CategoryPageClient
      category={cat}
      count={count}
      total={total}
      tweets={tweets}
      subTags={subTags}
    />
  );
}
