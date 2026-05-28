/**
 * Podcast ホスト用ペルソナテンプレート。
 *
 * 各カテゴリにつき 1-2 名の候補を用意し、カテゴリ分布から動的にホストを選ぶ
 * (src/scripts/podcast/pick-persona.ts)。voice_id は ElevenLabs のプリセット
 * voice ID (公開・無料枠で使える定番)。
 *
 * 気に入った custom voice があれば、ユーザーが
 * src/data/podcast-voices.local.json (gitignore) に override マップを置けるよう
 * P5 (TTS フェーズ) で実装する。
 */

export type PodcastPersona = {
  id: string;
  name: string;                                  // 読み上げ時の呼称
  category: string;                              // 紐づくカテゴリ
  gender: 'male' | 'female' | 'neutral';
  role: string;                                  // 設定・職業・口調
  voice_id: string;                              // ElevenLabs voice ID
  voice_label: string;                           // 人間可読 (Adam / Bella など)
};

// ElevenLabs プリセット voice ID (2024-2026 で安定して使える定番)
const VOICE = {
  Adam: 'pNInz6obpgDQGcFmaJgB',     // 落ち着いた男声
  Antoni: 'ErXwobaYiN019PkySvjV',   // 若めの男声
  Josh: 'TxGEqnHWrfWFTfGW9XjX',     // やや低めの男声
  Daniel: 'onwK4e9ZLuTAKqWW03F9',   // 中性的・ニュース調
  Bella: 'EXAVITQu4vr4xnSDxMaL',    // 明るい女声
  Rachel: '21m00Tcm4TlvDq8ikWAM',   // 落ち着いた女声
  Domi: 'AZnzlk1XvdvUeBnXmlld',     // 若めの女声
} as const;

