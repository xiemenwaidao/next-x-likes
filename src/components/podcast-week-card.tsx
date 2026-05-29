'use client';

/**
 * 検索結果 (/search?date=YYYY-MM-DD) の上部に出す「この週のポッドキャスト」カード。
 * 指定日付を含む週に podcast エピソードがあれば再生カードを出す。無ければ null。
 * 再生ボタンは永続プレイヤー (usePodcastPlayer) にエピソードを渡す。
 */
import { Headphones, Play, Pause } from 'lucide-react';
import { episodeForDate } from '@/lib/podcast-episodes';
import { usePodcastPlayer } from '@/store/podcast-player-store';

export function PodcastWeekCard({ dateYmd }: { dateYmd: string | null }) {
  const current = usePodcastPlayer((s) => s.current);
  const isPlaying = usePodcastPlayer((s) => s.isPlaying);
  const play = usePodcastPlayer((s) => s.play);

  if (!dateYmd) return null;
  const ep = episodeForDate(dateYmd);
  if (!ep) return null;

  const isThis = current?.slug === ep.slug;
  const showPause = isThis && isPlaying;

  return (
    <div
      className="zk-card flex items-center gap-3"
      style={{ padding: '12px 14px' }}
    >
      <div
        className="flex items-center justify-center flex-shrink-0"
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: 'oklch(70% 0.17 250 / 0.16)',
          color: 'oklch(78% 0.15 250)',
        }}
      >
        <Headphones size={18} strokeWidth={1.75} />
      </div>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 10.5, color: 'var(--text-3)', letterSpacing: '0.04em' }}>
          この週のポッドキャスト
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: 'var(--text-0)',
            lineHeight: 1.4,
            marginTop: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {ep.title}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 1 }} className="font-mono">
          {ep.from} 〜 {ep.to} · {ep.duration}
        </div>
      </div>
      <button
        type="button"
        onClick={() => play(ep)}
        aria-label={showPause ? '一時停止' : '再生'}
        className="flex items-center justify-center flex-shrink-0"
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: 0,
          background: 'oklch(70% 0.17 250)',
          color: 'oklch(18% 0.02 250)',
          cursor: 'pointer',
        }}
      >
        {showPause ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: showPause ? 0 : 2 }} />}
      </button>
    </div>
  );
}
