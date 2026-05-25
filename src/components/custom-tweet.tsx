'use client';

import { EmbeddedTweet, TweetNotFound, TweetSkeleton } from 'react-tweet';
import { Suspense } from 'react';
import { Tweet } from 'react-tweet/api';

type TweetProps = {
  tweetData: Tweet | undefined; // react-tweetのデータ型に応じて適切な型を設定
  tweetId: string;
  isPrivate: boolean;
  isNotFound: boolean;
};

// react-tweet の getEntities() は entities.hashtags / user_mentions / urls / symbols を
// 無条件に for...of で走査するため、API レスポンスに該当キーが無いと
// "TypeError: ... is not iterable" でビルド時のプリレンダリングが失敗する。
// 入力を必ず配列に正規化してから渡す（quoted_tweet も同じ経路で処理されるので再帰）。
type EntitiesShape = NonNullable<Tweet['entities']>;
const normalizeEntities = (entities: Partial<EntitiesShape> | undefined): EntitiesShape => {
  const e = entities ?? {};
  return {
    ...e,
    hashtags: e.hashtags ?? [],
    user_mentions: e.user_mentions ?? [],
    urls: e.urls ?? [],
    symbols: e.symbols ?? [],
    media: e.media,
  } as EntitiesShape;
};
const normalizeTweet = <T extends { entities?: Partial<EntitiesShape>; quoted_tweet?: unknown }>(
  tweet: T,
): T => ({
  ...tweet,
  entities: normalizeEntities(tweet.entities),
  ...(tweet.quoted_tweet
    ? { quoted_tweet: normalizeTweet(tweet.quoted_tweet as { entities?: Partial<EntitiesShape> }) }
    : {}),
});

export const CustomTweet = ({
  tweetData,
  tweetId,
  isPrivate,
  isNotFound,
}: TweetProps) => {
  if (isPrivate || isNotFound) {
    return <TweetNotFound />;
  }

  return (
    <Suspense fallback={<TweetSkeleton />}>
      {tweetData ? (
        <EmbeddedTweet tweet={normalizeTweet(tweetData)} key={tweetId} />
      ) : (
        <TweetNotFound />
      )}
    </Suspense>
  );
};
