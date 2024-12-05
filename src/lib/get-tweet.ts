import { Tweet, fetchTweet } from 'react-tweet/api';
import { redis } from './redis';

export async function getTweet(
  id: string,
  fetchOptions?: RequestInit,
): Promise<Tweet | undefined> {
  const cacheKey = `tweet:${id}`;

  try {
    // キャッシュをチェック
    const cachedTweet = await redis.get<Tweet>(cacheKey);
    if (cachedTweet) {
      return cachedTweet;
    }

    // 新規取得
    const { data, tombstone, notFound } = await fetchTweet(id, fetchOptions);

    if (data) {
      // 1週間のTTLでキャッシュ
      await redis.set(cacheKey, data, {
        ex: 7 * 24 * 60 * 60, // 1週間
      });
      return data;
    } else if (tombstone || notFound) {
      // 非公開や削除された場合はキャッシュから削除
      await redis.del(cacheKey);
    }
  } catch (error) {
    console.error('Error fetching tweet:', error);
  }

  return undefined;
}