export const PODCAST_PERSONAS: Record<string, PodcastPersona[]> = {
  'tech-ai': [
    {
      id: 'tech-ai-a',
      name: '高橋',
      category: 'tech-ai',
      gender: 'male',
      role: 'AI スタートアップ CTO。論文も読むが実装ファースト。淡々と分析するが好奇心は隠せない',
      voice_id: VOICE.Adam,
      voice_label: 'Adam',
    },
    {
      id: 'tech-ai-b',
      name: '美咲',
      category: 'tech-ai',
      gender: 'female',
      role: 'リサーチエンジニア。アカデミア出身、技術の社会実装に興味あり、噛み砕き上手',
      voice_id: VOICE.Bella,
      voice_label: 'Bella',
    },
  ],
  programming: [
    {
      id: 'programming-a',
      name: '林',
      category: 'programming',
      gender: 'male',
      role: 'Web フロントエンドエンジニア。新ツール・新フレームワーク大好き、勢いで喋るタイプ',
      voice_id: VOICE.Antoni,
      voice_label: 'Antoni',
    },
    {
      id: 'programming-b',
      name: '葵 (あおい)',
      category: 'programming',
      gender: 'female',
      role: 'バックエンドエンジニア。型システムと DB が好き、淡々と正確に話すタイプ',
      voice_id: VOICE.Domi,
      voice_label: 'Domi',
    },
  ],
  design: [
    {
      id: 'design-a',
      name: '工藤',
      category: 'design',
      gender: 'female',
      role: 'フリーランス UI デザイナー。観察眼が鋭く、細部にこだわる。色とタイポの話が大好き',
      voice_id: VOICE.Rachel,
      voice_label: 'Rachel',
    },
  ],
  'product-business': [
    {
      id: 'product-business-a',
      name: '佐々木',
      category: 'product-business',
      gender: 'male',
      role: 'プロダクトマネージャー。ビジネス目線で噛み砕き、数字や市場規模に強い',
      voice_id: VOICE.Josh,
      voice_label: 'Josh',
    },
  ],
  'art-creative': [
    {
      id: 'art-creative-a',
      name: '藍 (あい)',
      category: 'art-creative',
      gender: 'female',
      role: '個展も開く絵師。感性で語る、技法の話も挟む。落ち着いたトーン',
      voice_id: VOICE.Rachel,
      voice_label: 'Rachel',
    },
  ],
  gaming: [
    {
      id: 'gaming-a',
      name: '颯 (はやて)',
      category: 'gaming',
      gender: 'male',
      role: 'インディーゲーマー。ゲームメカニクスとレベルデザインの話が得意',
      voice_id: VOICE.Antoni,
      voice_label: 'Antoni',
    },
    {
      id: 'gaming-b',
      name: '凛 (りん)',
      category: 'gaming',
      gender: 'female',
      role: 'ポケモン GO とポケカも嗜む雑食ゲーマー。明るく軽快な口調',
      voice_id: VOICE.Bella,
      voice_label: 'Bella',
    },
  ],
  'culture-entertainment': [
    {
      id: 'culture-entertainment-a',
      name: '美月 (みつき)',
      category: 'culture-entertainment',
      gender: 'female',
      role: 'アニメ・漫画・映画に幅広く詳しい。語彙豊富で引用が上手',
      voice_id: VOICE.Bella,
      voice_label: 'Bella',
    },
  ],
  'science-learning': [
    {
      id: 'science-learning-a',
      name: '桜井',
      category: 'science-learning',
      gender: 'male',
      role: '博士課程の研究者。専門外でも好奇心旺盛、噛み砕き上手',
      voice_id: VOICE.Josh,
      voice_label: 'Josh',
    },
  ],
  'news-society': [
    {
      id: 'news-society-a',
      name: '河田',
      category: 'news-society',
      gender: 'neutral',
      role: '元紙媒体ライター。中立的に背景を解説、感情的にならない',
      voice_id: VOICE.Daniel,
      voice_label: 'Daniel',
    },
  ],
  lifestyle: [
    {
      id: 'lifestyle-a',
      name: '由衣 (ゆい)',
      category: 'lifestyle',
      gender: 'female',
      role: 'カフェ巡り・旅行好き。明るく雑談ベース、共感を引き出すタイプ',
      voice_id: VOICE.Rachel,
      voice_label: 'Rachel',
    },
  ],
  other: [
    {
      id: 'other-a',
      name: 'なぎ',
      category: 'other',
      gender: 'neutral',
      role: '雑食 MC。橋渡し役。色んな話題を繋ぐのが得意',
      voice_id: VOICE.Daniel,
      voice_label: 'Daniel',
    },
  ],
};

export const DEFAULT_VOICES: Record<'male' | 'female' | 'neutral', string> = {
  male: VOICE.Adam,
  female: VOICE.Rachel,
  neutral: VOICE.Daniel,
};

export function getPersonasForCategory(category: string): PodcastPersona[] {
  return PODCAST_PERSONAS[category] ?? PODCAST_PERSONAS.other;
}

/**
 * primary とは異なる性別のホストを返す。
 *
 * 優先順位:
 *   1. preferredCategory (= 通常は top2 カテゴリ) の異性候補 — top2 視点を維持したい
 *   2. primary.category の別の異性候補 (= alternative voice in same category)
 *   3. 全カテゴリを走査して見つかった最初の異性
 *   4. PODCAST_PERSONAS.other[0] (究極フォールバック)
 */
export function pickOppositeGenderHost(
  primary: PodcastPersona,
  preferredCategory: string,
): PodcastPersona {
  const want: 'male' | 'female' | 'neutral' = primary.gender === 'male' ? 'female' : 'male';
  // 1. preferredCategory の異性候補
  const pref = (PODCAST_PERSONAS[preferredCategory] ?? []).find((p) => p.gender === want);
  if (pref) return pref;
  // 2. primary.category の別の異性候補
  const same = (PODCAST_PERSONAS[primary.category] ?? []).find((p) => p.gender === want);
  if (same) return same;
  // 3. 全カテゴリから want 性をかき集めて最初の 1 件
  for (const list of Object.values(PODCAST_PERSONAS)) {
    const m = list.find((p) => p.gender === want);
    if (m) return m;
  }
  // 4. 究極のフォールバック
  return PODCAST_PERSONAS.other[0];
}
