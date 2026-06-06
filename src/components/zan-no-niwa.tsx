/**
 * ZanNoNiwa — 「讚の庭」トップアニメ
 * ---------------------------------------------------------------
 * 集讚館（z.xiemen.me）のトップに置く、直近30日のいいねで育つ桜。
 *   - 幹/枝   = 経過日数（elapsedDays / 30）で強制成長
 *   - 開花量  = いいね総数（totalLikes）で間引き（少=枯れ木 / 多=満開）
 *   - 花の色  = カテゴリ（categories の hue）。OFF なら桃×金
 *   - 活力    = いいね/日 → 月末の判定（大木⇄枯れ木）と色の鮮やかさ
 *   - クリック= その地点を起点に枝が揺れ、花びらが散る
 *
 * design_handoff_zan_no_niwa/reference-implementation/ZanNoNiwa.jsx を
 * 本プロジェクト（TypeScript / app router）の規約へ写したもの。
 * 数値（しきい値・配色）はすべて先頭の定数に集約。
 */
'use client';

import { useEffect, useRef } from 'react';

// ── 実サイト src/data/categories.ts の hue をそのまま（GARDEN_CATS 順）──
export const GARDEN_CATS = [
  { name: 'tech-ai', hue: 250 },
  { name: 'programming', hue: 290 },
  { name: 'design', hue: 320 },
  { name: 'product-business', hue: 30 },
  { name: 'art-creative', hue: 350 },
  { name: 'gaming', hue: 180 },
  { name: 'culture-entertainment', hue: 70 },
  { name: 'science-learning', hue: 200 },
  { name: 'news-society', hue: 20 },
  { name: 'lifestyle', hue: 130 },
  { name: 'other', hue: 240 },
] as const;

// ── チューニング定数（仕様の唯一の真実）──
const CFG = {
  W: 860,
  H: 250, // キャンバス論理サイズ
  POT_HUE: '228,87,46', // 鉢の色（朱）
  C_PINK: '#ff5d97', // 桜の桃
  C_GOLD: '#e8b84b', // 金しべ
  DAYS_IN_CYCLE: 30, // 成長の正規化（経過日数 / 30）。月末で樹形完成
  DEPTH_MIN: 3,
  DEPTH_MAX: 8, // 経過日数による枝の深さ
  TRUNK_MIN: 26,
  TRUNK_GROW: 30,
  SWAY: 0.18, // 風の基本振れ
  // ── 以下 2 つは実データ（月別 65〜325 件 / 月）で較正済み ──
  BLOOM_FULL: 320, // 今月の総数がこの値で開花率 100%（≒最盛月で満開）
  PACE_FOR_GREAT: 10, // いいね/日 がこの値で「大木」(活力=1)。月 ≒300 件で豊作
};

// ── 純関数ヘルパ ──
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const ease = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

function hashU(id: number): number {
  let x = (id * 2654435761) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519);
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}

function pickCat(u: number, weights: number[], sum: number): number {
  let acc = 0;
  for (let k = 0; k < weights.length; k++) {
    acc += weights[k] / sum;
    if (u <= acc) return k;
  }
  return weights.length - 1;
}

function heartPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  rot = 0,
) {
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.scale(s / 16, s / 16);
  ctx.beginPath();
  ctx.moveTo(0, 4.6);
  ctx.bezierCurveTo(-7.4, -2.2, -6.2, -10.4, 0, -5.4);
  ctx.bezierCurveTo(6.2, -10.4, 7.4, -2.2, 0, 4.6);
  ctx.closePath();
  ctx.restore();
}

type BlossomPt = [number, number, number]; // [x, y, id]

interface Petal {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  s: number;
  a: number;
  hue: number | null;
}

interface ZanState {
  elapsedDays: number;
  totalLikes: number;
  categoryWeights: number[];
  categoryColor: boolean;
}

export interface ZanNoNiwaProps {
  /** 経過日数（1..30）。枝の深さ・幹長を決める */
  elapsedDays?: number;
  /** 直近30日のいいね総数。開花量を決める */
  totalLikes?: number;
  /** 11要素のカテゴリ件数（GARDEN_CATS 順）。花色の比率 */
  categoryWeights?: number[];
  /** true=カテゴリ色 / false=桃×金 */
  categoryColor?: boolean;
  /** 表示幅（CSS px）。未指定なら親コンテナ幅に追従（width:100%） */
  width?: number;
}

