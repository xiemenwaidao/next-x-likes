---
description: 期間内のいいねから動的ペルソナのポッドキャストを生成し、x-likes-radio (Yattecast) 別 repo に push して公開し、本体サイト (next-x-likes) のエピソード index にも反映する (--dry-run で脚本まで)
---

# /podcast — いいねダイジェスト・ポッドキャスト生成

期間内 (デフォルト直近 7 日) のいいねを集めて、カテゴリ分布に応じた
動的ペルソナで掛け合い台本を作り、ElevenLabs (**eleven_v3**) で音声合成、BGM (全編 ducking)
と mix した mp3 + show notes を **`x-likes-radio` (Yattecast fork) 別 repo** に
push して公開し、さらに **本体サイト (next-x-likes) のエピソード index に反映**して
カレンダー/プレイヤーに載せるところまで一気通貫で行う。

公開先: `https://xiemenwaidao.github.io/x-likes-radio/` + RSS から Apple Podcasts / Spotify 登録可。
本体サイト: `https://z.xiemen.me/podcast` (一覧) + カレンダー日付選択 + 永続プレイヤー。

**「一貫してやって」= dry-run なしで呼べば Stage 1→10 まで全自動**
(生成 → TTS → mix → x-likes-radio 公開 → 本体 index 反映 → 両 repo push)。
コミット前に毎回ユーザーへ確認する運用ルールは維持する。

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
- ✅ **P5**: TTS 合成 (ElevenLabs **eleven_v3**、3並列、model 込み cache)。`synthesize-tts.ts` の
  デフォルト model_id は `eleven_v3` (v2 は品質却下済み。`--model` を渡さなければ v3)
- ✅ **P6**: ffmpeg mix (BGM ducking + 間奏 boost + 末尾フェード)
- ✅ **P7**: show notes 生成 (podcast-shownotes-writer サブエージェント) + x-likes-radio へ commit + push
- ✅ **P8**: 本体サイト反映 (`build-episode-index.ts` で `src/data/podcast-episodes.json` 再生成 →
  next-x-likes へ commit + push → Vercel デプロイでカレンダー/プレイヤーに反映)

`--dry-run` ありなら Stage 6 で終了。`--dry-run` なしなら Stage 7-10 (TTS → mix → x-likes-radio 公開
→ 本体 index 反映) まで走る。ただし Stage 9-10 は `./x-likes-radio/` が clone 済み (= `/podcast-init`
実行済み) であることが前提。未 clone なら mix まで実行して mp3 path を案内し publish/反映は skip。

## 出力ファイルの行き先 (整理)

| ファイル | 行き先 | git |
|---|---|---|
| transcript JSON | `data/podcasts/scripts/{from}_to_{to}.script.json` | next-x-likes、gitignore (再生成可) |
| TTS 個別セグメント mp3 | `data/podcasts/cache/<hash>.mp3` | next-x-likes、gitignore |
| 完成 mp3 | `x-likes-radio/audio/{slug}.mp3` | x-likes-radio、commit |
| show notes (md) | `x-likes-radio/_posts/YYYY-MM-DD-{slug}.md` | x-likes-radio、commit |
| エピソード index | `src/data/podcast-episodes.json` | **next-x-likes、commit** (本体サイトのカレンダー/プレイヤーが読む) |
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

- ElevenLabs API (**`eleven_v3`** がデフォルト、stability 0.5 / similarity_boost 0.75) で line 単位に合成。
  v2 は品質却下済みなので `--model` は付けない (付けるなら必ず `eleven_v3`)
- 並列度 3、429/5xx は指数バックオフで最大 3 回リトライ
- cache key = `sha256(model_id + ":" + voice_id + ":" + text).slice(0, 16)`、`data/podcasts/cache/<hash>.mp3` に保存
- 同じ {model_id, voice_id, text} は二度生成しない (台本微修正・リトライ時に既存資産再利用。model を変えると別 cache)
- `--dry-run` を渡すと API 呼ばずに cache hit/miss だけ報告 (コスト発生なし)

エラー:

- 401/403/404: 致命的、即終了
- 4xx (上記以外): その line だけ skip 継続、最終的に exit 2
- 空 text: skip (API call なし)

