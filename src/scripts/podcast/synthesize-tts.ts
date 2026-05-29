/**
 * PodcastScript の各 line を ElevenLabs API で音声合成し、data/podcasts/cache/<hash>.mp3 に保存する。
 *
 * Usage:
 *   pnpm tsx -r dotenv/config src/scripts/podcast/synthesize-tts.ts --script <path> [--dry-run]
 *
 *   --script <path>: PodcastScript JSON (必須)
 *   --dry-run:       API 呼び出しせず、cache hit/miss と推定文字数だけ報告
 *
 * Output:
 *   - stdout: JSON `{ total, cached, fetched, errors, lines: [{ speaker, hash, path, status }] }`
 *   - stderr: 進捗ログ
 *
 * 設計:
 *   - cache key: sha256(voice_id + ":" + text).slice(0, 16)
 *   - 並列度 3、429/5xx は指数バックオフで 3 回までリトライ
 *   - 401/403 は致命的、即終了
 *   - 同じ {voice_id, text} は二度生成しない
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { PodcastScript, ScriptLine } from './types';

const CACHE_DIR = path.join(process.cwd(), 'data', 'podcasts', 'cache');
const API_BASE = 'https://api.elevenlabs.io/v1/text-to-speech';
const DEFAULT_MODEL_ID = 'eleven_multilingual_v2';
const VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.0,
  use_speaker_boost: true,
} as const;
const PARALLEL = 3;
const RETRY_MAX = 3;
const RETRY_BASE_MS = 1000;

type Args = {
  scriptPath: string;
  dryRun: boolean;
  modelId: string;
  /** チャプター単位の生成範囲 (両端 inclusive)。例: --segments 0-1 で intro+chapter1 のみ */
  segmentRange: [number, number] | null;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let scriptPath = '';
  let dryRun = false;
  let modelId = DEFAULT_MODEL_ID;
  let segmentRange: [number, number] | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--script') scriptPath = argv[++i] ?? '';
    else if (argv[i] === '--dry-run') dryRun = true;
    else if (argv[i] === '--model') modelId = argv[++i] ?? DEFAULT_MODEL_ID;
    else if (argv[i] === '--segments') {
      const spec = argv[++i] ?? '';
      const m = spec.match(/^(\d+)-(\d+)$/);
      if (!m) {
        process.stderr.write(`Invalid --segments "${spec}", expected N-M (inclusive)\n`);
        process.exit(1);
      }
      segmentRange = [parseInt(m[1], 10), parseInt(m[2], 10)];
    }
  }
  if (!scriptPath) {
    process.stderr.write('Usage: synthesize-tts.ts --script <path> [--dry-run] [--model <id>] [--segments N-M]\n');
    process.exit(1);
  }
  return { scriptPath, dryRun, modelId, segmentRange };
}

