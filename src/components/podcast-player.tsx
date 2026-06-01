'use client';

/**
 * 永続オーディオプレイヤー (WeChat 風フローティング mini bar)。
 *
 * root layout に常駐し、<audio> 要素を singleton で 1 個だけ持つ。
 * ページ遷移しても layout は remount されないので、再生が途切れない。
 *
 * - current が null のときは何も描画しない (透明)
 * - mini: 画面下部のフローティング pill (カバー・タイトル・再生/一時停止・進捗)
 * - expanded: タップで開く full パネル (シーク・速度・閉じる・元エピソードページへ)
 */
import { useEffect, useRef } from 'react';
import { Play, Pause, X, ChevronDown, ChevronUp, ExternalLink, Rewind, FastForward } from 'lucide-react';
import { usePodcastPlayer } from '@/store/podcast-player-store';

function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const RATES = [1, 1.25, 1.5, 2, 0.75];

export function PodcastPlayer() {
  const {
    current,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    expanded,
    setPlaying,
    togglePlay,
    close,
    setExpanded,
    setPlaybackRate,
    _setTime,
    _setDuration,
    seekRequest,
    requestSeek,
    _clearSeek,
  } = usePodcastPlayer();

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playerRef = useRef<HTMLDivElement | null>(null);

  // mini プレイヤー表示中は、その高さぶんだけ画面下のフローティングボタン
  // (scroll-top / 日付ジャンプ FAB) を上へ逃がすための CSS 変数を root に出す。
  // プレイヤーは z-60 で同じ 28rem 列・bottom:12px に居座るため、これが無いと
  // ボタンがプレイヤーバーの裏に隠れてしまう。expanded / 非再生時は 0。
  useEffect(() => {
    const root = document.documentElement;
    if (!current || expanded) {
      root.style.setProperty('--zk-player-offset', '0px');
      return;
    }
    const apply = () => {
      const h = playerRef.current?.offsetHeight ?? 64;
      root.style.setProperty('--zk-player-offset', `${Math.round(h) + 12}px`);
    };
    const raf = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(raf);
  }, [current, expanded]);

  // unmount 時に確実に 0 へ戻す
  useEffect(
    () => () => {
      document.documentElement.style.setProperty('--zk-player-offset', '0px');
    },
    [],
  );

  // current が変わったら audio の src をセットして再生
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (audio.src !== current.audio_url) {
      audio.src = current.audio_url;
      audio.load();
    }
  }, [current]);

  // isPlaying に応じて play/pause
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (isPlaying) {
      audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }, [isPlaying, current, setPlaying]);

  // playbackRate 反映
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = playbackRate;
  }, [playbackRate, current]);

  // seek 要求の反映
  useEffect(() => {
    const audio = audioRef.current;
    if (audio && seekRequest != null) {
      audio.currentTime = seekRequest;
      _clearSeek();
    }
  }, [seekRequest, _clearSeek]);

  if (!current) return null;

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  const onSeekBar = (e: React.MouseEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    requestSeek(ratio * duration);
  };

  const skip = (delta: number) => {
    const audio = audioRef.current;
    if (audio) requestSeek(Math.min(duration, Math.max(0, audio.currentTime + delta)));
  };

  const cycleRate = () => {
    const idx = RATES.indexOf(playbackRate);
    setPlaybackRate(RATES[(idx + 1) % RATES.length]);
  };

  return (
    <>
      {/* singleton audio (UI 非表示、layout 常駐で遷移を跨ぐ) */}
      <audio
        ref={audioRef}
        preload="metadata"
        onTimeUpdate={(e) => _setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => _setDuration(e.currentTarget.duration)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />

      <div ref={playerRef} className={`zk-player ${expanded ? 'zk-player-expanded' : ''}`} role="region" aria-label="ポッドキャストプレイヤー">
        {/* 進捗バー (mini/expanded 共通、上辺) */}
        <div
          className="zk-player-progress"
          onClick={onSeekBar}
          role="slider"
          aria-label="再生位置"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          tabIndex={0}
        >
          <div className="zk-player-progress-fill" style={{ width: `${pct}%` }} />
        </div>

        {!expanded ? (
          // ---- mini bar ----
          <div className="zk-player-mini">
            <button className="zk-player-btn zk-player-play" onClick={togglePlay} aria-label={isPlaying ? '一時停止' : '再生'}>
              {isPlaying ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button className="zk-player-meta" onClick={() => setExpanded(true)} aria-label="プレイヤーを開く">
              <span className="zk-player-title">{current.title}</span>
              <span className="zk-player-time">
                {fmtTime(currentTime)} / {current.duration || fmtTime(duration)}
              </span>
            </button>
            <button className="zk-player-btn" onClick={() => setExpanded(true)} aria-label="開く">
              <ChevronUp size={16} />
            </button>
            <button className="zk-player-btn" onClick={close} aria-label="閉じる">
              <X size={16} />
            </button>
          </div>
        ) : (
          // ---- expanded ----
          <div className="zk-player-full">
            <div className="zk-player-full-head">
              <button className="zk-player-btn" onClick={() => setExpanded(false)} aria-label="折りたたむ">
                <ChevronDown size={18} />
              </button>
              <span className="zk-player-full-label">再生中</span>
              <button className="zk-player-btn" onClick={close} aria-label="閉じる">
                <X size={18} />
              </button>
            </div>

            <div className="zk-player-full-title">{current.title}</div>

            <div className="zk-player-full-times">
              <span>{fmtTime(currentTime)}</span>
              <span>{current.duration || fmtTime(duration)}</span>
            </div>

            <div className="zk-player-controls">
              <button className="zk-player-btn" onClick={() => skip(-15)} aria-label="15秒戻る">
                <Rewind size={20} />
              </button>
              <button className="zk-player-btn zk-player-play-lg" onClick={togglePlay} aria-label={isPlaying ? '一時停止' : '再生'}>
                {isPlaying ? <Pause size={26} /> : <Play size={26} />}
              </button>
              <button className="zk-player-btn" onClick={() => skip(30)} aria-label="30秒進む">
                <FastForward size={20} />
              </button>
              <button className="zk-player-rate" onClick={cycleRate} aria-label="再生速度">
                {playbackRate}×
              </button>
            </div>

            <a className="zk-player-link" href={current.page_url} target="_blank" rel="noopener noreferrer">
              エピソード詳細 <ExternalLink size={12} />
            </a>
          </div>
        )}
      </div>
    </>
  );
}
