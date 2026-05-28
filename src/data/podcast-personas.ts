/**
 * Podcast ホスト用ペルソナ — 2 名固定設計 (2026-05-29 確定)。
 *
 * 当初はカテゴリごとに 1-2 名 × 11 カテゴリで動的選択する設計だったが、
 * 「多趣味で分身的な 2 名固定」コンセプトに移行:
 *   - ユーザー (= リスナー本人) の興味領域すべてを理解している親友 2 人
 *   - 毎週同じ声で振り返ることでシリーズ性 / リスナーの慣れを得る
 *   - カテゴリ分布で「主導役」だけ動的に決まる (hosts[0] が主導、hosts[1] が補佐)
 *
 * voice_id は ElevenLabs。ユーザー指定のカスタム voice。
 *
 * 飽きたら名前 / voice / role を上書きする想定。
 */

export type PodcastPersona = {
  id: string;
  name: string;                                  // 読み上げ時の呼称
  gender: 'male' | 'female' | 'neutral';
  role: string;                                  // トーン・スタンス (職業名は使わない)
  voice_id: string;                              // ElevenLabs voice ID
  voice_label: string;                           // 人間可読 (Chihiro / Yuba など)
  /** 主導役にしやすい得意領域 (CATEGORIES[].name の集合)。空ならどのカテゴリでも均等扱い */
  primary_interests: string[];
};

/**
 * デフォルトのホスト 2 名。
 *
 * primary_interests は両者を「補完的に」配置し、上位カテゴリで主導役が自動的に
 * 切り替わるようにする。両者の interests に重複しない category (other 等) は
 * どちらでも担当できる扱い。
 */
export const DEFAULT_HOSTS: PodcastPersona[] = [
  {
    id: 'chihiro',
    name: 'ちひろ',
    gender: 'female',
    role: '色んな分野に明るく、落ち着いた中音域の知的なトーン。専門用語をさりげなく噛み砕いて伝えるが、自分の職業や属性は名乗らない。論点整理が上手で、技術・サイエンス・ニュース系の解釈が得意。マウントを取らず観察者のスタンス、リスナーの隣で考えを整理してくれる親友',
    voice_id: 'T7yYq3WpB94yAuOXraRi',
    voice_label: 'Chihiro',
    primary_interests: ['tech-ai', 'programming', 'science-learning', 'news-society', 'product-business'],
  },
  {
    id: 'yuba',
    name: 'ゆば',
    gender: 'female',
    role: 'calm でリラックスした聞き心地。自然な口語で相槌や軽い補足を入れる隣の人。アート・カルチャー・ゲーム・ライフ系の解釈が得意。「私は」「〜が専門」のような自己定位 NG、さりげなく知ってる風で気負わない。感性寄りの読み取りでリスナーを和ませる親友',
    voice_id: 'wcs09USXSN5Bl7FXohVZ',
    voice_label: 'Yuba',
    primary_interests: ['art-creative', 'culture-entertainment', 'gaming', 'lifestyle', 'design'],
  },
];

/** カテゴリ name → 「より得意な」ホストを返す。両者の interests に該当しなければ hosts[0] (ちひろ) を返す */
export function leadHostForCategory(category: string): PodcastPersona {
  for (const h of DEFAULT_HOSTS) {
    if (h.primary_interests.includes(category)) return h;
  }
  return DEFAULT_HOSTS[0];
}

/** 主導役の相方を返す */
export function partnerOf(leader: PodcastPersona): PodcastPersona {
  return DEFAULT_HOSTS.find((h) => h.id !== leader.id) ?? DEFAULT_HOSTS[1];
}
