import { createClient, type Client } from '@libsql/client';
import path from 'path';

// SQLite ファイルはリポジトリ同梱の data/likes.db を使う。
// Vercel デプロイ環境でも process.cwd() からの相対で読める前提
// (next.config.ts の outputFileTracingIncludes で同梱する)。
const DB_FILE = process.env.LIKES_DB_PATH
  ? process.env.LIKES_DB_PATH
  : path.join(process.cwd(), 'data', 'likes.db');

let _client: Client | null = null;

export function getDb(): Client {
  if (_client) return _client;
  _client = createClient({ url: `file:${DB_FILE}` });
  return _client;
}

export function getDbPath(): string {
  return DB_FILE;
}
