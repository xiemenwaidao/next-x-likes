---
description: x-likes-radio (Yattecast fork) ポッドキャスト配信 repo を初回セットアップする (fork + clone + config + Pages 有効化)
---

# /podcast-init — x-likes-radio repo 初回セットアップ

`/podcast` skill が mp3 + show notes を push する先の **x-likes-radio** repo を
GitHub に作成して、ローカルの `./x-likes-radio/` に clone するまでを自動化する。

**1 回だけ実行する skill**。すでに `./x-likes-radio/` が存在する場合は何もせず終了する。

## 前提

- gh CLI が認証済み (`gh auth status` で確認)
- 作業ディレクトリはリポジトリルート (`next-x-likes` の worktree でも OK)
- GitHub user 名は `gh api user --jq .login` で取れる前提

## 手順

### 0. 既存チェック

```bash
if [ -d "./x-likes-radio" ]; then
  echo "✅ ./x-likes-radio/ は既に存在します。/podcast で運用を始められます。"
  exit 0
fi

GH_USER=$(gh api user --jq .login)
echo "GitHub user: $GH_USER"
```

### 1. yattecast を fork (リネームしながら)

```bash
gh repo fork r7kamura/yattecast --remote=false --clone=false --fork-name=x-likes-radio
```

> `--fork-name` は gh CLI 2.x 以降。失敗したら fallback:
> ```bash
> gh repo fork r7kamura/yattecast --remote=false --clone=false
> gh repo rename x-likes-radio --repo "$GH_USER/yattecast"
> ```

### 2. ローカルに clone (サブディレクトリ)

```bash
gh repo clone "$GH_USER/x-likes-radio"
```

これで `./x-likes-radio/` が出来る (本 repo の .gitignore で除外済み)。

### 3. `_config.yml` の書き換え

`./x-likes-radio/_config.yml` を **Edit ツール**で以下のフィールドに上書きする
(全置換ではなくフィールド単位の Edit が安全):

| key | 値 |
|---|---|
| title | `"x-likes radio"` |
| description | `"集讚館で日々いいねしたツイートを動的ペルソナが語るウィークリーポッドキャスト"` |
| description_long | (description と同じ or 2-3 文に拡張、ユーザーに 1 度確認してから) |
| url | `"https://<GH_USER>.github.io"` |
| baseurl | `"/x-likes-radio"` |
| author | `"<GH_USER>"` |
| email | (ユーザーに 1 度確認、なければ空のまま) |
| language | `ja` |
| timezone | `Asia/Tokyo` |
| hashtag | `xlikesradio` |
| keywords | `"集讚館,いいね,podcast,AI,programming"` |
| permalink | `/episode/:title` |
| markdown | `kramdown` |

`actors` セクションは空 ({}) のままで OK。**各 /podcast 実行時に必要なホストを動的に追加していく方針**。

### 4. GitHub Pages 有効化

```bash
gh api "repos/$GH_USER/x-likes-radio/pages" -X POST \
  -f 'source[branch]=main' \
  -f 'source[path]=/'
```

> 既に Pages が有効な場合 (Yattecast template にすでに enabled) は 409 が返る。無視して進める。

### 5. 初回 commit + push

```bash
cd x-likes-radio
git add _config.yml
git commit -m "🔧 chore: 初期 config (x-likes radio)"
git push
cd ..
```

### 6. 完了報告

ユーザーに以下を表示:

```
✅ x-likes-radio repo セットアップ完了

  GitHub:  https://github.com/<GH_USER>/x-likes-radio
  Pages:   https://<GH_USER>.github.io/x-likes-radio/  (反映に 1-2 分)
  RSS:     https://<GH_USER>.github.io/x-likes-radio/feed.xml
  Local:   ./x-likes-radio/

次のステップ:
- `/podcast --dry-run` で初回エピソードの脚本を生成 (P4 まで実装済み)
- TTS + mix + 公開 (P5/P6/P7) は別途実装が進んでから解禁されます
```

## エラー処理

- 既に同名 repo が user アカウントにある (fork が失敗) → 「すでに `$GH_USER/x-likes-radio` が GitHub に存在しています。clone だけ実行します」と案内、Step 2 から続行
- gh auth がない → `gh auth login` を案内して exit
- `_config.yml` 編集中に既存テンプレと構造が大きく違う → 警告だけ出して、最低限 title と url だけ書き換えて続行 (細部は後で手で直せばよい)
