/**
 * PodcastTweetBundle (stdin) を読み、カテゴリ分布から動的にホスト候補 3-4 案を組み立てて stdout に出す。
 *
 * Usage:
 *   pnpm tsx src/scripts/podcast/fetch-period.ts | pnpm tsx src/scripts/podcast/pick-persona.ts
 *
 * 出力 (stdout, JSON):
 *   {
 *     stats: CategoryStat[],         // 全カテゴリの分布
 *     candidates: PersonaCandidate[] // 3-4 案 (AskUserQuestion に渡せる形)
 *   }
 *
 * 設計:
 *   - 上位カテゴリの比率で「1人ホスト / 2人ホスト」を切り替える
 *   - 2人の場合は必ず男女混合 (聴き分けやすさ + ユーザー要望の「IT 男 + ゲーム好き女」を満たす)
 *   - 候補は (a) 推奨案、(b) 1人ホストパターン、(c) 別の組み合わせ、(d) other フォールバック の 4 案
 */
import {
  PODCAST_PERSONAS,
  getPersonasForCategory,
  pickOppositeGenderHost,
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

function toSelection(p: PodcastPersona): PersonaSelection {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    gender: p.gender,
    role: p.role,
    voice_id: p.voice_id,
    voice_label: p.voice_label,
  };
}

function computeStats(bundle: PodcastTweetBundle): CategoryStat[] {
  const counter = new Map<string, number>();
  for (const t of bundle.tweets) {
    const c = t.parent_category ?? 'other';
    counter.set(c, (counter.get(c) ?? 0) + 1);
  }
  const total = bundle.tweets.length || 1;
  const stats: CategoryStat[] = [...counter.entries()]
    .map(([category, count]) => ({ category, count, ratio: count / total }))
    .sort((a, b) => b.count - a.count);
  return stats;
}

function buildCandidates(stats: CategoryStat[]): PersonaCandidate[] {
  const candidates: PersonaCandidate[] = [];
  const top1 = stats[0];
  const top2 = stats[1];

  if (!top1) {
    // 期間内 0 件
    candidates.push({
      label: 'other フォールバック (1人)',
      description: '今期はいいねが見つからなかったので、雑食 MC が短く回す',
      hosts: [toSelection(PODCAST_PERSONAS.other[0])],
    });
    return candidates;
  }

  const primary = getPersonasForCategory(top1.category)[0];
  const ratioTop1 = top1.ratio;
  const ratioTop2 = top2?.ratio ?? 0;

  // 推奨案 (一番上)
  if (ratioTop1 >= 0.55) {
    // 1 人ホスト推奨
    candidates.push({
      label: `1人ホスト: ${primary.name} (${top1.category})`,
      description: `${top1.category} が ${(ratioTop1 * 100).toFixed(0)}% を占めるので、専門ホスト 1 人で深掘り`,
      hosts: [toSelection(primary)],
    });
    // 代替: 2 人にしてみる
    if (top2) {
      const secondary = getPersonasForCategory(top2.category)[0];
      const adjusted =
        secondary.gender === primary.gender
          ? pickOppositeGenderHost(primary, top2.category)
          : secondary;
      candidates.push({
        label: `2人ホスト: ${primary.name} + ${adjusted.name}`,
        description: `${top1.category} メインに ${top2.category} の視点を ${adjusted.name} (${adjusted.voice_label}) で添える`,
        hosts: [toSelection(primary), toSelection(adjusted)],
      });
    }
  } else if (ratioTop2 >= 0.2 && top2) {
    // 2 人ホスト推奨
    const secondary = getPersonasForCategory(top2.category)[0];
    const adjusted =
      secondary.gender === primary.gender
        ? pickOppositeGenderHost(primary, top2.category)
        : secondary;
    candidates.push({
      label: `2人ホスト: ${primary.name} + ${adjusted.name}`,
      description: `${top1.category} (${(ratioTop1 * 100).toFixed(0)}%) と ${top2.category} (${(ratioTop2 * 100).toFixed(0)}%) の混合回。${adjusted.voice_label} がサブを担当`,
      hosts: [toSelection(primary), toSelection(adjusted)],
    });
    // 代替: 1 人ホストで主役だけに絞る
    candidates.push({
      label: `1人ホスト: ${primary.name} (${top1.category} のみ)`,
      description: `${primary.name} 1 人で全カテゴリ捌く。シンプル & 短め`,
      hosts: [toSelection(primary)],
    });
  } else {
    // 分散しすぎ → 雑食 MC + 上位カテゴリの専門家
    const other = PODCAST_PERSONAS.other[0];
    const adjusted =
      primary.gender === other.gender
        ? pickOppositeGenderHost(other, top1.category)
        : primary;
    candidates.push({
      label: `2人ホスト: ${other.name} + ${adjusted.name}`,
      description: `話題が分散しているので雑食 MC ${other.name} と ${top1.category} 担当 ${adjusted.name} の構成`,
      hosts: [toSelection(other), toSelection(adjusted)],
    });
    candidates.push({
      label: `1人ホスト: ${other.name}`,
      description: '雑食 MC が全部回す',
      hosts: [toSelection(other)],
    });
  }

  // 代替候補: 上位 2 カテゴリの「もう一つの voice」を試す
  if (top2 && PODCAST_PERSONAS[top1.category]?.length > 1) {
    const alt = PODCAST_PERSONAS[top1.category][1];
    const secondary = getPersonasForCategory(top2.category)[0];
    const adjusted =
      secondary.gender === alt.gender
        ? pickOppositeGenderHost(alt, top2.category)
        : secondary;
    candidates.push({
      label: `代替: ${alt.name} + ${adjusted.name}`,
      description: `${top1.category} の別 voice (${alt.voice_label}) で雰囲気を変える`,
      hosts: [toSelection(alt), toSelection(adjusted)],
    });
  }

  // フォールバック: 4 案に達していなければ other を埋める
  while (candidates.length < 3) {
    const other = PODCAST_PERSONAS.other[0];
    candidates.push({
      label: `フォールバック: ${other.name} 1人`,
      description: '安全策。雑食 MC が単独で回す',
      hosts: [toSelection(other)],
    });
  }

  return candidates.slice(0, 4);
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
      .join(' ')} candidates=${candidates.length}\n`,
  );
  process.stdout.write(JSON.stringify({ stats, candidates }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
