/**
 * サイト上に表示しないユーザー (X の screen_name、大文字小文字は区別しない)。
 *
 * ここに追加したユーザーのいいねは、検索 / カテゴリ / ホームの集計 /
 * カレンダー / Archive / URL 一覧 / podcast の素材から除外される。
 * DB (data/likes.db) からは消さないので、外せば次回ビルドで元に戻る。
 */
export const HIDDEN_USERNAMES: readonly string[] = ['o_muthuki', 'Suits_honaka'];

const hiddenSet = new Set(HIDDEN_USERNAMES.map((u) => u.toLowerCase()));

export function isHiddenUser(username: string | null | undefined): boolean {
  return !!username && hiddenSet.has(username.toLowerCase());
}

/**
 * SQLite の likes テーブル用: 「表示してよい行」の WHERE 条件。
 * `private = 0 AND notfound = 0` に非表示ユーザーの除外を足したもの。
 * screen_name は [A-Za-z0-9_] のみなのでリテラル埋め込みで安全。
 */
export const VISIBLE_LIKES_SQL = (() => {
  const names = [...hiddenSet].filter((u) => /^[a-z0-9_]+$/.test(u));
  const hidden = names.length
    ? ` AND lower(username) NOT IN (${names.map((u) => `'${u}'`).join(', ')})`
    : '';
  return `private = 0 AND notfound = 0${hidden}`;
})();
