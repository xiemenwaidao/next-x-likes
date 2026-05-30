/**
 * TTS で生成した個別 line mp3 を、pause + BGM ducking + LUFS normalize で
 * 1 本の podcast mp3 に mix する。
 *
 * Usage:
 *   pnpm tsx src/scripts/podcast/mix-audio.ts \
 *     --script data/podcasts/scripts/<slug>.script.json \
 *     --tts-result /tmp/podcast-tts-result.json \
 *     --out <output_path>.mp3 \
 *     [--bgm public/podcasts/bgm/bed.mp3] \
 *     [--bgm-volume 0.12] \
 *     [--no-bgm] \
 *     [--keep-speech]
 *
 * Pass 1: 各 line mp3 を pause_after_ms 付きで 1 本の speech.mp3 に concat
 * Pass 2: speech.mp3 + BGM (loop) を sidechaincompress で ducking、loudnorm で
 *         -16 LUFS に normalize、libmp3lame 128kbps でエンコード
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { PodcastScript } from './types';

type TtsLineRef = {
  speaker: string;
  hash: string;
  path: string;
  status: 'cached' | 'fetched' | 'error' | 'skipped';
};

type TtsResult = {
  total: number;
  segments: Array<{
    type: string;
    title: string | null;
    lines: TtsLineRef[];
  }>;
};

type Args = {
  scriptPath: string;
  ttsResultPath: string;
  outPath: string;
  bgmPath: string;
  bgmVolume: number;
  interludeVolume: number;
  noBgm: boolean;
  keepSpeech: boolean;
  introPadSec: number;
  outroPadSec: number;
  interSegmentPadSec: number;
  fadeOutSec: number;
  chaptersOut: string | null; // 章目次 (start 秒) を書き出す JSON path
  chaptersOnly: boolean; // 章目次だけ計算して ffmpeg encode をスキップ (既存回バックフィル用)
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let scriptPath = '';
  let ttsResultPath = '';
  let outPath = '';
  let bgmPath = path.join(process.cwd(), 'public', 'podcasts', 'bgm', 'bed.mp3');
  let bgmVolume = 0.12;
  let interludeVolume = 0.25; // 間奏 (intro/章間/outro) での BGM 持ち上げ音量
  let noBgm = false;
  let keepSpeech = false;
  // ラジオっぽい「間」: 冒頭は BGM 間奏で立ち上げ、末尾は余韻、章間は間奏
  let introPadSec = 5;
  let outroPadSec = 10;
  let interSegmentPadSec = 4;
  let fadeOutSec = 4; // 末尾フェードアウト秒 (ブツ切れ防止 + 余韻)
  let chaptersOut: string | null = null;
  let chaptersOnly = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--script') scriptPath = argv[++i] ?? '';
    else if (argv[i] === '--tts-result') ttsResultPath = argv[++i] ?? '';
    else if (argv[i] === '--out') outPath = argv[++i] ?? '';
    else if (argv[i] === '--chapters-out') chaptersOut = argv[++i] ?? null;
    else if (argv[i] === '--chapters-only') chaptersOnly = true;
    else if (argv[i] === '--bgm') bgmPath = argv[++i] ?? '';
    else if (argv[i] === '--bgm-volume') bgmVolume = parseFloat(argv[++i] ?? '0.12');
    else if (argv[i] === '--interlude-volume') interludeVolume = parseFloat(argv[++i] ?? '0.25');
    else if (argv[i] === '--no-bgm') noBgm = true;
    else if (argv[i] === '--keep-speech') keepSpeech = true;
    else if (argv[i] === '--intro-pad') introPadSec = parseFloat(argv[++i] ?? '5');
    else if (argv[i] === '--outro-pad') outroPadSec = parseFloat(argv[++i] ?? '10');
    else if (argv[i] === '--inter-segment-pad') interSegmentPadSec = parseFloat(argv[++i] ?? '4');
    else if (argv[i] === '--fade-out') fadeOutSec = parseFloat(argv[++i] ?? '4');
  }
  // --chapters-only のときは encode しないので --out 不要
  if (!scriptPath || !ttsResultPath || (!outPath && !chaptersOnly)) {
    process.stderr.write(
      'Usage: mix-audio.ts --script <path> --tts-result <path> --out <path> [--bgm <path>] [--bgm-volume 0.12] [--interlude-volume 0.25] [--no-bgm] [--keep-speech] [--intro-pad 5] [--outro-pad 10] [--inter-segment-pad 4] [--fade-out 4] [--chapters-out <path>] [--chapters-only]\n',
    );
    process.exit(1);
  }
  return {
    scriptPath,
    ttsResultPath,
    outPath,
    bgmPath,
    bgmVolume,
    interludeVolume,
    noBgm,
    keepSpeech,
    introPadSec,
    outroPadSec,
    interSegmentPadSec,
    fadeOutSec,
    chaptersOut,
    chaptersOnly,
  };
}

function run(cmd: string, args: string[]): void {
  // ログには短縮表記 (filter_complex は長いので末尾 60 字だけ)
  const preview = args
    .map((a) => (a.length > 80 ? a.slice(0, 60) + '...' : a))
    .map((a) => (a.includes(' ') && !a.startsWith('[') ? `"${a}"` : a))
    .join(' ');
  process.stderr.write(`[mix] $ ${cmd} ${preview}\n`);
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) {
    process.stderr.write(`[mix] failed with status ${r.status}\n`);
    process.exit(r.status ?? 1);
  }
}

// boostAfter: この line の後ろの pause が「間奏」(章間) で、BGM を持ち上げる区間
type MixItem = { path: string; pauseMs: number; boostAfter: boolean };

type PadConfig = {
  introPadSec: number;
  outroPadSec: number;
  interSegmentPadSec: number;
};

function collectItems(script: PodcastScript, tts: TtsResult, pad: PadConfig): MixItem[] {
  const items: MixItem[] = [];
  const lastSegIdx = tts.segments.length - 1;
  for (let si = 0; si < tts.segments.length; si++) {
    const ttsSeg = tts.segments[si];
    const scriptSeg = script.segments[si];
    if (!scriptSeg) continue;
    const segItemStart = items.length;
    for (let li = 0; li < ttsSeg.lines.length; li++) {
      const ttsLine = ttsSeg.lines[li];
      const scriptLine = scriptSeg.lines[li];
      if (!scriptLine) continue;
      if (ttsLine.status === 'skipped' || ttsLine.status === 'error') {
        process.stderr.write(
          `[mix] skip seg ${si} line ${li} (status=${ttsLine.status})\n`,
        );
        continue;
      }
      if (!ttsLine.path || !fs.existsSync(ttsLine.path)) {
        process.stderr.write(`[mix] skip seg ${si} line ${li} (missing path: ${ttsLine.path})\n`);
        continue;
      }
      items.push({
        path: ttsLine.path,
        pauseMs: scriptLine.pause_after_ms ?? 200,
        boostAfter: false,
      });
    }
    // この segment が 1 件でも line を出したなら、segment 末尾に間奏を足す。
    // 最終 segment (= outro) の後ろには inter-segment pad を入れない (outro pad は別途末尾で)。
    if (items.length > segItemStart && si < lastSegIdx && pad.interSegmentPadSec > 0) {
      const last = items[items.length - 1];
      last.pauseMs += Math.round(pad.interSegmentPadSec * 1000);
      last.boostAfter = true; // 章間 = BGM 持ち上げ区間
    }
  }
  return items;
}

function probeDurationSec(filePath: string): number {
  const r = spawnSync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'csv=p=0',
    filePath,
  ]);
  const d = parseFloat((r.stdout?.toString() ?? '').trim());
  return Number.isFinite(d) ? d : 0;
}

// 各 line mp3 の実時間を測り、BGM を持ち上げる「間奏区間」[start,end] を計算する。
// TTS の自然な前後無音で timeline がずれるため、scripted 値ではなく実測でタイムラインを積む。
//   - intro pad: [0, introPadSec]
//   - 章間 (boostAfter): その line の trailing pause 区間
//   - outro pad: [末尾, +outroPadSec]
function computeBoostIntervals(
  items: MixItem[],
  pad: PadConfig,
): { intervals: Array<[number, number]>; totalSec: number } {
  const intervals: Array<[number, number]> = [];
  let t = 0;
  if (pad.introPadSec > 0) {
    intervals.push([0, pad.introPadSec]);
    t += pad.introPadSec;
  }
  for (const item of items) {
    t += probeDurationSec(item.path);
    const pauseSec = item.pauseMs / 1000;
    if (item.boostAfter && pauseSec > 0) {
      intervals.push([t, t + pauseSec]);
    }
    t += pauseSec;
  }
  if (pad.outroPadSec > 0) {
    intervals.push([t, t + pad.outroPadSec]);
    t += pad.outroPadSec;
  }
  return { intervals, totalSec: t };
}

type Chapter = { t: number; label: string };

function chapterLabel(type: string | undefined, title: string | null | undefined): string {
  if (type === 'intro') return 'オープニング';
  if (type === 'outro') return 'エンディング';
  // chapter: 先頭の "1. " 連番プレフィックスを除いて見出しだけにする
  return (title ?? 'チャプター').replace(/^\s*\d+\.\s*/, '').trim() || 'チャプター';
}

