---
description: 期間内のいいねから動的ペルソナのポッドキャストを生成する (--dry-run で脚本まで)
---

# /podcast — いいねダイジェスト・ポッドキャスト生成

期間内 (デフォルト直近 7 日) のいいねを集めて、カテゴリ分布に応じた
動的ペルソナで掛け合い台本を作り、ElevenLabs で音声合成、BGM (全編 ducking)
と mix して mp3 を出力する。

## 引数

```
/podcast [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--days N] [--dry-run]
```

- 引数なし: 直近 7 日 (今日 JST から 7 日前まで)
- `--from / --to`: 明示的に期間指定 (両方指定するか、`--to` だけ + `--days`)
- `--days N`: 直近 N 日 (デフォルト 7)
- `--dry-run`: 脚本 (script.json) まで生成して TTS / mix をスキップ

## 実装進捗 (このセッション時点)

- ✅ **P1**: 期間内ツイート収集 + ペルソナ候補生成 + 半自動承認
- ✅ **P2**: 外部リンク fetch (podcast-link-fetcher サブエージェント経由)
- ✅ **P3**: 関連ニュース取得 (podcast-news-fetcher サブエージェント経由)
- ✅ **P4**: 脚本生成 (podcast-scriptwriter サブエージェント) — **`--dry-run` 完成**
- ⏳ **P5**: TTS 合成 (未実装)
- ⏳ **P6**: ffmpeg mix (未実装)

`--dry-run` ありなら Stage 6 (脚本確認 + コスト見積もり) で終了。
`--dry-run` なしで呼ばれた場合は「P5 以降が未実装」を伝えて止まる
(P5/P6 完成後に TTS+mix まで自動継続)。

## 作業ディレクトリ

リポジトリルート (worktree でも OK)。`data/likes.db` が読める前提。

## ステージ

### Stage 1: 期間内ツイート収集

```bash
pnpm tsx src/scripts/podcast/fetch-period.ts --from <FROM> --to <TO> > /tmp/podcast-tweets.json
```

stderr に `[fetch-period] returned N tweets (...)` が出る。0 件なら:

> 「期間内のいいねが見つかりませんでした (`{from}` 〜 `{to}`)。期間を広げて再実行してください。」

を返してそのまま終了。

### Stage 2: 外部リンク fetch

```bash
pnpm tsx src/scripts/podcast/extract-links.ts < /tmp/podcast-tweets.json > /tmp/podcast-link-tasks.json
```

stderr に `[extract-links] total_unique=N need_fetch=M cached=K` が出る。

- `need_fetch === 0` (全て cache hit、または対象 URL なし) → そのまま Stage 3 へ
- それ以外 → `podcast-link-fetcher` サブエージェントを起動:

```
Agent({
  subagent_type: "podcast-link-fetcher",
  description: "Fetch external URLs for podcast",
  prompt: "/tmp/podcast-link-tasks.json を読んで、need_fetch の URL を WebFetch で順次要約し、/tmp/podcast-link-results.json に書き出してください。"
})
```

サブエージェント完了後 (戻り値は件数サマリのみ):

```bash
pnpm tsx src/scripts/podcast/upsert-link-cache.ts < /tmp/podcast-link-results.json
```

これで `data/podcast-link-cache.json` に最新の要約が永続化される
(TTL 30 日、エラー entries は次回再 fetch)。

### Stage 3: 関連ニュース取得

```bash
pnpm tsx src/scripts/podcast/build-news-queries.ts < /tmp/podcast-tweets.json > /tmp/podcast-news-queries.json
```

stderr に `[build-news-queries] generated N queries for YYYY年M月` が出る。

- `queries` が空 (期間内ツイートが 0 件など) → そのまま Stage 4 へスキップ
- それ以外 → `podcast-news-fetcher` サブエージェントを起動:

```
Agent({
  subagent_type: "podcast-news-fetcher",
  description: "Fetch related news for podcast",
  prompt: "/tmp/podcast-news-queries.json を読んで、各クエリを WebSearch で実行し、結果を /tmp/podcast-news.json に書き出してください。"
})
```

サブエージェント完了後、`/tmp/podcast-news.json` に上位 2 カテゴリの
関連ニュース (各 1-2 件) が保存されている。脚本生成 (Stage 5) で参照する。

### Stage 4: ペルソナ決定 (半自動)

```bash
pnpm tsx src/scripts/podcast/pick-persona.ts < /tmp/podcast-tweets.json > /tmp/podcast-personas.json
```

出力 JSON は `{ stats: CategoryStat[], candidates: PersonaCandidate[] }`。
`candidates` (最大 4 案) を **AskUserQuestion** に渡す:

