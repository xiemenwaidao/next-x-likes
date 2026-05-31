'use client';

import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

/**
 * ページトップに戻るフローティングボタン。
 * - スクロール量が一定を超えたときだけ表示 (fade-in)
 * - 角丸 + ガラス調背景でダークテーマに調和
 * - prefers-reduced-motion を尊重して smooth scroll を切り替える
 */
export const ScrollTopButton = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 320);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleClick = () => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  };

  return (
    // 画面いっぱいに広げた centered wrapper の中で、コンテンツ列 (col-28 = max-w 28rem
    // + padding-inline 16px) と同じ幅に絞って右端に寄せる。これで PC でも本文コンテナの
    // 右端にボタンが付き、画面の遠い隅に飛ばない (ヘッダー等と同じ整列)。
    <div
      className="fixed z-50"
      style={{
        left: 0,
        right: 0,
        bottom: 'max(20px, env(safe-area-inset-bottom))',
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '28rem',
          paddingInline: 16,
          boxSizing: 'border-box',
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        <button
          type="button"
          onClick={handleClick}
          aria-label="ページの先頭に戻る"
          className="flex items-center justify-center"
          style={{
            width: 40,
            height: 40,
            borderRadius: 999,
            background: 'oklch(20% 0.012 250 / 0.85)',
            color: 'var(--text-1)',
            boxShadow: 'inset 0 0 0 0.5px var(--line), 0 8px 24px rgba(0, 0, 0, 0.35)',
            backdropFilter: 'blur(16px) saturate(160%)',
            WebkitBackdropFilter: 'blur(16px) saturate(160%)',
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0) scale(1)' : 'translateY(10px) scale(0.8)',
            pointerEvents: visible ? 'auto' : 'none',
            transition:
              'opacity 280ms cubic-bezier(0.22, 0.61, 0.36, 1), transform 280ms cubic-bezier(0.22, 0.61, 0.36, 1)',
            willChange: 'opacity, transform',
            cursor: 'pointer',
          }}
        >
          <ArrowUp size={18} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
};