// 各 segment の「最終 mp3 上での開始秒」を算出して章目次にする。
// collectItems / computeBoostIntervals と同じタイムライン (実測 duration + pause + 章間 pad) を辿る。
function computeChapters(script: PodcastScript, tts: TtsResult, pad: PadConfig): Chapter[] {
  const chapters: Chapter[] = [];
  const lastSegIdx = tts.segments.length - 1;
  let t = pad.introPadSec > 0 ? pad.introPadSec : 0; // 先頭 intro pad
  for (let si = 0; si < tts.segments.length; si++) {
    const ttsSeg = tts.segments[si];
    const scriptSeg = script.segments[si];
    if (!scriptSeg) continue;
    const valid: Array<{ path: string; pauseMs: number }> = [];
    for (let li = 0; li < ttsSeg.lines.length; li++) {
      const ttsLine = ttsSeg.lines[li];
      const scriptLine = scriptSeg.lines[li];
      if (!scriptLine) continue;
      if (ttsLine.status === 'skipped' || ttsLine.status === 'error') continue;
      if (!ttsLine.path || !fs.existsSync(ttsLine.path)) continue;
      valid.push({ path: ttsLine.path, pauseMs: scriptLine.pause_after_ms ?? 200 });
    }
    if (valid.length === 0) continue;
    // この segment の開始時刻 = 現在の t
    chapters.push({ t: Math.round(t), label: chapterLabel(ttsSeg.type, ttsSeg.title) });
    for (let k = 0; k < valid.length; k++) {
      t += probeDurationSec(valid[k].path);
      let pauseMs = valid[k].pauseMs;
      // collectItems と同じく、非最終 segment の最終 line に章間 pad を上乗せ
      if (k === valid.length - 1 && si < lastSegIdx && pad.interSegmentPadSec > 0) {
        pauseMs += Math.round(pad.interSegmentPadSec * 1000);
      }
      t += pauseMs / 1000;
    }
  }
  // 先頭 (オープニング) は冒頭 pad ごと頭出しできるよう 0 に丸める
  if (chapters.length > 0) chapters[0].t = 0;
  return chapters;
}

