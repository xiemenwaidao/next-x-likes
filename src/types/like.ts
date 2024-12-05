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
}
