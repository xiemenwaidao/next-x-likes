import { Tweet } from 'react-tweet/api';

export interface Like {
  text: string;
  username: string;
  tweet_url: string;
  first_link: string;
  created_at: string;
  embed_code?: string;
  liked_at: string;
  source: 'ifttt';
  tweet_id?: string;
  react_tweet_data?: Tweet;
  private: boolean;
  notfound: boolean;
}

export interface DayJson {
  body: Like[];
}

export interface DateInfo {
  year: string;
  month: string;
  day: string;
}
