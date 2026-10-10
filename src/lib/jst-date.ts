/**
 * liked_at (UTC。IFTTT 由来はタイムゾーン無し、archive 由来は末尾 Z) を
 * 日本時間 (Asia/Tokyo) の YYYY-MM-DD に変換する。
 *
 * 日別 JSON (src/content/likes/YYYY/MM/DD.json) は JST で振り分けているので、
 * 日付絞り込み・カレンダー・カードの日付表示はすべてこの関数で揃える。
 * SQL 側では `date(liked_at, '+9 hours')` が同じ結果になる。
 */
export function likedAtToJstYmd(likedAt: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(likedAt);
  if (!m) return likedAt.slice(0, 10);
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return new Date(utc + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
