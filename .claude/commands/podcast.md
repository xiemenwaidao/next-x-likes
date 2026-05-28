---
description: 期間内のいいねから動的ペルソナのポッドキャストを生成し、x-likes-radio (Yattecast) 別 repo に push して公開する (--dry-run で脚本まで)
---

# /podcast — いいねダイジェスト・ポッドキャスト生成

期間内 (デフォルト直近 7 日) のいいねを集めて、カテゴリ分布に応じた
動的ペルソナで掛け合い台本を作り、ElevenLabs で音声合成、BGM (全編 ducking)
と mix した mp3 + show notes を **`x-likes-radio` (Yattecast fork) 別 repo** に
push して公開する。

公開先: `https://xiemenwaidao.github.io/x-likes-radio/` + RSS から Apple Podcasts / Spotify 登録可。

## 引数

```
/podcast [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--days N] [--dry-run]
```

- 引数なし: 直近 7 日 (今日 JST から 7 日前まで)
- `--from / --to`: 明示的に期間指定 (両方指定するか、`--to` だけ + `--days`)
- `--days N`: 直近 N 日 (デフォルト 7)
- `--dry-run`: 脚本 (script.json) まで生成して TTS / mix / push をスキップ

## 前提

- `./x-likes-radio/` が clone 済み (= `/podcast-init` 実行済み)。存在しなければ skill を中断して案内
- `data/likes.db` が読める (リポジトリルートで実行する前提)
- `.env` に `ELEVENLABS_API_KEY` (P5 以降)
- BGM ファイルが `public/podcasts/bgm/bed.mp3` に置いてある (P6 以降。1 曲をエピソード全編で流す方式)。
  実運用では実体 mp3 を `public/podcasts/bgm/*.mp3` に複数置き、`bed.mp3` を symlink にする:
  `cd public/podcasts/bgm && ln -sfn <target>.mp3 bed.mp3`
- ffmpeg が `/opt/homebrew/bin/ffmpeg` 等で見える (P6 以降)

## 実装進捗 (このセッション時点)

- ✅ **P1**: 期間内ツイート収集 + ペルソナ候補生成 + 半自動承認
- ✅ **P2**: 外部リンク fetch (podcast-link-fetcher サブエージェント経由)
- ✅ **P3**: 関連ニュース取得 (podcast-news-fetcher サブエージェント経由)
- ✅ **P4**: 脚本生成 (podcast-scriptwriter サブエージェント) — **`--dry-run` 完成**
- ✅ **P5**: TTS 合成 (ElevenLabs eleven_multilingual_v2、3並列、cache 付き)
- ⏳ **P6**: ffmpeg mix (BGM ducking)、未実装
- ⏳ **P7**: show notes 生成 + x-likes-radio へ commit + push、未実装

`--dry-run` ありなら Stage 6 で終了。`--dry-run` なしで呼ばれた場合は
Stage 7 (TTS) まで走るが P6/P7 未実装なので mp3 mix と公開はまだできない。

## 出力ファイルの行き先 (整理)

| ファイル | 行き先 | git |
|---|---|---|
| transcript JSON | `data/podcasts/scripts/{from}_to_{to}.script.json` | next-x-likes、gitignore (再生成可) |
| TTS 個別セグメント mp3 | `data/podcasts/cache/<hash>.mp3` | next-x-likes、gitignore |
| 完成 mp3 | `x-likes-radio/audio/{slug}.mp3` | x-likes-radio、commit |
| show notes (md) | `x-likes-radio/_posts/YYYY-MM-DD-{slug}.md` | x-likes-radio、commit |
| BGM (実体 + symlink) | `public/podcasts/bgm/*.mp3` + `bed.mp3` symlink | **gitignore** (著作権配慮 + repo 肥大回避)、ローカルで管理 |

slug は `{from}_to_{to}` (例: `2026-05-22_to_2026-05-28`)。

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

`need_fetch === 0` ならスキップ。それ以外は `podcast-link-fetcher` サブエージェント起動:

```
Agent({
  subagent_type: "podcast-link-fetcher",
  description: "Fetch external URLs for podcast",
  prompt: "/tmp/podcast-link-tasks.json を読んで need_fetch の URL を WebFetch で順次要約し、/tmp/podcast-link-results.json に書き出してください。"
})
```

