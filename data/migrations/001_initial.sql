-- 001_initial.sql
-- next-x-likes リアーキテクチャ Phase 1: 初期スキーマ
-- 12k+ 件の既存いいねを格納し、AI カテゴリ・要約・embedding を後段で書き込む

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS likes (
  tweet_id        TEXT PRIMARY KEY,
  text            TEXT NOT NULL DEFAULT '',
  username        TEXT NOT NULL DEFAULT '',
  tweet_url       TEXT NOT NULL DEFAULT '',
  liked_at        TEXT NOT NULL,           -- ISO8601 (Asia/Tokyo)
  created_at      TEXT,                    -- ツイート投稿時刻（任意）
  source          TEXT NOT NULL,           -- 'ifttt' | 'archive'
  private         INTEGER NOT NULL DEFAULT 0,
  notfound        INTEGER NOT NULL DEFAULT 0,
  raw_json        TEXT NOT NULL,           -- react_tweet_data をそのまま格納（空ツイートは '{}'）
  -- AI 拡張領域
  summary_ja      TEXT,                    -- 1-2 文の要約
  parent_category TEXT,                    -- src/data/categories.ts の name
  sub_tags        TEXT,                    -- JSON 配列
  manual_override INTEGER NOT NULL DEFAULT 0,
  embedding       BLOB,                    -- Float32Array buffer
  embedding_model TEXT,                    -- 例: 'multilingual-e5-small'
  ai_updated_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_likes_liked_at        ON likes(liked_at DESC);
CREATE INDEX IF NOT EXISTS idx_likes_parent_category ON likes(parent_category);
CREATE INDEX IF NOT EXISTS idx_likes_ai_updated      ON likes(ai_updated_at);
CREATE INDEX IF NOT EXISTS idx_likes_source          ON likes(source);

CREATE TABLE IF NOT EXISTS weekly_digests (
  week_start       TEXT PRIMARY KEY,       -- YYYY-MM-DD (月曜起点 JST)
  summary_md       TEXT NOT NULL,
  highlights_json  TEXT NOT NULL,          -- JSON: [{ tweet_id, reason }]
  script_text      TEXT,                   -- 将来 TTS 用台本
  audio_url        TEXT,                   -- 将来音声ファイル URL
  duration_sec     INTEGER,
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  name        TEXT PRIMARY KEY,            -- 親カテゴリの正規名 (例: 'tech-ai')
  label_ja    TEXT NOT NULL,
  order_idx   INTEGER NOT NULL,
  description TEXT
);

-- マイグレーション履歴
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);
