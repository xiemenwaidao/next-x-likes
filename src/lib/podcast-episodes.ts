/**
 * podcast エピソード index (src/data/podcast-episodes.json) を読むヘルパ。
 *
 * index は build-episode-index.ts が x-likes-radio/_posts から生成して commit したもの。
 * 本体の カレンダーハイライト / 検索結果の再生カード / 永続プレイヤーが参照する。
 */
import episodesJson from '@/data/podcast-episodes.json';

export type PodcastEpisode = {
  slug: string;
  from: string; // YYYY-MM-DD (週の開始, Mon)
  to: string; // YYYY-MM-DD (週の終わり, Sun)
  title: string;
  description: string;
  audio_url: string;
  page_url: string;
  duration: string; // "MM:SS"
  size: number;
  date: string; // 公開日 YYYY-MM-DD
};

export const PODCAST_EPISODES: PodcastEpisode[] = episodesJson as PodcastEpisode[];

/** "YYYY-MM-DD" を返す (JST 前提、Date からローカル日付文字列) */
export function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** ある日付 (YYYY-MM-DD) を含む週のエピソードを返す (from <= ymd <= to) */
export function episodeForDate(ymd: string): PodcastEpisode | null {
  for (const ep of PODCAST_EPISODES) {
    if (ymd >= ep.from && ymd <= ep.to) return ep;
  }
  return null;
}

/** podcast が存在する日付 (YYYY-MM-DD) の Set を返す。カレンダーハイライト用 */
export function buildPodcastDateSet(): Set<string> {
  const set = new Set<string>();
  for (const ep of PODCAST_EPISODES) {
    // from〜to の各日を列挙
    const start = new Date(`${ep.from}T00:00:00`);
    const end = new Date(`${ep.to}T00:00:00`);
    for (let t = start.getTime(); t <= end.getTime(); t += 86400_000) {
      set.add(toYmd(new Date(t)));
    }
  }
  return set;
}
