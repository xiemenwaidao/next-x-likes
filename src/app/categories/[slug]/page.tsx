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
  text: string;
  summary_ja: string | null;
  sub_tags: string[];
  liked_at: string;
};

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

  // top tweets by recency
  const tweetsRes = await db.execute({
    sql: `SELECT tweet_id, username, text, summary_ja, sub_tags, liked_at
          FROM likes
          WHERE private = 0 AND notfound = 0 AND parent_category = ?
          ORDER BY liked_at DESC
          LIMIT 200`,
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
      text: String(r.text ?? '').replace(/https?:\/\/\S+/g, '').trim(),
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
  const subTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
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
