/**
 * podcast-link-fetcher サブエージェントの出力を data/podcast-link-cache.json にマージする。
 *
 * Usage:
 *   pnpm tsx src/scripts/podcast/upsert-link-cache.ts < /tmp/podcast-link-results.json
 *
 * Input (stdin, JSON array):
 *   [
 *     { "url": "https://...", "title": "...", "summary": "...", "error": null },
 *     { "url": "https://...", "title": null, "summary": null, "error": "fetch failed: 403" },
 *     ...
 *   ]
 *
 * Output (stdout, 1 line): merged N entries (success=X errors=Y)
 */
import fs from 'node:fs';
import path from 'node:path';
import type { LinkSummary, LinkSummaryCache } from './types';

const CACHE_PATH = path.join(process.cwd(), 'data', 'podcast-link-cache.json');

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (buf += c));
    process.stdin.on('end', () => resolve(buf));
    process.stdin.on('error', (e) => reject(e));
  });
}

function loadCache(): LinkSummaryCache {
  if (!fs.existsSync(CACHE_PATH)) return { entries: {} };
  try {
    const raw = fs.readFileSync(CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as LinkSummaryCache;
    if (parsed && parsed.entries && typeof parsed.entries === 'object') return parsed;
  } catch {
    process.stderr.write('[upsert-link-cache] existing cache is corrupt, will overwrite\n');
  }
  return { entries: {} };
}

function saveCache(cache: LinkSummaryCache) {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n', 'utf8');
}

type SubagentResult = {
  url: string;
  title?: string | null;
  summary?: string | null;
  error?: string | null;
};

async function main() {
  const raw = await readStdin();
  let results: SubagentResult[];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('input is not an array');
    results = parsed as SubagentResult[];
  } catch (e) {
    process.stderr.write(`[upsert-link-cache] parse error: ${e}\n`);
    process.exit(1);
    return;
  }

  const cache = loadCache();
  const now = new Date().toISOString();
  let success = 0;
  let errors = 0;
  for (const r of results) {
    if (!r.url || typeof r.url !== 'string') continue;
    const entry: LinkSummary = {
      url: r.url,
      title: r.title ?? null,
      summary: r.summary ?? null,
      fetched_at: now,
    };
    if (r.error) entry.error = r.error;
    cache.entries[r.url] = entry;
    if (entry.error) errors += 1;
    else success += 1;
  }
  saveCache(cache);
  process.stdout.write(`merged ${results.length} entries (success=${success} errors=${errors})\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
