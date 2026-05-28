/**
 * Podcast 生成パイプラインで使う共通型。
 *
 * 各ステージは中間結果を JSON ファイルとしてディスクに書き出し、
 * 次のステージが読み込む形で疎結合にしている (script の長期実行を分割実行できる)。
 */

export type PeriodSpec = {
  from: string; // YYYY-MM-DD (inclusive)
  to: string;   // YYYY-MM-DD (inclusive)
};

export type PodcastTweet = {
  tweet_id: string;
  username: string;
  text: string | null;
  summary_ja: string | null;
  parent_category: string | null;
  sub_tags: string[];
  liked_at: string;
  has_media: boolean;
  external_urls: string[];      // x.com / twitter.com / t.co を除いた expanded_url
};

export type PodcastTweetBundle = {
  period: PeriodSpec;
  tweets: PodcastTweet[];
};

export type LinkSummary = {
  url: string;
  title: string | null;
  summary: string | null;        // 200 字程度
  fetched_at: string;
  error?: string;
};

export type LinkSummaryCache = {
  // URL → 要約 (30 日 TTL を見て更新するかは利用側で判断)
  entries: Record<string, LinkSummary>;
};

export type NewsContextItem = {
  title: string;
  url: string;
  snippet: string;
};

export type NewsContext = {
  category: string;
  query: string;
  items: NewsContextItem[];
};

export type PersonaSelection = {
  id: string;
  name: string;
  category: string;
  gender: 'male' | 'female' | 'neutral';
  role: string;
  voice_id: string;
  voice_label: string;
};

export type CategoryStat = {
  category: string;
  count: number;
  ratio: number;
};

export type PersonaCandidate = {
  /** AskUserQuestion に出すラベル (例: "1人ホスト: 高橋 (tech-ai)") */
  label: string;
  /** 補助説明 */
  description: string;
  hosts: PersonaSelection[];
};

export type ScriptLine = {
  speaker: string;                // PersonaSelection.id
  text: string;
  pause_after_ms?: number;
  source_tweet_id?: string;
  source_link_url?: string;
};

export type ScriptSegment = {
  type: 'intro' | 'chapter' | 'outro' | 'transition';
  title?: string;
  tweet_ids?: string[];
  bgm?: string | null;            // BGM ファイル path (相対 or 絶対)
  bgm_volume?: number;            // 0.0-1.0 (ducking 時の bed 音量)
  lines: ScriptLine[];
};

export type PodcastScript = {
  version: 1;
  generated_at: string;
  period: PeriodSpec;
  hosts: PersonaSelection[];
  estimated_chars: number;
  estimated_duration_sec: number;
  estimated_tts_cost_jpy?: number;
  segments: ScriptSegment[];
};