出力 (`/tmp/podcast-tts-result.json`) は line ごとの hash と path を含み、Stage 8 mix が参照する。

### Stage 8: ffmpeg mix

mp3 出力先は x-likes-radio が clone 済みなら repo 配下、無ければ一時パス:

```bash
SLUG="${PERIOD_FROM}_to_${PERIOD_TO}"
if [ -d ./x-likes-radio ]; then OUT="./x-likes-radio/audio/${SLUG}.mp3"; else OUT="data/podcasts/out/${SLUG}.mp3"; fi
mkdir -p "$(dirname "$OUT")"

pnpm tsx src/scripts/podcast/mix-audio.ts \
  --script "$SCRIPT_PATH" \
  --tts-result /tmp/podcast-tts-result.json \
  --out "$OUT" \
  --intro-pad 5 --outro-pad 10 --inter-segment-pad 4 --fade-out 4 \
  --bgm-volume 0.12 --interlude-volume 0.28 \
  > /tmp/podcast-mix-result.json
```

挙動 (2 pass):

- **Pass 1**: 発話 mp3 を `pause_after_ms` 込みで concat。先頭に intro pad、末尾に outro pad、
  各 segment 末尾に inter-segment pad の無音を挿入 (ラジオの「間」)
- **Pass 2**: `bgm/bed.mp3` を全編ループで流し、
  - 発話被り部分は `sidechaincompress` で自動 ducking (-12dB)
  - **間奏区間 (intro / 章間 / outro) は BGM を base 0.12 → 0.28 に持ち上げ** (台形 0.5s フェード)。
    各 line mp3 の実時間を ffprobe で測って間奏 timestamp を正確に計算
  - `loudnorm I=-16:LRA=11:TP=-1.5` でラウドネス正規化
  - 末尾 `--fade-out` 秒をフェードアウト (ブツ切れ防止 + 余韻)
- 出力: `<OUT>` (例 `x-likes-radio/audio/{slug}.mp3`)

### Stage 8.5: 外部ストレージ移行 (任意、env 設定時のみ)

GitHub Pages の公開サイトは **合計 1GB ハード上限**があり、週次 20MB だと約 1 年で逼迫する。
外部ストレージ (Cloudflare R2 / AWS S3) を使う場合は mp3 を repo に入れず外部に置く。

```bash
pnpm tsx -r dotenv/config src/scripts/podcast/upload-audio.ts \
  --file "$OUT" --key "${SLUG}.mp3" > /tmp/podcast-upload.json
UPLOADED=$(jq -r '.uploaded' /tmp/podcast-upload.json)
if [ "$UPLOADED" = "true" ]; then
  AUDIO_PATH=$(jq -r '.public_url' /tmp/podcast-upload.json)   # 絶対 URL (R2/S3)
  # 外部に置いたので repo には mp3 を入れない
  [ -f "./x-likes-radio/audio/${SLUG}.mp3" ] && rm "./x-likes-radio/audio/${SLUG}.mp3"
else
  AUDIO_PATH="/audio/${SLUG}.mp3"   # Pages ローカル (相対)。env 未設定時のデフォルト
fi
```

- `upload-audio.ts` は env (`PODCAST_AUDIO_BASE_URL` / `PODCAST_S3_BUCKET` / `PODCAST_S3_ACCESS_KEY_ID`
  / `PODCAST_S3_SECRET_ACCESS_KEY` / R2 は `PODCAST_S3_ENDPOINT`) が揃っていれば S3 互換 PUT、
  揃っていなければ skip (`uploaded:false`) して **Pages 運用を継続**
- Yattecast の `article.html` / `feed.xml` は `audio_file_path` が絶対 URL (`://` 含む) ならそのまま、
  相対なら `site.github.url` を前置するよう改修済み → ローカル/外部のどちらでも正しい URL になる
- **移行手順 (1GB に近づいたら)**: (1) R2/S3 の bucket + 公開 URL + token を用意して .env に設定、
  (2) 既出 mp3 を `upload-audio.ts` で一括 upload、(3) 既存 `_posts/*.md` の `audio_file_path` を
  絶対 URL に書き換え、(4) `x-likes-radio/audio/` を git から削除。env を入れる以外コード変更不要。