// Pass 1: 各 line mp3 を pause 付きで concat → speech.mp3
// 先頭に introPad、末尾に outroPad ぶんの無音を入れて「ラジオの間」を作る
// (Pass 2 で BGM を全編に流すので、この無音区間 = BGM のみが聞こえる空間になる)
function buildSpeech(items: MixItem[], speechPath: string, pad: PadConfig): void {
  const inputs: string[] = [];
  for (const item of items) {
    inputs.push('-i', item.path);
  }

  const filters: string[] = [];
  const labels: string[] = [];

  // intro pad (先頭無音)
  if (pad.introPadSec > 0) {
    filters.push(`aevalsrc=0:d=${pad.introPadSec.toFixed(3)}:s=44100:c=stereo[intro_pad]`);
    labels.push('[intro_pad]');
  }

  for (let i = 0; i < items.length; i++) {
    filters.push(
      `[${i}:a]aresample=44100,aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS[s${i}]`,
    );
    labels.push(`[s${i}]`);
    if (items[i].pauseMs > 0) {
      const dur = (items[i].pauseMs / 1000).toFixed(3);
      filters.push(`aevalsrc=0:d=${dur}:s=44100:c=stereo[p${i}]`);
      labels.push(`[p${i}]`);
    }
  }

  // outro pad (末尾無音)
  if (pad.outroPadSec > 0) {
    filters.push(`aevalsrc=0:d=${pad.outroPadSec.toFixed(3)}:s=44100:c=stereo[outro_pad]`);
    labels.push('[outro_pad]');
  }

  filters.push(`${labels.join('')}concat=n=${labels.length}:v=0:a=1[speech]`);

  const ffmpegArgs = [
    '-y',
    ...inputs,
    '-filter_complex',
    filters.join(';'),
    '-map',
    '[speech]',
    '-c:a',
    'libmp3lame',
    '-b:a',
    '128k',
    speechPath,
  ];
  run('ffmpeg', ffmpegArgs);
}

