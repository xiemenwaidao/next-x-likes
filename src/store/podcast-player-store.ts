// /store/podcast-player-store.ts
//
// 永続オーディオプレイヤーの状態。実際の <audio> 要素は
// src/components/podcast-player.tsx に singleton で 1 個だけ存在し、
// root layout に常駐するのでページ遷移しても再生が途切れない。
// このストアは「今どのエピソードを・再生中か・どの位置か」を保持する。
import { create } from 'zustand';
import type { PodcastEpisode } from '@/lib/podcast-episodes';

type PodcastPlayerStore = {
  current: PodcastEpisode | null;
  isPlaying: boolean;
  currentTime: number; // 秒
  duration: number; // 秒
  playbackRate: number;
  expanded: boolean; // mini ↔ full 表示

  // 再生したいエピソードを設定 (同じものなら toggle)
  play: (ep: PodcastEpisode) => void;
  setPlaying: (playing: boolean) => void;
  togglePlay: () => void;
  close: () => void;
  setExpanded: (v: boolean) => void;
  setPlaybackRate: (rate: number) => void;

  // <audio> の timeupdate / loadedmetadata から呼ばれる (状態反映用)
  _setTime: (t: number) => void;
  _setDuration: (d: number) => void;

  // UI からの seek 要求。<audio> 側が監視して反映する (null = 未要求)
  seekRequest: number | null;
  requestSeek: (t: number) => void;
  _clearSeek: () => void;
};

export const usePodcastPlayer = create<PodcastPlayerStore>((set, get) => ({
  current: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  playbackRate: 1,
  expanded: false,

  play: (ep) => {
    const cur = get().current;
    if (cur && cur.slug === ep.slug) {
      // 同じエピソード → toggle
      set((s) => ({ isPlaying: !s.isPlaying }));
    } else {
      // 別エピソード → 切り替えて再生
      set({ current: ep, isPlaying: true, currentTime: 0, duration: 0 });
    }
  },
  setPlaying: (playing) => set({ isPlaying: playing }),
  togglePlay: () => set((s) => ({ isPlaying: s.current ? !s.isPlaying : false })),
  close: () => set({ current: null, isPlaying: false, currentTime: 0, duration: 0, expanded: false }),
  setExpanded: (v) => set({ expanded: v }),
  setPlaybackRate: (rate) => set({ playbackRate: rate }),

  _setTime: (t) => set({ currentTime: t }),
  _setDuration: (d) => set({ duration: d }),

  seekRequest: null,
  requestSeek: (t) => set({ seekRequest: t }),
  _clearSeek: () => set({ seekRequest: null }),
}));