export default function ZanNoNiwa({
  elapsedDays = 30,
  totalLikes = 320,
  categoryWeights = [30, 16, 8, 6, 5, 2, 9, 5, 4, 13, 2],
  categoryColor = true,
  width,
}: ZanNoNiwaProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  // 最新 props を ref 経由で描画ループへ渡す（再マウントせずに反映）
  const stateRef = useRef<ZanState>({
    elapsedDays,
    totalLikes,
    categoryWeights,
    categoryColor,
  });
  stateRef.current = { elapsedDays, totalLikes, categoryWeights, categoryColor };

  useEffect(() => {
    const { W, H } = CFG;
    const cv = ref.current;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = W * dpr;
    cv.height = H * dpr;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const baseX = W / 2;
    const baseY = H - 26;
    const petals: Petal[] = [];
    let raf = 0;
    let last = performance.now();
    let t = 0;
    let shake: { x: number; y: number; t0: number; spawned: boolean } | null =
      null;
    let shAge = 999;
    let shEnv = 0;
    let blossomPts: BlossomPt[] = [];
    const reduce = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    function onDown(e: PointerEvent) {
      if (!cv) return;
      const r = cv.getBoundingClientRect();
      shake = {
        x: (e.clientX - r.left) * (W / r.width),
        y: (e.clientY - r.top) * (H / r.height),
        t0: t,
        spawned: false,
      };
    }
    cv.addEventListener('pointerdown', onDown);

    function branch(
      x: number,
      y: number,
      ang: number,
      len: number,
      depth: number,
      maxDepth: number,
      sway: number,
      id: number,
    ) {
      if (depth > maxDepth || len < 4) {
        if (depth >= maxDepth - 1) blossomPts.push([x, y, id]);
        return;
      }
      let sw = Math.sin(t * 1.1 + depth * 0.7) * sway * (depth / maxDepth);
      if (shEnv > 0.002 && shake) {
        const prox = clamp(1 - Math.hypot(x - shake.x, y - shake.y) / 300, 0, 1);
        sw +=
          shEnv *
          0.6 *
          prox *
          Math.sin(shAge * 13) *
          (0.3 + depth / maxDepth) *
          Math.sign(x - shake.x || 1);
      }
      const a = ang + sw;
      const x2 = x + Math.cos(a) * len;
      const y2 = y + Math.sin(a) * len;
      ctx!.strokeStyle = `rgba(150,120,95,${0.55 + 0.4 * (1 - depth / maxDepth)})`;
      ctx!.lineWidth = Math.max(1, (maxDepth - depth) * 1.5);
      ctx!.lineCap = 'round';
      ctx!.beginPath();
      ctx!.moveTo(x, y);
      ctx!.lineTo(x2, y2);
      ctx!.stroke();
      const spread = 0.5 + 0.12 * Math.sin(depth);
      branch(x2, y2, a - spread, len * 0.76, depth + 1, maxDepth, sway, id * 4 + 1);
      branch(x2, y2, a + spread, len * 0.72, depth + 1, maxDepth, sway, id * 4 + 2);
      if (depth % 2 === 0)
        branch(x2, y2, a + 0.04, len * 0.6, depth + 2, maxDepth, sway, id * 4 + 3);
    }

    function mkPetal(
      p: BlossomPt,
      S: ZanState,
      weights: number[],
      sum: number,
    ): Petal {
      return {
        x: p[0],
        y: p[1],
        vx: (Math.random() - 0.5) * 0.7,
        vy: -0.3 - Math.random() * 0.45,
        r: 0,
        s: 5 + Math.random() * 4,
        a: 1,
        hue: S.categoryColor
          ? GARDEN_CATS[pickCat(hashU(p[2]), weights, sum)].hue
          : null,
      };
    }

    function draw() {
      const S = stateRef.current;
      const day = clamp(S.elapsedDays, 0, CFG.DAYS_IN_CYCLE);
      const total = Math.max(0, S.totalLikes);
      const weights = S.categoryWeights;
      const sum = weights.reduce((a, b) => a + b, 0) || 1;

      ctx!.clearRect(0, 0, W, H);
      // 地面
      ctx!.strokeStyle = 'rgba(255,255,255,.10)';
      ctx!.lineWidth = 1.5;
      ctx!.beginPath();
      ctx!.moveTo(60, baseY + 8);
      ctx!.lineTo(W - 60, baseY + 8);
      ctx!.stroke();
      // 鉢
      ctx!.fillStyle = `rgba(${CFG.POT_HUE},.85)`;
      ctx!.beginPath();
      ctx!.roundRect(baseX - 34, baseY + 8, 68, 20, 3);
      ctx!.fill();
      ctx!.fillStyle = 'rgba(0,0,0,.25)';
      ctx!.beginPath();
      ctx!.roundRect(baseX - 38, baseY + 4, 76, 8, 3);
      ctx!.fill();

      shAge = shake ? t - shake.t0 : 999;
      shEnv = shake ? Math.exp(-shAge * 2.6) : 0;
      if (shake && shAge > 2.6) shake = null;

      const eased = ease(clamp(day / CFG.DAYS_IN_CYCLE, 0, 1));
      const maxDepth =
        CFG.DEPTH_MIN + Math.round(eased * (CFG.DEPTH_MAX - CFG.DEPTH_MIN));
      const trunk = CFG.TRUNK_MIN + eased * CFG.TRUNK_GROW;
      blossomPts = [];
      branch(baseX, baseY + 8, -Math.PI / 2, trunk, 0, maxDepth, reduce ? 0 : CFG.SWAY, 1);

      const bloom = eased;
      const bloomFrac = clamp(total / CFG.BLOOM_FULL, 0, 1);
      const blooming: BlossomPt[] = [];
      for (let i = 0; i < blossomPts.length; i++) {
        const p = blossomPts[i];
        const id = p[2];
        if (hashU(id ^ 0x9e37) > bloomFrac) continue;
        blooming.push(p);
        const s = (6 + 4 * Math.sin(t * 2 + i)) * (0.4 + 0.6 * bloom);
        if (s < 1) continue;
        heartPath(ctx!, p[0], p[1], s);
        ctx!.fillStyle = S.categoryColor
          ? `oklch(73% 0.18 ${GARDEN_CATS[pickCat(hashU(id), weights, sum)].hue})`
          : hashU(id ^ 0x55) < 0.25
            ? CFG.C_GOLD
            : CFG.C_PINK;
        ctx!.globalAlpha = 0.5 + 0.5 * bloom;
        ctx!.fill();
        ctx!.globalAlpha = 1;
      }

      // クリックで近くの花を散らす
      if (shake && !shake.spawned) {
        shake.spawned = true;
        for (const p of blooming) {
          if (
            Math.hypot(p[0] - shake.x, p[1] - shake.y) < 120 &&
            Math.random() < 0.8
          )
            petals.push(mkPetal(p, S, weights, sum));
        }
      }
      // 自然な花吹雪
      if (!reduce && bloom > 0.5 && Math.random() < 0.06 && blooming.length)
        petals.push(
          mkPetal(
            blooming[(Math.random() * blooming.length) | 0],
            S,
            weights,
            sum,
          ),
        );

      for (let i = petals.length - 1; i >= 0; i--) {
        const p = petals[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.004;
        p.r += 0.04;
        p.a -= 0.006;
        if (p.a <= 0) {
          petals.splice(i, 1);
          continue;
        }
        ctx!.save();
        ctx!.translate(p.x, p.y);
        ctx!.rotate(p.r);
        heartPath(ctx!, 0, 0, p.s);
        ctx!.fillStyle = p.hue == null ? CFG.C_PINK : `oklch(73% 0.18 ${p.hue})`;
        ctx!.globalAlpha = p.a;
        ctx!.fill();
        ctx!.restore();
        ctx!.globalAlpha = 1;
      }
    }

    function loop(now: number) {
      t += Math.min(0.05, (now - last) / 1000);
      last = now;
      draw();
      raf = requestAnimationFrame(loop);
    }
    draw();
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      cv.removeEventListener('pointerdown', onDown);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label="今月のいいねで育つ桜の木"
      style={{
        display: 'block',
        width: width ?? '100%',
        height: width ? (width / CFG.W) * CFG.H : 'auto',
        aspectRatio: width ? undefined : `${CFG.W} / ${CFG.H}`,
        cursor: 'pointer',
      }}
    />
  );
}

/** 月末判定（大木⇄枯れ木）— バナーの文言に使う */
export function verdict(
  elapsedDays: number,
  totalLikes: number,
): { label: string; color: string; vit: number } {
  const vit = clamp(
    totalLikes / Math.max(1, elapsedDays) / CFG.PACE_FOR_GREAT,
    0,
    1,
  );
  if (elapsedDays >= 28 && vit >= 0.9)
    return { label: '大木 — 今月は豊作', color: '#7fd6a0', vit };
  if (vit >= 0.85) return { label: 'のびやかな大木へ', color: '#7fd6a0', vit };
  if (vit >= 0.6) return { label: '健やかに茂る', color: '#bcd98a', vit };
  if (vit >= 0.32) return { label: 'ほどほどの繁り', color: '#e8b84b', vit };
  return {
    label: elapsedDays >= 28 ? '枯れ木 — 今月は不作' : '枯れ気味',
    color: '#e08a5a',
    vit,
  };
}