// 間奏区間で BGM を base → boost に持ち上げる時間制御 volume 式を組み立てる。
// 各区間 [s,e] を台形 (ramp 0.5s で fade in/out) のパルスにして、重ならない前提で総和。
//   volume(t) = base + (boost - base) * Σ trapezoid_i(t)
//   trapezoid_i(t) = max(0, min(1, (t-s)/r, (e-t)/r))
function buildBgmVolumeExpr(
  intervals: Array<[number, number]>,
  baseVolume: number,
  boostVolume: number,
): string {
  const r = 0.5; // ramp 秒
  if (intervals.length === 0) return `${baseVolume}`;
  // ffmpeg expr の min()/max() は 2 引数限定なのでネストする。
  // trapezoid = max(0, min(min(1, (t-s)/r), (e-t)/r))
  const pulses = intervals
    .map(([s, e]) => {
      const ss = s.toFixed(2);
      const ee = e.toFixed(2);
      return `max(0\\,min(min(1\\,(t-${ss})/${r})\\,(${ee}-t)/${r}))`;
    })
    .join('+');
  const delta = (boostVolume - baseVolume).toFixed(3);
  // ffmpeg が初期化時に t=NAN で 1 度評価することがあり「Invalid value NaN」警告 +
  // 1 フレーム無音化を招く。isnan(t) のときは baseVolume を返してガードする。
  return `if(isnan(t)\\,${baseVolume}\\,${baseVolume}+${delta}*(${pulses}))`;
}

// Pass 2: speech + BGM mix (ducking + interlude boost + loudnorm + 末尾 fadeout)
function mixWithBgm(
  speechPath: string,
  bgmPath: string,
  bgmVolume: number,
  boostVolume: number,
  boostIntervals: Array<[number, number]>,
  totalSec: number,
  fadeOutSec: number,
  outPath: string,
): void {
  // sidechaincompress: メイン入力 (BGM) を、sidechain (speech) のレベルに応じて自動圧縮
  //   threshold=0.03: sidechain がこの level を超えたら圧縮開始 (-30dB 相当)
  //   ratio=4:        4:1 圧縮 (発話時 BGM を約 -12dB さらに下げる)
  //   attack=20ms:    圧縮の立ち上がり (発話開始で素早く ducking)
  //   release=300ms:  発話終了後 300ms かけてゆっくり戻る (自然)
  // volume(eval=frame): 間奏区間 (intro/章間/outro) だけ BGM を boost に持ち上げる。
  //   間奏区間には speech が無いので sidechain は ducking せず、boost 音量がそのまま前に出る。
  // afade: 末尾 fadeOutSec 秒を 0 へフェードして余韻で締める (ブツ切れ防止)。
  const volExpr = buildBgmVolumeExpr(boostIntervals, bgmVolume, boostVolume);
  const fadeStart = Math.max(0, totalSec - fadeOutSec).toFixed(2);
  const filterParts = [
    '[0:a]aresample=44100,aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS[speech]',
    `[1:a]aresample=44100,aformat=channel_layouts=stereo,volume=eval=frame:volume='${volExpr}',asetpts=PTS-STARTPTS[bed]`,
    '[bed][speech]sidechaincompress=threshold=0.03:ratio=4:attack=20:release=300[ducked]',
    '[ducked][speech]amix=inputs=2:duration=first:dropout_transition=0[mix]',
    '[mix]loudnorm=I=-16:LRA=11:TP=-1.5[normed]',
  ];
  if (fadeOutSec > 0) {
    filterParts.push(`[normed]afade=t=out:st=${fadeStart}:d=${fadeOutSec.toFixed(2)}[out]`);
  } else {
    filterParts.push('[normed]anull[out]');
  }
  const filter = filterParts.join(';');

  const ffmpegArgs = [
    '-y',
    '-i',
    speechPath,
    '-stream_loop',
    '-1',
    '-i',
    bgmPath,
    '-filter_complex',
    filter,
    '-map',
    '[out]',
    '-c:a',
    'libmp3lame',
    '-b:a',
    '128k',
    '-shortest',
    outPath,
  ];
  run('ffmpeg', ffmpegArgs);
}

// no-bgm: speech に loudnorm だけかけて出力
function speechOnly(speechPath: string, outPath: string): void {
  const ffmpegArgs = [
    '-y',
    '-i',
    speechPath,
    '-af',
    'loudnorm=I=-16:LRA=11:TP=-1.5',
    '-c:a',
    'libmp3lame',
    '-b:a',
    '128k',
    outPath,
  ];
  run('ffmpeg', ffmpegArgs);
}