```bash
pnpm tsx src/scripts/podcast/upsert-link-cache.ts < /tmp/podcast-link-results.json
```

### Stage 3: 関連ニュース取得

```bash
pnpm tsx src/scripts/podcast/build-news-queries.ts < /tmp/podcast-tweets.json > /tmp/podcast-news-queries.json
```

`queries` が空ならスキップ。それ以外は `podcast-news-fetcher` サブエージェント起動:

```
Agent({
  subagent_type: "podcast-news-fetcher",
  description: "Fetch related news for podcast",
  prompt: "/tmp/podcast-news-queries.json を読んで、各クエリを WebSearch で実行し、結果を /tmp/podcast-news.json に書き出してください。"
})
```

### Stage 4: ペルソナ決定 (半自動)

```bash
pnpm tsx src/scripts/podcast/pick-persona.ts < /tmp/podcast-tweets.json > /tmp/podcast-personas.json
```

`candidates` (最大 4 案) を **AskUserQuestion** に渡す:

- question: 「期間内 N 件、上位カテゴリは <top1>(p1%), <top2>(p2%)。ホスト構成は?」
- header: "Hosts"
- options: 各 candidate を `{ label, description }` に変換
- multiSelect: false

選ばれた candidate の `hosts[]` を Bash heredoc で `/tmp/podcast-selected-hosts.json` に保存:

```bash
cat > /tmp/podcast-selected-hosts.json << 'EOF'
[ ... PersonaSelection[] ... ]
EOF
```

中断 (Other 等) → 「ホスト未確定で中断しました」と報告して exit。

### Stage 5: 脚本生成

出力 path を組み立てる:

```bash
SLUG="${PERIOD_FROM}_to_${PERIOD_TO}"
SCRIPT_PATH="data/podcasts/scripts/${SLUG}.script.json"
mkdir -p data/podcasts/scripts
```

`podcast-scriptwriter` サブエージェント起動:

```
Agent({
  subagent_type: "podcast-scriptwriter",
  description: "Generate podcast script JSON",
  prompt: "以下の入力ファイルを読んで PodcastScript JSON を生成し、<SCRIPT_PATH> に Write してください。

  入力:
  - /tmp/podcast-tweets.json (必須)
  - data/podcast-link-cache.json (任意 — 存在しない/空でも進む)
  - /tmp/podcast-news.json (任意)
  - /tmp/podcast-selected-hosts.json (必須、PersonaSelection[])

  出力 path: <SCRIPT_PATH>

  カテゴリの日本語ラベルが必要なら src/data/categories.ts を Read。
  全体 6,000-8,000 字バジェット、最大 5 章 + その他、Japanese TTS 約 8 文字/秒。
  本文をエコー返答せず、ファイル書き出しのみ。"
})
```

戻り値は path + 統計サマリ (chars / duration / segments / hosts) のみ。

### Stage 6: `--dry-run` 終了報告

```bash
pnpm tsx src/scripts/podcast/verify-script.ts --file "$SCRIPT_PATH" > /tmp/podcast-verify.json
```

stderr に人間可読サマリ。ユーザーへの最終レポート:

```
🎙️  脚本生成完了 (dry-run)

  期間: {from} 〜 {to}
  ホスト: {name1} (+ {name2})
  文字数: {chars} 字 → 推定 {min} 分
  TTS コスト: ~¥{cost} (ElevenLabs Creator 換算)
  segments: {n} (intro/chapter×{ch}/outro)

  📄 script: {SCRIPT_PATH}

  続けて TTS+mix+公開まで進めるには --dry-run なしで再実行 (P5/P6/P7 完成後)
```

`--dry-run` フラグなしで呼ばれた場合は、ここで「P5/P6/P7 未実装」を案内して終了。

### Stage 7: TTS 合成

```bash
pnpm tsx -r dotenv/config src/scripts/podcast/synthesize-tts.ts --script "$SCRIPT_PATH" > /tmp/podcast-tts-result.json
```

(`-r dotenv/config` で `.env` の `ELEVENLABS_API_KEY` を自動 load する。
`pnpm podcast:tts` alias 経由だと pnpm 9 が `--dry-run` 等の flag を食う場合があるので
podcast.md からは tsx を直接呼ぶ形に統一)

挙動:

- ElevenLabs API (`eleven_multilingual_v2`、stability 0.5 / similarity_boost 0.75) で line 単位に合成
- 並列度 3、429/5xx は指数バックオフで最大 3 回リトライ
- cache key = `sha256(voice_id + ":" + text).slice(0, 16)`、`data/podcasts/cache/<hash>.mp3` に保存
- 同じ {voice_id, text} は二度生成しない (台本微修正・リトライ時に既存資産再利用)
- `--dry-run` を渡すと API 呼ばずに cache hit/miss だけ報告 (コスト発生なし)

エラー:

- 401/403/404: 致命的、即終了
- 4xx (上記以外): その line だけ skip 継続、最終的に exit 2
- 空 text: skip (API call なし)

出力 (`/tmp/podcast-tts-result.json`) は line ごとの hash と path を含み、Stage 8 mix が参照する。

### Stage 8: ffmpeg mix (P6 で実装)

**現状未実装。P6 で以下を追加予定:**

```bash
pnpm tsx src/scripts/podcast/mix-audio.ts --script "$SCRIPT_PATH" --out "./x-likes-radio/audio/${SLUG}.mp3"
```

- 発話 mp3 を `pause_after_ms` 込みで concat
- `bgm/bed.mp3` 1 曲をエピソード全編で流し、発話被り部分のみ自動 ducking (-12dB)
- BGM がエピソード長より短い場合はループ
- LUFS -16 normalize
- 出力: `x-likes-radio/audio/{slug}.mp3`

### Stage 9: show notes 生成 + x-likes-radio へ commit + push (P7 で実装)

**現状未実装。P7 で以下を追加予定:**

`podcast-shownotes-writer` (新規サブエージェント) または専用 TS スクリプトで、
脚本 (`SCRIPT_PATH`) と関連ツイート/リンクから show notes を組み立てる:

- ファイル: `x-likes-radio/_posts/{date}-{slug}.md`
- front matter:
  - `actor_ids: [host1_id, host2_id]`
  - `audio_file_path: /audio/{slug}.mp3`
  - `audio_file_size: <bytes>` (Stage 8 で生成した mp3 から `fs.statSync`)
  - `date: <ISO8601>` (今日)
  - `duration: "MM:SS"` (verify-script 出力の estimated_duration_sec から)
  - `layout: post`
  - `title: "今週のいいねダイジェスト ({from} 〜 {to})"`
  - `description: "<1-2 文サマリ>"`
- body: 章ごとの見出し + 言及ツイート URL + 言及外部リンク URL を関連リンクとして列挙

x-likes-radio の `_config.yml` の `actors` セクションに今回ホストが居なければ追加。

その後:

```bash
cd x-likes-radio
git add audio/${SLUG}.mp3 _posts/${DATE}-${SLUG}.md _config.yml
git commit -m "🎙️ feat: ${SLUG} エピソード公開"
git push
cd ..
```

GitHub Pages の自動 build (Jekyll) が走り、数分で `https://xiemenwaidao.github.io/x-likes-radio/` に反映。
RSS は `https://xiemenwaidao.github.io/x-likes-radio/feed.xml` で配信される。

## 実行フロー (P4 時点)

1. 引数を解釈して期間 (`from` / `to`) を確定
2. `./x-likes-radio/` が無ければ「`/podcast-init` を先に実行してください」と案内して exit
3. Stage 1 を実行、件数を確認 (0 件なら exit)
4. Stage 2 を実行 (need_fetch > 0 なら podcast-link-fetcher → upsert)
5. Stage 3 を実行 (queries > 0 なら podcast-news-fetcher)
6. Stage 4 を実行、AskUserQuestion でペルソナ承認 → `/tmp/podcast-selected-hosts.json`
7. Stage 5 を実行、podcast-scriptwriter で `data/podcasts/scripts/{slug}.script.json` 生成
8. Stage 6: verify-script でコスト見積もり、ユーザーに最終レポート
9. `--dry-run` なしなら「P5/P6/P7 未実装のため TTS+mix+公開はまだ走れません」と案内して終了

## エラー処理

- `data/likes.db` が存在しない → Stage 1 が失敗、エラーメッセージを表示
- `./x-likes-radio/` が存在しない → Stage 2 以降に進む前に case で弾く
- 期間内 0 件 → Stage 1 終了直後にユーザー報告して exit
- ユーザーがペルソナ選択をキャンセル → ペルソナ確定なしで「中断しました」と報告
