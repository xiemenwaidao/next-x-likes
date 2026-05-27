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
    <button
      type="button"
      onClick={handleClick}
      aria-label="ページの先頭に戻る"
      className="fixed z-50 flex items-center justify-center transition-all duration-200"
      style={{
        bottom: 'max(20px, env(safe-area-inset-bottom))',
        right: 'max(20px, env(safe-area-inset-right))',
        width: 40,
        height: 40,
        borderRadius: 999,
        background: 'oklch(20% 0.012 250 / 0.85)',
        color: 'var(--text-1)',
        boxShadow:
          'inset 0 0 0 0.5px var(--line), 0 8px 24px rgba(0, 0, 0, 0.35)',
        backdropFilter: 'blur(16px) saturate(160%)',
        WebkitBackdropFilter: 'blur(16px) saturate(160%)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        pointerEvents: visible ? 'auto' : 'none',
        cursor: 'pointer',
      }}
    >
      <ArrowUp size={18} strokeWidth={1.75} />
    </button>
  );
};
