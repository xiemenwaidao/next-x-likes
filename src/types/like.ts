import { Tweet } from 'react-tweet/api';

export interface TweetWithCard extends Tweet {
  card?: {
    url: string;
    name: string;
    card_platform?: {
      platform: {
        audience: { name: string };
        device: { name: string; version: string };
      };
    };
    binding_values?: {
      title?: { string_value: string; type: string };
      description?: { string_value: string; type: string };
      domain?: { string_value: string; type: string };
      card_url?: { string_value: string; type: string };
      thumbnail_image_original?: {
        image_value: { url: string; width: number; height: number };
        type: string;
      };
      photo_image_full_size_original?: {
        image_value: { url: string; width: number; height: number };
        type: string;
      };
      summary_photo_image_original?: {
        image_value: { url: string; width: number; height: number };
        type: string;
      };
      [key: string]: unknown;
    };
  };
}

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
  react_tweet_data?: TweetWithCard;
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
