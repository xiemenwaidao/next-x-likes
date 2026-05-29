/**
 * 完成した PodcastScript の統計と推定 TTS コストを表示する検証スクリプト。
 *
 * Usage:
 *   pnpm tsx src/scripts/podcast/verify-script.ts --file <path>
 *   pnpm tsx src/scripts/podcast/verify-script.ts < script.json
 *
 * Output:
 *   - stderr: 人間可読サマリ
 *   - stdout: 機械可読 JSON
 */
import fs from 'node:fs';
import type { PodcastScript } from './types';

function loadInput(): string {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf('--file');
  if (fileIdx >= 0 && args[fileIdx + 1]) {
    return fs.readFileSync(args[fileIdx + 1], 'utf8');
  }
  return fs.readFileSync(0, 'utf8'); // stdin
}

function main() {
  const raw = loadInput();
  const script = JSON.parse(raw) as PodcastScript;

  let totalChars = 0;
  let totalLines = 0;
  const perSpeaker = new Map<string, number>();
  const perType = new Map<string, number>();
  for (const seg of script.segments) {
    perType.set(seg.type, (perType.get(seg.type) ?? 0) + 1);
    for (const line of seg.lines) {
      totalChars += line.text.length;
      totalLines += 1;
      perSpeaker.set(line.speaker, (perSpeaker.get(line.speaker) ?? 0) + line.text.length);
    }
  }

  // Japanese TTS のラフ推定:
  //   ~8 文字/秒で読み上げ (= 480 文字/分)
  //   ElevenLabs eleven_multilingual_v2: 1 文字 = 1 credit
  //   Creator plan ($22 = ~¥3,300 / 100,000 credit) → ¥0.033/credit
  const sec = Math.round(totalChars / 8);
  const min = sec / 60;
  const costJpy = Math.round((totalChars / 100_000) * 3300);

  // 人間可読サマリ
  const summary: string[] = [];
  summary.push(`period: ${script.period.from} 〜 ${script.period.to}`);
  summary.push(`hosts:  ${script.hosts.map((h) => `${h.name} (${h.voice_label})`).join(' + ')}`);
  const typeSummary = [...perType.entries()].map(([t, n]) => `${t}×${n}`).join(' ');
  summary.push(`segments: ${script.segments.length} (${typeSummary})`);
  summary.push(`lines:  ${totalLines}`);
  summary.push(`chars:  ${totalChars.toLocaleString()} → est. ${sec}s (${min.toFixed(1)} min)`);
  summary.push(`TTS:    ~¥${costJpy.toLocaleString()} (ElevenLabs Creator 換算 ${totalChars}/100,000 credit)`);
  summary.push('chars per host:');
  for (const [speaker, chars] of perSpeaker) {
    const pct = ((chars / totalChars) * 100).toFixed(1);
    summary.push(`  ${speaker}: ${chars.toLocaleString()} (${pct}%)`);
  }
  process.stderr.write(`[verify-script]\n  ${summary.join('\n  ')}\n`);

  // 機械可読
  process.stdout.write(
    JSON.stringify(
      {
        period: script.period,
        hosts: script.hosts.map((h) => ({ id: h.id, name: h.name, voice_label: h.voice_label })),
        chars: totalChars,
        lines: totalLines,
        segments: script.segments.length,
        segments_by_type: Object.fromEntries(perType),
        estimated_duration_sec: sec,
        estimated_duration_min: parseFloat(min.toFixed(1)),
        estimated_tts_cost_jpy: costJpy,
        chars_per_speaker: Object.fromEntries(perSpeaker),
      },
      null,
      2,
    ),
  );
}

try {
  main();
} catch (e) {
  console.error(e);
  process.exit(1);
}