- question: 「期間内 N 件、上位カテゴリは <top1>(p1%), <top2>(p2%)。ホスト構成は?」
- header: "Hosts"
- options: 各 candidate を `{ label: candidate.label, description: candidate.description }` に変換
- multiSelect: false

ユーザーが選択したら、選ばれた candidate の `hosts[]` (PersonaSelection[]) を
Bash heredoc で `/tmp/podcast-selected-hosts.json` に書き出す:

```bash
cat > /tmp/podcast-selected-hosts.json << 'EOF'
[
  {"id":"...","name":"...","category":"...","gender":"...","role":"...","voice_id":"...","voice_label":"..."},
  ...
]
EOF
```

ユーザーが「Other」など中断したら「ホスト未確定で中断しました」と報告して exit。

### Stage 5: 脚本生成

出力 path を組み立てる:

```bash
OUT_PATH="public/podcasts/${PERIOD_FROM}_to_${PERIOD_TO}.script.json"
mkdir -p public/podcasts
```

`podcast-scriptwriter` サブエージェントを起動:

```
Agent({
  subagent_type: "podcast-scriptwriter",
  description: "Generate podcast script JSON",
  prompt: "以下の入力ファイルを読んで PodcastScript JSON を生成し、指定 path に Write してください。

  入力:
  - /tmp/podcast-tweets.json (必須)
  - data/podcast-link-cache.json (任意 — 存在しない/空でも進む)
  - /tmp/podcast-news.json (任意)
  - /tmp/podcast-selected-hosts.json (必須、PersonaSelection[])

  出力 path: <OUT_PATH>

  カテゴリの日本語ラベルが必要なら src/data/categories.ts を Read。
  全体 6,000-8,000 字バジェット、最大 5 章 + その他、Japanese TTS 約 8 文字/秒。
  本文をエコー返答せず、ファイル書き出しのみ。"
})
```

戻り値は path + 統計サマリ (chars / duration / segments / hosts) のみ。

### Stage 6: `--dry-run` 終了報告

脚本完成後、verify-script で正式統計を計算:

```bash
pnpm tsx src/scripts/podcast/verify-script.ts --file "$OUT_PATH" > /tmp/podcast-verify.json
```

stderr に人間可読サマリ (chars / 推定 duration / 推定 TTS コスト / ホスト別文字数) が出る。
これをユーザーへの最終レポートにそのまま流用する。

最終報告 (これで dry-run は終了):

```
🎙️  脚本生成完了 (dry-run)

  期間: {from} 〜 {to}
  ホスト: {name1} (+ {name2})
  文字数: {chars} 字 → 推定 {min} 分
  TTS コスト: ~¥{cost} (ElevenLabs Creator 換算)
  segments: {n} (intro/chapter×{ch}/outro)

  📄 script: {OUT_PATH}

  TTS+mix まで進めたい場合は --dry-run なしで再実行してください
  (P5/P6 未実装のため現状ここで終了)
```

`--dry-run` フラグなしで呼ばれた場合は、ここで「P5/P6 未実装」を案内して終了
(Stage 7/8 は未実装ステージ参照)。

### Stage 7: TTS (P5 で実装、現状未実装)

```bash
pnpm tsx src/scripts/podcast/synthesize-tts.ts --script <path>
```

ElevenLabs API でセリフ単位に合成、`data/podcasts/cache/` にキャッシュ。

### Stage 8: ffmpeg mix (P6 で実装、現状未実装)

```bash
pnpm tsx src/scripts/podcast/mix-audio.ts --script <path>
```

ducking (発話時に bed BGM を自動的に -12dB)、LUFS -16 normalize。
出力: `public/podcasts/{period_from}-weekly.mp3`

## P4 時点の実行フロー (現在の挙動)

1. 引数を解釈して期間 (`from` / `to`) を確定
2. Stage 1 を実行、件数を確認
3. Stage 2 を実行 (need_fetch > 0 なら podcast-link-fetcher サブエージェント起動 → upsert)
4. Stage 3 を実行 (queries > 0 なら podcast-news-fetcher サブエージェント起動)
5. Stage 4 を実行、AskUserQuestion でペルソナ承認 → `/tmp/podcast-selected-hosts.json` に保存
6. Stage 5 を実行、podcast-scriptwriter サブエージェントで `public/podcasts/{from}_to_{to}.script.json` 生成
7. Stage 6: verify-script でコスト見積もり、ユーザーに最終レポート
8. `--dry-run` なしなら「P5/P6 未実装のため TTS+mix はまだ走れません」と案内して終了

## エラー処理

- `data/likes.db` が存在しない → Stage 1 が失敗、エラーメッセージを表示
- 期間内 0 件 → Stage 1 終了直後にユーザー報告して exit
- ユーザーがペルソナ選択をキャンセル → ペルソナ確定なしで「中断しました」と報告
