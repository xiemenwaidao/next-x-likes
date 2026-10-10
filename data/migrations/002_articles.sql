-- 002_articles.sql
-- X の記事 (Articles) 本文を保持するテーブル。
-- X CDN syndication API は記事のタイトル / 冒頭プレビューしか返さないため、
-- FxTwitter API (api.fxtwitter.com) から本文を取得して保存する。
-- サイトにはタイトル / 冒頭プレビュー / 要約のみ表示し、本文 (body_text) は
-- 著作権上の理由で公開しない (要約・検索の材料としてのみ保持)。

CREATE TABLE IF NOT EXISTS articles (
  tweet_id     TEXT PRIMARY KEY,        -- いいねしたツイート (likes.tweet_id)
  via          TEXT,                    -- 'self' = 記事ツイート本体 / 'quote' = 記事を引用したツイート
  article_tweet_id TEXT,                -- 記事を持つツイートの ID (via='quote' なら引用先)
  article_id   TEXT,                    -- 記事自体の rest_id
  title        TEXT,
  preview_text TEXT,
  body_text    TEXT,                    -- content.blocks の text を改行で連結したプレーンテキスト
  content_json TEXT,                    -- FxTwitter の article オブジェクトをそのまま格納
  summary_ja   TEXT,                    -- 本文から作った日本語要約 (サイト表示用。全文は公開しない)
  summary_updated_at TEXT,
  status       TEXT NOT NULL,           -- 'ok' | 'no_article' | 'error'
  error        TEXT,
  fetched_at   TEXT NOT NULL
);
