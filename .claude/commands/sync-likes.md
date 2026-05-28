---
description: ローカル DB の同期 (db migrate → AI 分類 → embed → build → push) を一気通貫で実行
---

# /sync-likes — ローカル同期タスク

next-x-likes の「GitHub Actions の定時バッチでは実行されない、ローカル必須の処理」を
一括で流して本番 Vercel デプロイまで持っていく。

ユーザーから「いいね同期して」「ローカル同期」と呼ばれることもある。
この skill が起動したら、ユーザーに確認を取らずに最後まで走り切る (途中で
止まるのは AI 分類が 100 件超えのときの提案だけ)。

## 前提

- 作業ディレクトリはリポジトリルート (worktree でも OK)
- main にいる必要はない (skill 内で切り替える)
- 親 worktree `/Users/kadowakimichinori/claude-dev/x-likes/.eslintrc.json` が
  ビルド時に lint をスキップさせる罠あり (step 6 で退避)

## 手順

### 1. main 取り込み

```bash
git checkout main && git pull --ff-only origin main
```

### 2. 現状確認 (最初にユーザーに 1 行報告)

```bash
sqlite3 data/likes.db "SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN parent_category IS NULL AND manual_override=0 AND private=0 AND notfound=0 THEN 1 ELSE 0 END) AS unclassified,
  SUM(CASE WHEN embedding IS NULL THEN 1 ELSE 0 END) AS no_embedding
FROM likes;"
```

報告フォーマット例: `現状 total=12091 unclassified=13 no_embedding=13 — 同期開始します`

### 3. JSON → SQLite (idempotent upsert)

```bash
pnpm db:migrate
```

直後に step 2 のクエリを再実行して、増えた unclassified / no_embedding を把握する。

### 4. AI 分類 (新規 unclassified > 0 のときのみ)

- **50 件以下**: `Agent` ツールで `subagent_type: like-classifier` を起動 (model 指定不要、agent 側で `sonnet` 固定)。
  prompt は `.claude/agents/like-classifier.md` の SUBAGENT PROMPT セクション (または「N 件処理して DB に書き戻して」の一文) でよい。
  サブエージェントが完了したら DB を再確認、残件があれば次バッチを起動。
- **100 件超**: ユーザーに `/loop next-x-likes Phase 2 一括分類タスク` の起動を提案して、
  この skill の残ステップ (5 以降) は **一旦止める**。分類が終わってから再度 `/sync-likes` を打ってもらう。

### 5. 未 embedding 行に embedding 付与 (no_embedding > 0 のときのみ)

```bash
pnpm ai:embed
```

multilingual-e5-small で 384 次元を生成、SQLite に書き戻す。CPU で数十秒〜分単位。

### 6. 検索アセット再生成 + 静的ビルド

親 eslintrc の衝突を回避してビルド。**ビルドが失敗しても eslintrc は必ず戻す**:

```bash
mv /Users/kadowakimichinori/claude-dev/x-likes/.eslintrc.json /tmp/parent-eslintrc.json.bak 2>/dev/null
pnpm build
BUILD_EXIT=$?
mv /tmp/parent-eslintrc.json.bak /Users/kadowakimichinori/claude-dev/x-likes/.eslintrc.json 2>/dev/null
[ $BUILD_EXIT -ne 0 ] && echo "BUILD FAILED" && exit $BUILD_EXIT
```

- `pnpm build` 先頭の `build-search-assets.ts` で `public/data/*.gz` 4 個 (search-index / likes-meta / embeddings / embeddings-meta) が再生成される
- lint エラーが出たら Vercel でも同じく落ちるので、ここで必ず修正してから先に進む
- 470 ページ前後の static 生成が出れば成功

### 7. data/likes.db をコミット + push (差分があれば)

```bash
git status data/likes.db
```

差分があれば:

```bash
git add data/likes.db
git commit -m "🔧 chore: ローカル DB 同期 (+N 件、分類 + embedding)"
git push origin main
```

**コミット時の罠**:

- gitmoji は `.cz-config.cts` の許可リストから選ぶ。`🤖` は弾かれる。
  使ってよいのは `🔧 chore` / `⚡️ perf` / `🐛 fix` / `✨ feat` / `💄 style` / `📝 docs` など
- commit メッセージ **本文** に `xxx:yyy` を書くと commitlint-config-gitmoji が
  gitmoji shortcode と誤認する。例: `pnpm db:migrate` → `pnpm db migrate` のように
  コロンを抜くか言い換える

### 8. 完了報告

Vercel デプロイは数分かかる。ユーザーには **「あとは Vercel 待ち」** と伝えて終わる。
即確認したい場合のみ (省略可):

```bash
curl -sL "https://z.xiemen.me/data/likes-meta.json.gz" | gunzip | \
  python3 -c "import json,sys; d=json.load(sys.stdin); print('latest:', max(m[\"l\"] for m in d), 'total:', len(d))"
```

## 最終報告フォーマット (6-10 行)

- 現状 → 同期後の総件数差分 (+N 件)
- 分類処理: N 件 → 残未分類 N 件
- embedding 付与: N 件 → 残未 embedding N 件
- public/data/*.gz 再生成 (4 個)
- コミット hash (短形式) と push 完了
- Vercel デプロイ待ち

## してはいけないこと

- 親 worktree の eslintrc を戻し忘れる (他作業に影響)
- gitmoji 許可リスト外を使った commit を試行する
- commit body に `xxx:yyy` を書いて gitlint で弾かれる
- ユーザーが明示要求していない force-push
- 100 件超の未分類を 1 バッチで分類しようとする (タイムアウト / コンテキスト圧迫)
- AI 分類サブエージェントが投げたツイート個別の内容をユーザー向けにエコーする (コンテキスト汚染)