// cache key には model_id も含める (v2 / v3 で同じ text を別 mp3 として cache できるように)
function hashFor(modelId: string, voiceId: string, text: string): string {
  return crypto.createHash('sha256').update(`${modelId}:${voiceId}:${text}`).digest('hex').slice(0, 16);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function synthesizeOnce(text: string, voiceId: string, modelId: string, apiKey: string): Promise<Buffer> {
  const res = await fetch(`${API_BASE}/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: VOICE_SETTINGS,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`ElevenLabs API ${res.status} ${res.statusText}: ${body.slice(0, 200)}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return Buffer.from(await res.arrayBuffer());
}

async function synthesizeWithRetry(text: string, voiceId: string, modelId: string, apiKey: string): Promise<Buffer> {
  for (let attempt = 1; attempt <= RETRY_MAX; attempt++) {
    try {
      return await synthesizeOnce(text, voiceId, modelId, apiKey);
    } catch (e) {
      const err = e as Error & { status?: number };
      // 401/403/404 は致命的、即終了させる
      if (err.status === 401 || err.status === 403 || err.status === 404) {
        throw err;
      }
      // 429 / 5xx は指数バックオフで再試行
      if ((err.status === 429 || (err.status && err.status >= 500)) && attempt < RETRY_MAX) {
        const wait = RETRY_BASE_MS * 2 ** (attempt - 1);
        process.stderr.write(`  retry ${attempt}/${RETRY_MAX - 1} after ${wait}ms (status=${err.status})\n`);
        await sleep(wait);
        continue;
      }
      // その他の 4xx や最終試行失敗
      throw err;
    }
  }
  throw new Error('unreachable');
}

type LineResult = {
  speaker: string;
  hash: string;
  path: string;
  status: 'cached' | 'fetched' | 'error' | 'skipped';
  text_len: number;
  error?: string;
};

function ensureCacheDir() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function cachePath(h: string): string {
  return path.join(CACHE_DIR, `${h}.mp3`);
}

async function processLine(
  line: ScriptLine,
  voiceMap: Record<string, string>,
  modelId: string,
  apiKey: string,
  dryRun: boolean,
): Promise<LineResult> {
  const voiceId = voiceMap[line.speaker];
  const text = (line.text ?? '').trim();
  if (!voiceId) {
    return { speaker: line.speaker, hash: '', path: '', status: 'error', text_len: text.length, error: `unknown speaker: ${line.speaker}` };
  }
  if (!text) {
    return { speaker: line.speaker, hash: '', path: '', status: 'skipped', text_len: 0 };
  }
  const h = hashFor(modelId, voiceId, text);
  const filePath = cachePath(h);
  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
    return { speaker: line.speaker, hash: h, path: filePath, status: 'cached', text_len: text.length };
  }
  if (dryRun) {
    return { speaker: line.speaker, hash: h, path: filePath, status: 'fetched', text_len: text.length };
  }
  try {
    const buf = await synthesizeWithRetry(text, voiceId, modelId, apiKey);
    fs.writeFileSync(filePath, buf);
    return { speaker: line.speaker, hash: h, path: filePath, status: 'fetched', text_len: text.length };
  } catch (e) {
    const err = e as Error;
    return { speaker: line.speaker, hash: h, path: '', status: 'error', text_len: text.length, error: err.message };
  }
}

async function main() {
  const args = parseArgs();
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey && !args.dryRun) {
    process.stderr.write('ELEVENLABS_API_KEY is not set. Add it to .env or pass --dry-run.\n');
    process.exit(1);
  }
  const scriptRaw = fs.readFileSync(args.scriptPath, 'utf8');
  const script = JSON.parse(scriptRaw) as PodcastScript;

  ensureCacheDir();

  const voiceMap: Record<string, string> = {};
  for (const h of script.hosts) voiceMap[h.id] = h.voice_id;

  // segmentRange は inclusive (例: 0-1 で intro+chapter 1)。スライスして対象 segment のみ処理
  const targetSegments = args.segmentRange
    ? script.segments.slice(args.segmentRange[0], args.segmentRange[1] + 1)
    : script.segments;

  const lines: ScriptLine[] = [];
  for (const seg of targetSegments) lines.push(...seg.lines);

  process.stderr.write(
    `[tts] script=${args.scriptPath} model=${args.modelId} hosts=${script.hosts.map((h) => `${h.name}:${h.voice_label}`).join(',')} segments=${targetSegments.length}/${script.segments.length} lines=${lines.length}${args.dryRun ? ' DRY-RUN' : ''}\n`,
  );

  const results: LineResult[] = new Array(lines.length);
  const queue: Array<[number, ScriptLine]> = lines.map((l, i) => [i, l]);

  let cached = 0;
  let fetched = 0;
  let errors = 0;
  let skipped = 0;

  async function worker(workerId: number) {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) break;
      const [idx, line] = next;
      const result = await processLine(line, voiceMap, args.modelId, apiKey ?? '', args.dryRun);
      results[idx] = result;
      if (result.status === 'cached') cached++;
      else if (result.status === 'fetched') fetched++;
      else if (result.status === 'skipped') skipped++;
      else errors++;
      const tag =
        result.status === 'cached'
          ? '🟢'
          : result.status === 'fetched'
            ? '⚙️'
            : result.status === 'skipped'
              ? '⏭️'
              : '❌';
      const preview = line.text.replace(/\s+/g, ' ').slice(0, 28);
      process.stderr.write(
        `[tts] w${workerId} ${tag} ${(idx + 1).toString().padStart(3, ' ')}/${lines.length} ${line.speaker.padEnd(8, ' ')} ${preview}…${result.error ? ' ERR: ' + result.error : ''}\n`,
      );
    }
  }

  const workers = Array.from({ length: PARALLEL }, (_, i) => worker(i + 1));
  await Promise.all(workers);

  // Map back to (processed) segments for downstream (mix-audio).
  // segmentRange を指定した場合は対象 segment のみ含める。
  let cursor = 0;
  const segmentReport = targetSegments.map((seg) => ({
    type: seg.type,
    title: seg.title ?? null,
    lines: seg.lines.map(() => {
      const r = results[cursor++];
      return { speaker: r.speaker, hash: r.hash, path: r.path, status: r.status };
    }),
  }));

  const out = {
    total: lines.length,
    cached,
    fetched,
    skipped,
    errors,
    script_path: args.scriptPath,
    model_id: args.modelId,
    segment_range: args.segmentRange,
    cache_dir: CACHE_DIR,
    segments: segmentReport,
  };
  process.stdout.write(JSON.stringify(out, null, 2));
  process.stderr.write(
    `[tts] done total=${lines.length} cached=${cached} fetched=${fetched} skipped=${skipped} errors=${errors}\n`,
  );
  if (errors > 0) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
