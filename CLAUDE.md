# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js 15 application that displays liked tweets from X (Twitter) in a calendar-based interface. It serves as a personal archive system for managing and viewing liked tweets organized by date.

## Development Commands

**Important**: When adding new commands to package.json, always update this list in CLAUDE.md

```bash
# Development (Note: Always use pnpm, not npm or yarn)
pnpm dev          # Start development server at localhost:3000
pnpm build        # Build production application
pnpm start        # Run production server
pnpm lint         # Run Next.js linter

# JSON pipeline (GitHub Actions の定時バッチで実行する step)
pnpm json:dl                    # Sync new likes from AWS S3
pnpm json:conv                  # Process raw data into daily collections
pnpm json:fetch-tweet           # Enrich with full tweet data from X CDN (react-tweet/api を使用)
pnpm json:build-index           # Build tweet ID index (他の json: スクリプトが依存)
pnpm json:extract-urls          # Extract URLs from tweets for /urls page
pnpm json:remove-duplicates     # Remove duplicate tweets from processed data
pnpm json:remove-raw-duplicates # Remove duplicate files from raw S3 data
pnpm json:build-activity        # Build activity data for recent activity graph
pnpm json:process-archive       # Process Twitter archive files (like-twitter-*.js)
pnpm json:fetch-archive         # Fetch tweet data for archive tweets

# DB / 検索アセット / AI 関連 (手元で適宜実行)
pnpm db:init                    # data/likes.db を初期化 (1 回のみ)
pnpm db:migrate                 # src/content/likes/**/*.json → SQLite (idempotent upsert)
pnpm ai:embed                   # 未 embedding 行に multilingual-e5-small で 384 次元生成
pnpm ai:build-search            # SQLite → public/data/*.gz (search-index / meta / embeddings)
                                # ※ pnpm build の prebuild で自動実行される
pnpm ai:next-batch              # AI 分類サブエージェント用の未処理バッチを 50 件取得 (stdout JSON)
pnpm ai:upsert-result           # サブエージェントの分類結果を SQLite に書き戻し
pnpm ai:fetch-media             # 画像主体ツイートのメディアを一時 DL (--clean で削除)
pnpm ai:search "<query>"        # 検索ロジックの CLI デバッグ (FTS / Semantic / Hybrid)

# Deprecated (UI/runtime から剥がされた、scripts はまだ残置)
pnpm json:build-search          # ❌ レガシー検索インデックス (ai:build-search に置換)
pnpm json:build-algolia         # ❌ Algolia 全件 (Algolia SearchBox 撤去済み)
pnpm json:update-algolia        # ❌ Algolia 差分 (同上)

# Git Commits
pnpm commit       # Create standardized commit with gitmoji
```

## Architecture

### Data Flow Pipeline
1. **Collection**: IFTTT webhook saves liked tweets to S3
2. **Sync** (GitHub Actions): `sync-x-likes.ts` downloads new files from S3 to
   `src/assets/data/x/likes/`
3. **Process** (GitHub Actions): `likes-processor.ts` organizes by date and extracts
   tweet IDs into `src/content/likes/YYYY/MM/DD.json`
4. **Enrich** (GitHub Actions): `insert-tweet-to-json.ts` fetches full tweet content
   via X CDN syndication API
5. **Migrate** (local, manual): `migrate-json-to-sqlite.ts` upserts the JSON daily files
   into `data/likes.db` (tweet_id 主キー、idempotent)
6. **Embed** (local, manual): `embed-likes.ts` で未 embedding 行に
   multilingual-e5-small (384 dim) を付与
7. **Classify** (local, manual + subagent): `ai:next-batch` で 50 件取り出してサブ
   エージェントが parent_category / sub_tags / summary_ja を付与、`ai:upsert-result`
   で書き戻し
8. **Build** (Vercel): prebuild が SQLite から `public/data/*.gz` を生成、Next.js が
   静的ページを出力

### File Structure
- **Raw Data**: `src/assets/data/x/likes/YYYYMM/*.json` - Original IFTTT data
- **Processed Data**: `src/content/likes/YYYY/MM/DD.json` - Daily collections with
  enriched tweet content (raw_json として SQLite に取り込まれる)
- **SQLite**: `data/likes.db` - 検索・カテゴリ閲覧・カードレンダリングの単一情報源
- **Search Assets**: `public/data/*.gz` - prebuild が SQLite から生成、ブラウザが
  fetch して MiniSearch / Cosine 検索を実行

### Routes
- `/` ホーム — Hero stat + タブ切替 (日付で / カテゴリで)
- `/search` — FTS / Semantic / Hybrid 検索 (歯車内に詳細)、`?date=YYYY-MM-DD` 対応
- `/categories/[slug]` — 11 カテゴリの個別ページ (sub-tags 絞り込み)
- `/archive/[page]` — 古いアーカイブ (旧 Twitter エクスポート由来) のページネーション
- `/urls/[page]` — いいねツイートに含まれた外部 URL 一覧

