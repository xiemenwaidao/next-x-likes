/**
 * PodcastTweetBundle (stdin) を読み、固定 2 名ホスト (DEFAULT_HOSTS = ちひろ + ゆば)
 * の中で「その週の主導役と補佐役」を提案するスクリプト。
 *
 * Usage:
 *   pnpm tsx src/scripts/podcast/fetch-period.ts | pnpm tsx src/scripts/podcast/pick-persona.ts
 *
 * 出力 (stdout, JSON):
 *   {
 *     period: PeriodSpec,
 *     stats: CategoryStat[],
 *     candidates: PersonaCandidate[]    // 主導/補佐の入れ替え案 (2-3 案)
 *   }
 *
 * 設計:
 *   - ホストは DEFAULT_HOSTS の 2 名固定 (2026-05-29 確定)
 *   - top1 カテゴリが Persona.primary_interests に含まれる方を「主導 (lead)」に
 *   - 候補: (a) 推奨案 (主導+補佐)、(b) 入れ替え案、(c) 2 人均等案
 */
import {
  DEFAULT_HOSTS,
  leadHostForCategory,
  partnerOf,
  type PodcastPersona,
} from '../../data/podcast-personas';
import type {
  CategoryStat,
  PersonaCandidate,
  PersonaSelection,
  PodcastTweetBundle,
} from './types';

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (buf += chunk));
    process.stdin.on('end', () => resolve(buf));
    process.stdin.on('error', (e) => reject(e));
  });
}

function toSelection(p: PodcastPersona, weeklyRole: 'lead' | 'support'): PersonaSelection {
  return {
    id: p.id,
    name: p.name,
    gender: p.gender,
    role: p.role,
    voice_id: p.voice_id,
    voice_label: p.voice_label,
    primary_interests: p.primary_interests,
    weekly_role: weeklyRole,
  };
}

function computeStats(bundle: PodcastTweetBundle): CategoryStat[] {
  const counter = new Map<string, number>();
  for (const t of bundle.tweets) {
    const c = t.parent_category ?? 'other';
    counter.set(c, (counter.get(c) ?? 0) + 1);
  }
  const total = bundle.tweets.length || 1;
  return [...counter.entries()]
    .map(([category, count]) => ({ category, count, ratio: count / total }))
    .sort((a, b) => b.count - a.count);
}

function buildCandidates(stats: CategoryStat[]): PersonaCandidate[] {
  const top1 = stats[0];
  // top1 が誰の interests か → 主導 (lead) を決定
  const lead = top1 ? leadHostForCategory(top1.category) : DEFAULT_HOSTS[0];
  const support = partnerOf(lead);

  const top1Label = top1 ? `${top1.category} (${(top1.ratio * 100).toFixed(0)}%)` : 'データ少';
  const top2 = stats[1];
  const top2Label = top2 ? `${top2.category} (${(top2.ratio * 100).toFixed(0)}%)` : null;

  const candidates: PersonaCandidate[] = [
    {
      label: `${lead.name} 主導 + ${support.name} 補佐 (推奨)`,
      description: `${top1Label}${top2Label ? ' + ' + top2Label : ''}${
        top1 && lead.primary_interests.includes(top1.category)
          ? ` — ${lead.name} の得意領域なので主導役に`
          : ` — ${lead.name} がリード`
      }`,
      hosts: [toSelection(lead, 'lead'), toSelection(support, 'support')],
    },
    {
      label: `入れ替え: ${support.name} 主導 + ${lead.name} 補佐`,
      description: `逆パターン。${support.name} を前面にして、${lead.name} が裏で支える構成`,
      hosts: [toSelection(support, 'lead'), toSelection(lead, 'support')],
    },
    {
      label: `バランス: ${lead.name} + ${support.name} (主導なし、ほぼ 50/50)`,
      description: '主導/補佐を区別せず、2 人で対等に振り返る。話題が分散した週向け',
      hosts: [
        { ...toSelection(lead, 'lead'), weekly_role: undefined },
        { ...toSelection(support, 'support'), weekly_role: undefined },
      ],
    },
  ];

  return candidates;
}

async function main() {
  const raw = await readStdin();
  let bundle: PodcastTweetBundle;
  try {
    bundle = JSON.parse(raw) as PodcastTweetBundle;
  } catch (e) {
    process.stderr.write(`[pick-persona] failed to parse stdin as JSON: ${e}\n`);
    process.exit(1);
    return;
  }
  if (!bundle.tweets || !Array.isArray(bundle.tweets)) {
    process.stderr.write('[pick-persona] stdin is not a PodcastTweetBundle\n');
    process.exit(1);
    return;
  }

  const stats = computeStats(bundle);
  const candidates = buildCandidates(stats);

  process.stderr.write(
    `[pick-persona] top3=${stats
      .slice(0, 3)
      .map((s) => `${s.category}:${s.count}`)
      .join(' ')} candidates=${candidates.length} (lead=${candidates[0]?.hosts[0]?.name ?? 'n/a'})\n`,
  );
  process.stdout.write(JSON.stringify({ period: bundle.period, stats, candidates }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