### Stage 9: show notes 生成 + x-likes-radio へ commit + push

`./x-likes-radio/` が無ければこの Stage を skip し、「`/podcast-init` 実行後に publish 可能」
と案内して mp3 path を提示して終了。

ある場合、mp3 メタを集める:

```bash
SIZE=$(stat -f%z "$OUT")
DUR_SEC=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT")
DUR_MMSS=$(python3 -c "s=int(float('$DUR_SEC')); print(f'{s//60:02d}:{s%60:02d}')")
# RSS pubDate = 実際の公開日時 (振り返り対象週ではない)。Date.now() は使えないので JST 現在時刻を生成
PUBLISH_DT=$(TZ=Asia/Tokyo date '+%Y-%m-%d %H:%M:%S +0900')

# ★ 通し番号 (第N回)。週は古い順に作る前提なので「既存 _posts のうち今回より前の週の数 + 1」。
#   ファイル名 "YYYY-MM-DD-{from}_to_{to}.md" の {from} 部分 (12文字目以降の先頭10文字) で比較。
EP_NO=$(( $(ls x-likes-radio/_posts/*.md 2>/dev/null \
  | sed -E 's#.*/[0-9]{4}-[0-9]{2}-[0-9]{2}-([0-9]{4}-[0-9]{2}-[0-9]{2})_to_.*#\1#' \
  | awk -v f="$PERIOD_FROM" '$1 < f' | wc -l | tr -d ' ') + 1 ))
echo "[publish] episode_number = $EP_NO"
```

`podcast-shownotes-writer` サブエージェントを起動 (PodcastScript・tweets・link cache・news・
mp3 メタ・hosts・**publish_datetime (`$PUBLISH_DT`)**・**episode_number (`$EP_NO`)** を渡す)。
タイトルは必ず「いいねダイジェスト {from}週 第${EP_NO}回 (上位2カテゴリ)」形式で統一。
出力: `x-likes-radio/_posts/{PUBLISH_DATE}-{slug}.md`
(Yattecast 形式。ファイル名の日付プレフィックスも公開日 `$PUBLISH_DT` の日付部分を使う)。
**`audio_file_path` には Stage 8.5 で決めた `$AUDIO_PATH` を渡す** (env 未設定なら `/audio/{slug}.mp3`、
外部ストレージ移行後は R2/S3 の絶対 URL)。

front matter: `actor_ids` / `audio_file_path: $AUDIO_PATH` / `audio_file_size` (bytes) /
`date: $PUBLISH_DT` (★実際の公開日時 = RSS pubDate。週の日付ではない) / `duration` ("MM:SS") /
`layout: article` (★必須、post は存在しない) / `title` / `description`。
body: 「## この回の内容」始まり (番組説明/出演者は layout が自動描画するので body で重複させない) +
目次 + 言及ツイート (章別、@user → x.com URL) + 参照リンク + 関連ニュース + クレジット。

x-likes-radio の `_config.yml` の `actors` に今回ホスト (usagi / neko) が居なければ追加。

その後:

```bash
cd x-likes-radio
git config http.postBuffer 524288000   # ★必須: mp3 が 20MB 級なので HTTPS の既定 buffer だと push が HTTP 400 になる
# 外部ストレージ移行済み (Stage 8.5 で uploaded:true) なら audio/ は add しない
[ "$UPLOADED" = "true" ] || git add audio/${SLUG}.mp3
git add _posts/${PERIOD_FROM}-${SLUG}.md _config.yml
git commit -m "🎙️ feat: ${SLUG} エピソード公開"
git push origin master   # default branch は master
cd ..
```

> **postBuffer の罠**: 設定せずに push すると `error: RPC failed; HTTP 400` +
> `send-pack: unexpected disconnect` で失敗する (mp3 が大きいため)。一度
> `git config http.postBuffer 524288000` すれば repo ローカルに保存され、以降は不要。

GitHub Pages の Jekyll build が走り、数分で `https://xiemenwaidao.github.io/x-likes-radio/` に反映。
RSS は `https://xiemenwaidao.github.io/x-likes-radio/feed.xml`。

公開確認 (推奨):

