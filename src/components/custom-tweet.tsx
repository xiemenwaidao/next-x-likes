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
        <EmbeddedTweet tweet={tweetData} key={tweetId} />
      ) : (
        <TweetNotFound />
      )}
    </Suspense>
  );
};
