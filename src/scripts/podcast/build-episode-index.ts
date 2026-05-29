/**
 * x-likes-radio/_posts/*.md の front matter を読んで、本体サイト (next-x-likes) 用の
 * エピソード index `src/data/podcast-episodes.json` を生成する。
 *
 * 本体サイトのカレンダーハイライト + /search?date= の「この週の podcast」カード +
 * 永続プレイヤーが、この json を読んで動く。
 *
 * Usage:
 *   pnpm tsx src/scripts/podcast/build-episode-index.ts [--radio-dir ./x-likes-radio]
 *
 * 設計:
 *   - Vercel は ./x-likes-radio/ を持たない (gitignore・ローカルのみ) ので、
 *     ローカルで生成して next-x-likes に json を commit する運用。
 *   - ./x-likes-radio/ が無ければ既存 json を温存して warning (Vercel build で誤って空にしない)。
 *   - front matter は単純な flat YAML なので軽量パーサで処理 (新規依存を足さない)。
 */
import fs from 'node:fs';
import path from 'node:path';

type Episode = {
  slug: string;
  from: string; // YYYY-MM-DD (週の開始)
  to: string; // YYYY-MM-DD (週の終わり)
  title: string;
  description: string;
  audio_url: string; // 絶対 URL (再生用)
  page_url: string; // エピソード詳細ページ
  duration: string; // "MM:SS"
  size: number; // bytes
  date: string; // 公開日 (front matter date の日付部分)
};

const OUT_PATH = path.join(process.cwd(), 'src', 'data', 'podcast-episodes.json');

function parseArgs(): { radioDir: string } {
  const argv = process.argv.slice(2);
  let radioDir = path.join(process.cwd(), 'x-likes-radio');
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--radio-dir') radioDir = argv[++i] ?? radioDir;
  }
  return { radioDir };
}

/** front matter (--- で囲まれた flat YAML) を雑にパース */
function parseFrontMatter(md: string): Record<string, string> {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!kv) continue;
    let val = kv[2].trim();
    // 両端のクォートを外す
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[kv[1]] = val;
  }
  return out;
}

/** _config.yml から url + baseurl を取り出す */
function readSiteBase(radioDir: string): string {
  const cfg = fs.readFileSync(path.join(radioDir, '_config.yml'), 'utf8');
  const url = (cfg.match(/^url:\s*(.+)$/m)?.[1] ?? '').trim().replace(/\/$/, '');
  const baseurl = (cfg.match(/^baseurl:\s*(.+)$/m)?.[1] ?? '').trim().replace(/\/$/, '');
  return `${url}${baseurl}`;
}

/** slug "2024-11-11_to_2024-11-17" → {from, to} */
function parseSlugPeriod(slug: string): { from: string; to: string } | null {
  const m = slug.match(/^(\d{4}-\d{2}-\d{2})_to_(\d{4}-\d{2}-\d{2})$/);
  if (!m) return null;
  return { from: m[1], to: m[2] };
}

function toAbsoluteAudioUrl(audioFilePath: string, siteBase: string): string {
  if (audioFilePath.includes('://')) return audioFilePath; // 既に絶対 URL (R2/S3 移行後)
  return `${siteBase}${audioFilePath}`;
}

function main() {
  const { radioDir } = parseArgs();
  const postsDir = path.join(radioDir, '_posts');

  if (!fs.existsSync(postsDir)) {
    process.stderr.write(
      `[build-episode-index] ${postsDir} が無い (Vercel build 等)。既存 ${path.relative(process.cwd(), OUT_PATH)} を温存します。\n`,
    );
    if (!fs.existsSync(OUT_PATH)) {
      // 初回で json も無ければ空配列を置く (import エラー防止)
      fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
      fs.writeFileSync(OUT_PATH, '[]\n');
      process.stderr.write('[build-episode-index] 空の index を作成しました。\n');
    }
    return;
  }

  const siteBase = readSiteBase(radioDir);
  const files = fs.readdirSync(postsDir).filter((f) => f.endsWith('.md'));

  const episodes: Episode[] = [];
  for (const file of files) {
    const md = fs.readFileSync(path.join(postsDir, file), 'utf8');
    const fm = parseFrontMatter(md);

    // ファイル名 "YYYY-MM-DD-<slug>.md" から slug を取り出す (date prefix 10 文字 + ハイフン)
    const base = file.replace(/\.md$/, '');
    const slug = base.slice(11); // "2024-11-11-" の 11 文字を除く
    const period = parseSlugPeriod(slug);
    if (!period) {
      process.stderr.write(`[build-episode-index] slug から期間を解析できず skip: ${file}\n`);
      continue;
    }

    const audioPath = fm.audio_file_path ?? '';
    episodes.push({
      slug,
      from: period.from,
      to: period.to,
      title: fm.title ?? slug,
      description: fm.description ?? '',
      audio_url: toAbsoluteAudioUrl(audioPath, siteBase),
      page_url: `${siteBase}/episode/${slug}`,
      duration: fm.duration ?? '',
      size: Number(fm.audio_file_size ?? 0),
      date: (fm.date ?? '').slice(0, 10),
    });
  }

  // 新しい週が先頭
  episodes.sort((a, b) => (a.from < b.from ? 1 : a.from > b.from ? -1 : 0));

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(episodes, null, 2) + '\n');
  process.stderr.write(
    `[build-episode-index] ${episodes.length} エピソード → ${path.relative(process.cwd(), OUT_PATH)}\n`,
  );
  for (const e of episodes) {
    process.stderr.write(`  - ${e.from}〜${e.to}: ${e.title} (${e.duration})\n`);
  }
}

main();