function main() {
  const args = parseArgs();

  const script = JSON.parse(fs.readFileSync(args.scriptPath, 'utf8')) as PodcastScript;
  const tts = JSON.parse(fs.readFileSync(args.ttsResultPath, 'utf8')) as TtsResult;

  const pad: PadConfig = {
    introPadSec: args.introPadSec,
    outroPadSec: args.outroPadSec,
    interSegmentPadSec: args.interSegmentPadSec,
  };

  const items = collectItems(script, tts, pad);
  if (items.length === 0) {
    process.stderr.write('[mix] no valid lines to mix (all skipped/errored)\n');
    process.exit(1);
  }

  // 章目次 (各 segment の開始秒) を算出
  const chapters = computeChapters(script, tts, pad);
  if (args.chaptersOut) {
    fs.mkdirSync(path.dirname(args.chaptersOut), { recursive: true });
    fs.writeFileSync(args.chaptersOut, JSON.stringify(chapters, null, 2));
    process.stderr.write(`[mix] chapters → ${args.chaptersOut} (${chapters.length} 章)\n`);
  }
  if (args.chaptersOnly) {
    // encode せず章目次だけ出して終了 (既存回バックフィル用)
    process.stdout.write(JSON.stringify({ chapters }, null, 2));
    process.stderr.write('[mix] chapters-only モード: encode をスキップして終了\n');
    return;
  }
  process.stderr.write(
    `[mix] script=${args.scriptPath} tts=${args.ttsResultPath} out=${args.outPath} items=${items.length} pad(intro=${pad.introPadSec}s outro=${pad.outroPadSec}s inter=${pad.interSegmentPadSec}s)\n`,
  );

  fs.mkdirSync(path.dirname(args.outPath), { recursive: true });

  const speechPath = path.join('/tmp', `podcast-speech-${process.pid}.mp3`);

  process.stderr.write(`[mix] Pass 1: concat ${items.length} segments with pauses + intro/outro pads → ${speechPath}\n`);
  buildSpeech(items, speechPath, pad);
  const speechStat = fs.statSync(speechPath);
  process.stderr.write(
    `[mix] speech ready: ${(speechStat.size / 1024 / 1024).toFixed(1)} MB\n`,
  );

  if (args.noBgm) {
    process.stderr.write(`[mix] Pass 2 (no-bgm): loudnorm only → ${args.outPath}\n`);
    speechOnly(speechPath, args.outPath);
  } else if (!fs.existsSync(args.bgmPath)) {
    process.stderr.write(
      `[mix] BGM ${args.bgmPath} not found, falling back to no-bgm\n`,
    );
    speechOnly(speechPath, args.outPath);
  } else {
    process.stderr.write(`[mix] probing line durations for interlude timing...\n`);
    const { intervals: boostIntervals, totalSec } = computeBoostIntervals(items, pad);
    process.stderr.write(
      `[mix] Pass 2: mix with BGM (base=${args.bgmVolume} interlude=${args.interludeVolume}, ducking) ` +
        `${boostIntervals.length} interludes, total≈${totalSec.toFixed(0)}s, fadeout=${args.fadeOutSec}s → ${args.outPath}\n`,
    );
    for (const [s, e] of boostIntervals) {
      process.stderr.write(`[mix]   interlude ${s.toFixed(1)}s〜${e.toFixed(1)}s (${(e - s).toFixed(1)}s)\n`);
    }
    mixWithBgm(
      speechPath,
      args.bgmPath,
      args.bgmVolume,
      args.interludeVolume,
      boostIntervals,
      totalSec,
      args.fadeOutSec,
      args.outPath,
    );
  }

  if (!args.keepSpeech) {
    try {
      fs.unlinkSync(speechPath);
    } catch {
      /* noop */
    }
  }

  const stat = fs.statSync(args.outPath);
  process.stdout.write(
    JSON.stringify(
      {
        out: args.outPath,
        size: stat.size,
        bgm: args.noBgm ? null : args.bgmPath,
        bgm_volume: args.noBgm ? null : args.bgmVolume,
        chapters,
      },
      null,
      2,
    ),
  );
  process.stderr.write(
    `[mix] done → ${args.outPath} (${(stat.size / 1024 / 1024).toFixed(1)} MB)\n`,
  );
}

main();