### Key Components
- **CalendarPicker**: Interactive calendar using Zustand state management。日付選択で
  `/search?date=YYYY-MM-DD` に遷移
- **TweetEmbedCard**: 公式 X widgets.js を IntersectionObserver で lazy 埋め込みする
  カード。meta header (user / date / category / score) + 公式 embed + footer (summary
  + sub_tags) の 3 階層構造
- **HomeTabs**: ホームの [日付で / カテゴリで] タブ切替
- **MenuGrid**: ヘッダー右上の 3 点メニュー (Home / Search / カテゴリ / Archive / URLs / Help)
- **RecentActivityGraph**: 直近 7 日のアクティビティを shadcn/ui Chart で描画
- **AnnouncementList**: Help 内のお知らせ (src/data/announcements.ts で管理)

### UI Framework
This project uses **shadcn/ui** for UI components. shadcn/ui is a collection of reusable components built with Radix UI and Tailwind CSS.

#### Key shadcn Components Used:
- **Card**: Used for content containers
- **Button**: Interactive buttons
- **Calendar**: Date picker functionality
- **Chart**: Data visualization (based on Recharts)
- **Badge**: Status indicators
- **Popover**: Contextual overlays

#### Adding New Components:
```bash
pnpm dlx shadcn@latest add [component-name]
```

#### Design Guidelines:
- **Always prefer shadcn/ui components** when implementing new UI elements (dialogs, modals, dropdowns, etc.)
- Check existing shadcn components before creating custom solutions
- Use shadcn's Dialog component for modals and popups
- Use shadcn's DropdownMenu for navigation menus
- Maintain consistency with existing shadcn styling patterns

### Important Considerations
- All pages use static generation with `force-static` and `revalidate: false`
- Japan timezone (Asia/Tokyo) is used for date processing
- 削除済み / プライベートツイートは widgets.js が "Post not available" を表示。我々の
  card はそのまま meta / summary を残す
- The calendar highlights dates that have tweet data available
- All main content components use a consistent max width of `max-w-[28rem]`
  (`.col-28` utility) for visual unity
- Header announcements are managed in `src/data/announcements.ts`
- 検索カードは公式 X widgets.js を IntersectionObserver で lazy load (viewport 入り
  時のみ iframe を生成) するため、検索結果が長くなっても初期コストは抑えられている

## Data Sync Process

データフローは 2 段階に分割している:

### Stage 1: GitHub Actions (定時バッチ、毎日 20:00 UTC)

`.github/workflows/process-json.yml` で実行される。S3 → JSON → repo commit までを完結。
SQLite (data/likes.db) には触らない。

```
pnpm json:dl              # S3 から新 likes を pull
pnpm json:conv            # 日別 JSON に整形
pnpm json:remove-duplicates
pnpm json:fetch-tweet     # X CDN syndication API で本文・メディアを enrich
pnpm json:build-index     # tweet-index.json (他の json: スクリプトが依存)
pnpm json:extract-urls    # /urls 用
pnpm json:build-activity  # 直近 7 日のアクティビティグラフ用
# → 変更があれば 🤖 chore: 自動処理によるJSONデータ更新 で commit & push
```

### Stage 2: ローカルで手動 (溜まったら気づいた時)

新ツイートを **検索・カテゴリ閲覧で見えるようにする** ためには、ローカルで以下を流す:

```
pnpm db:migrate           # JSON → SQLite (tweet_id 主キーで idempotent upsert)
pnpm ai:embed             # 未 embedding 行のみ multilingual-e5-small で生成
                          # (AI 分類は別途 ai:next-batch + サブエージェント運用)
pnpm build                # prebuild が public/data/*.gz を再生成 → 静的ページ生成
```

### 取り扱い注意

- **AI 分類は自動化されていない**: GitHub Actions では parent_category / sub_tags /
  summary_ja は付与されない。`pnpm ai:next-batch` を 50 件ずつサブエージェントで
  classification する手動運用。
- **未分類でも検索には出る**: `build-search-assets.ts` のクエリは
  `WHERE private = 0 AND notfound = 0` のみで AI 分類を必須としない。MiniSearch FTS
  には乗るが、カテゴリバッジ / 要約 / ★スコアは表示されない (graceful degrade)。
- **semantic 検索は embedding 必須**: `ai:embed` を流し忘れると新ツイートは
  semantic / hybrid モードでヒットしない (FTS フォールバック)。

## Environment Variables

Required for data sync operations:
- AWS credentials for S3 access (see sync-x-likes.ts)
  - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_BUCKET_NAME`
- X/Twitter API は使用せず、X CDN syndication API (`react-tweet/api` の `fetchTweet`)
  を経由するため認証不要。

`HF_CACHE_DIR` (任意): transformers.js のモデルキャッシュ先。未指定なら
`~/.cache/huggingface`。`pnpm ai:embed` および `pnpm ai:search` で使用。