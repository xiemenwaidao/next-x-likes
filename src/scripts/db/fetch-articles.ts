/**
 * X の記事 (Articles) ツイートの本文を FxTwitter API から取得して
 * articles テーブルに保存する。
 *
 * - 対象: likes.raw_json に article (syndication API のタイトル / プレビュー) を
 *   持つ表示可能な行のうち、articles に status='ok' の行がまだ無いもの。
 *   記事ツイート本体 (via='self') に加え、記事を引用したツイート (via='quote')
 *   も引用先の記事本文を保存する
 * - X CDN syndication API は記事本文を返さないため、非公式の FxTwitter
 *   (https://api.fxtwitter.com/{user}/status/{id}) を使う。認証不要・無料
 * - 1 件ずつ間隔を空けて取得する (既定 1000ms)
 *
 * 使い方:
 *   pnpm db:fetch-articles            # 未取得分のみ
 *   pnpm db:fetch-articles --refetch  # 取得済みも取り直す
 */
import { getDb } from '../../lib/db';

const INTERVAL_MS = 1000;
const FXTWITTER_BASE = 'https://api.fxtwitter.com';

type FxBlock = { text?: string; type?: string };
type FxArticle = {
  id?: string;
  title?: string;
  preview_text?: string;
  content?: { blocks?: FxBlock[] };
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type FxTweet = { id?: string; article?: FxArticle; quote?: FxTweet };

async function fetchArticle(
  username: string,
  tweetId: string,
): Promise<{ article: FxArticle; via: 'self' | 'quote'; articleTweetId: string } | null> {
  const user = username || 'i';
  const res = await fetch(`${FXTWITTER_BASE}/${encodeURIComponent(user)}/status/${tweetId}`, {
    headers: { 'User-Agent': 'next-x-likes (personal likes archive)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { tweet?: FxTweet };
  const t = json.tweet;
  if (t?.article) return { article: t.article, via: 'self', articleTweetId: tweetId };
  if (t?.quote?.article) {
    return { article: t.quote.article, via: 'quote', articleTweetId: String(t.quote.id ?? '') };
  }
  return null;
}

async function main() {
  const refetch = process.argv.includes('--refetch');
  const db = getDb();

  const targets = await db.execute(
    `SELECT tweet_id, username FROM likes
      WHERE private = 0 AND notfound = 0
        AND raw_json LIKE '%"article"%'
        ${refetch ? '' : `AND tweet_id NOT IN (SELECT tweet_id FROM articles WHERE status = 'ok')`}
      ORDER BY liked_at DESC`,
  );
  console.log(`[scan] 対象 ${targets.rows.length} 件${refetch ? ' (refetch)' : ''}`);

  let ok = 0;
  let noArticle = 0;
  let failed = 0;
  for (const [i, row] of targets.rows.entries()) {
    const tweetId = String(row.tweet_id);
    const username = String(row.username ?? '');
    const now = new Date().toISOString();
    try {
      const found = await fetchArticle(username, tweetId);
      if (!found) {
        noArticle++;
        await db.execute({
          sql: `INSERT INTO articles (tweet_id, status, fetched_at) VALUES (?, 'no_article', ?)
                ON CONFLICT(tweet_id) DO UPDATE SET status = excluded.status, error = NULL,
                  fetched_at = excluded.fetched_at`,
          args: [tweetId, now],
        });
      } else {
        const { article, via, articleTweetId } = found;
        const body = (article.content?.blocks ?? [])
          .map((b) => (b.text ?? '').trimEnd())
          .join('\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        await db.execute({
          sql: `INSERT INTO articles
                  (tweet_id, via, article_tweet_id, article_id, title, preview_text, body_text,
                   content_json, status, error, fetched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ok', NULL, ?)
                ON CONFLICT(tweet_id) DO UPDATE SET
                  via = excluded.via, article_tweet_id = excluded.article_tweet_id,
                  article_id = excluded.article_id, title = excluded.title,
                  preview_text = excluded.preview_text, body_text = excluded.body_text,
                  content_json = excluded.content_json, status = 'ok', error = NULL,
                  fetched_at = excluded.fetched_at`,
          args: [
            tweetId,
            via,
            articleTweetId,
            article.id ?? null,
            article.title ?? null,
            article.preview_text ?? null,
            body,
            JSON.stringify(article),
            now,
          ],
        });
        ok++;
      }
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      await db.execute({
        sql: `INSERT INTO articles (tweet_id, status, error, fetched_at) VALUES (?, 'error', ?, ?)
              ON CONFLICT(tweet_id) DO UPDATE SET status = 'error', error = excluded.error,
                fetched_at = excluded.fetched_at`,
        args: [tweetId, msg, now],
      });
      console.warn(`[error] ${tweetId}: ${msg}`);
    }
    if ((i + 1) % 10 === 0) console.log(`[progress] ${i + 1}/${targets.rows.length}`);
    if (i < targets.rows.length - 1) await sleep(INTERVAL_MS);
  }

  console.log(`[done] ok=${ok} no_article=${noArticle} error=${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