```bash
# build 完了を待ってから
curl -s "https://xiemenwaidao.github.io/x-likes-radio/feed.xml" | grep -E "<title>|<enclosure"
curl -sI "https://xiemenwaidao.github.io/x-likes-radio/audio/${SLUG}.mp3" | grep -iE "HTTP|content-length|accept-ranges"
```

### Stage 10: 本体サイト (next-x-likes) へエピソード反映

x-likes-radio に publish しただけでは本体サイト (`https://z.xiemen.me`) のカレンダー●・
`/podcast` 一覧・永続プレイヤーには出ない。`build-episode-index.ts` が
`x-likes-radio/_posts/*.md` の front matter を読んで `src/data/podcast-episodes.json` を
再生成し、それを next-x-likes に commit + push して **Vercel デプロイ**で初めて反映される。

```bash
# 1. _posts/*.md → src/data/podcast-episodes.json を再生成 (next-x-likes のルートで実行)
pnpm tsx src/scripts/podcast/build-episode-index.ts
# stderr に "N エピソード → src/data/podcast-episodes.json" と各週が出る
```

```bash
# 2. 差分があれば next-x-likes に commit + push
#    ★ podcast-episodes.json は「データ更新」なので CLAUDE.md の DB 同期と同じく
#      main へ直接 commit/push してよい (Vercel が main をデプロイ)。
#      ただしコミット前に必ずユーザー確認 (運用ルール)。
git add src/data/podcast-episodes.json
git commit -m "🎙️ feat: ${SLUG} エピソードを本体 index に反映"
git push origin main
```

- `./x-likes-radio/` が無い (Vercel build 等) と `build-episode-index.ts` は既存 json を
  温存して warning を出すだけ。ローカルの本 skill 実行時のみ正しく再生成される
- `podcast-episodes.json` に差分が無ければ (既反映済み) commit を skip
- ブランチ運用: 本体機能コード (PR) は feat ブランチだが、**エピソード index は運用データ**
  なので `data/likes.db` 同様 main 直 commit が一貫運用上正しい。現在のチェックアウトが
  feat ブランチなら `git checkout main && git pull --ff-only` してから反映する

反映確認 (推奨):

```bash
# Vercel デプロイ完了後
curl -sL "https://z.xiemen.me/podcast" -o /dev/null -w "%{http_code}\n"
# またはローカル: src/data/podcast-episodes.json に当該 slug が載っているか
python3 -c "import json;d=json.load(open('src/data/podcast-episodes.json'));print([e['slug'] for e in d])"
```

## 実行フロー (全 stage 実装済み)

1. 引数を解釈して期間 (`from` / `to`) を確定
2. Stage 1: 期間内ツイート取得 (0 件なら exit)
3. Stage 2: need_fetch > 0 なら podcast-link-fetcher → upsert
4. Stage 3: queries > 0 なら podcast-news-fetcher
5. Stage 4: AskUserQuestion でペルソナ承認 → `/tmp/podcast-selected-hosts.json`
6. Stage 5: podcast-scriptwriter で脚本生成
7. Stage 6: verify-script でコスト見積もり報告
8. `--dry-run` ならここで終了
9. Stage 7: synthesize-tts で TTS 合成 (**eleven_v3** がデフォルト、cache)
10. Stage 8: mix-audio で mp3 完成 (間奏 boost + フェード)
11. Stage 9: x-likes-radio があれば show notes 生成 + commit + push、無ければ skip して mp3 path 案内
12. Stage 10: build-episode-index で本体 index 再生成 → next-x-likes に commit + push (Vercel 反映)

各 commit (Stage 9 の x-likes-radio、Stage 10 の next-x-likes) の前に必ずユーザーへ確認する。

## エラー処理

- `data/likes.db` が存在しない → Stage 1 が失敗、エラーメッセージを表示
- `./x-likes-radio/` が存在しない → Stage 2 以降に進む前に case で弾く
- 期間内 0 件 → Stage 1 終了直後にユーザー報告して exit
- ユーザーがペルソナ選択をキャンセル → ペルソナ確定なしで「中断しました」と報告
- Stage 10 で `src/data/podcast-episodes.json` に差分が無い → 既反映済みとして commit を skip
