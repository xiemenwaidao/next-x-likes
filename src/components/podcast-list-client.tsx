'use client';

/**
 * /podcast エピソード一覧。各回を再生 / その週のいいねを見る / 詳細 へ導線。
 * 再生は永続プレイヤー (usePodcastPlayer) に渡すので、一覧で再生 → いいねを
 * 眺めに行っても鳴り続ける。
 */
import Link from 'next/link';
import { Headphones, Play, Pause, CalendarRange, ExternalLink } from 'lucide-react';
import { PODCAST_EPISODES } from '@/lib/podcast-episodes';
import { usePodcastPlayer } from '@/store/podcast-player-store';

export function PodcastListClient() {
  const current = usePodcastPlayer((s) => s.current);
  const isPlaying = usePodcastPlayer((s) => s.isPlaying);
  const play = usePodcastPlayer((s) => s.play);

  return (
    <div className="col-28" style={{ padding: '12px 16px 80px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* hero */}
      <div className="zk-card" style={{ padding: '18px 18px' }}>
        <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
          <Headphones size={16} strokeWidth={1.75} style={{ color: 'oklch(78% 0.15 250)' }} />
          <span className="zk-section-label">集讚館ラジオ</span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-0)', margin: 0, letterSpacing: '-0.01em' }}>
          いいねダイジェスト
        </h1>
        <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 8, lineHeight: 1.6 }}>
          その週にいいねした投稿を、ウサギと猫の 2 人がゆるく振り返るポッドキャスト。
          再生しながらいいねを眺められます。
        </p>
      </div>

      {PODCAST_EPISODES.length === 0 ? (
        <div className="zk-empty">
          <div>—</div>
          <div>まだエピソードがありません</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {PODCAST_EPISODES.map((ep) => {
            const isThis = current?.slug === ep.slug;
            const showPause = isThis && isPlaying;
            return (
              <div key={ep.slug} className="zk-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => play(ep)}
                    aria-label={showPause ? '一時停止' : '再生'}
                    className="flex items-center justify-center flex-shrink-0"
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      border: 0,
                      background: isThis ? 'oklch(74% 0.17 250)' : 'oklch(70% 0.17 250)',
                      color: 'oklch(18% 0.02 250)',
                      cursor: 'pointer',
                      boxShadow: isThis ? '0 0 0 3px oklch(70% 0.17 250 / 0.25)' : 'none',
                    }}
                  >
                    {showPause ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: 2 }} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 13.5, color: 'var(--text-0)', lineHeight: 1.45, fontWeight: 500 }}>
                      {ep.title}
                    </div>
                    <div className="font-mono" style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 3 }}>
                      {ep.from} 〜 {ep.to} · {ep.duration}
                    </div>
                  </div>
                </div>

                {ep.description && (
                  <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>
                    {ep.description}
                  </p>
                )}

                <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                  <Link
                    href={`/search?date=${ep.from}`}
                    className="inline-flex items-center gap-1"
                    style={{
                      padding: '5px 10px',
                      borderRadius: 8,
                      background: 'var(--bg-2)',
                      color: 'var(--text-1)',
                      fontSize: 11.5,
                      boxShadow: 'inset 0 0 0 0.5px var(--line-soft)',
                    }}
                  >
                    <CalendarRange size={13} strokeWidth={1.75} />
                    この回のいいねを見る
                  </Link>
                  <a
                    href={ep.page_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1"
                    style={{ padding: '5px 8px', fontSize: 11.5, color: 'var(--text-3)' }}
                  >
                    詳細 <ExternalLink size={11} />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
