export type Category = {
  name: string;
  label_ja: string;
  order_idx: number;
  description: string;
};

export const CATEGORIES: Category[] = [
  {
    name: 'tech-ai',
    label_ja: 'AI / 機械学習',
    order_idx: 10,
    description:
      'LLM、画像生成、エージェント、機械学習、研究論文、AIプロダクトニュースなど。',
  },
  {
    name: 'programming',
    label_ja: 'プログラミング / 開発',
    order_idx: 20,
    description:
      'コード、ライブラリ、フレームワーク、ツール、開発手法、エンジニアリングのノウハウ、リリースノートなど。AI 関連でもツールや SDK のリリースはこちら寄り。',
  },
  {
    name: 'design',
    label_ja: 'デザイン / UI',
    order_idx: 30,
    description:
      'UI/UX、グラフィック、フォント、配色、デザインツール、Webサイト紹介など。',
  },
  {
    name: 'product-business',
    label_ja: 'プロダクト / ビジネス',
    order_idx: 40,
    description:
      'スタートアップ、サービスリリース、ビジネス論、マーケティング、SaaS 比較、個人開発の収益化など。',
  },
  {
    name: 'art-creative',
    label_ja: 'アート / 創作',
    order_idx: 50,
    description:
      'イラスト、写真、漫画、アニメーション、3DCG、音楽、創作物の紹介・制作過程。',
  },
  {
    name: 'gaming',
    label_ja: 'ゲーム',
    order_idx: 60,
    description: 'ゲームタイトル、攻略、開発、配信、eスポーツなど。',
  },
  {
    name: 'culture-entertainment',
    label_ja: 'カルチャー / エンタメ',
    order_idx: 70,
    description:
      '映画、ドラマ、アニメ、漫画、書籍、音楽（受容側として）、芸能、ミーム、ネタ投稿など。',
  },
  {
    name: 'science-learning',
    label_ja: '科学 / 学び',
    order_idx: 80,
    description:
      '物理、生物、宇宙、数学、歴史、語学、教育コンテンツなど学術寄りの話題。',
  },
  {
    name: 'news-society',
    label_ja: 'ニュース / 社会',
    order_idx: 90,
    description: '社会問題、政治、経済、災害、国際情勢などのニュース。',
  },
  {
    name: 'lifestyle',
    label_ja: 'ライフ / 雑記',
    order_idx: 100,
    description:
      '日常、グルメ、旅行、健康、ガジェット雑感、つぶやき系、ペット、家族など個人的な投稿。',
  },
  {
    name: 'other',
    label_ja: 'その他',
    order_idx: 999,
    description: '上記のいずれにも明確に当てはまらない場合のフォールバック。',
  },
];

export const CATEGORY_NAMES = CATEGORIES.map((c) => c.name);

export function isValidCategory(name: string): boolean {
  return CATEGORY_NAMES.includes(name);
}
