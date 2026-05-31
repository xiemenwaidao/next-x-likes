'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search as SearchIcon } from 'lucide-react';
import { LogoSVG } from './logo-svg';
import { MenuGrid } from './menu-grid';

export const Header = () => {
  const pathname = usePathname();
  const onSearch = pathname?.startsWith('/search');

  // scroll 検知でヘッダー高さとロゴサイズを縮める。
  // ★ヒステリシスのバンド幅は「縮小で生じる高さ変化 (56→44 = 12px)」より十分広く取る。
  //   バンドが狭いと、縮小→scroll anchoring が scrollY を ~12px 補正→閾値を跨いで再展開
  //   →また縮小… という振動 (ガタガタ) が起きるため。enter 40 / exit 12 で 28px のバンド。
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      const y = window.scrollY;
      setScrolled((prev) => (prev ? y > 12 : y > 40));
      raf = 0;
    };
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <header
      className="sticky top-0 z-30 w-full"
      data-scrolled={scrolled ? '1' : '0'}
      style={{
        background: scrolled
          ? 'oklch(13% 0.012 250 / 0.82)'
          : 'oklch(15% 0.012 250 / 0.7)',
        backdropFilter: 'blur(18px) saturate(160%)',
        WebkitBackdropFilter: 'blur(18px) saturate(160%)',
        borderBottom: '0.5px solid var(--line-soft)',
        transition: 'background 200ms ease',
      }}
    >
      <div
        className="col-28 flex items-center gap-2"
        style={{
          height: scrolled ? 44 : 56,
          transition: 'height 220ms cubic-bezier(0.22, 0.61, 0.36, 1)',
        }}
      >
        <Link
          href="/"
          aria-label="ホーム"
          className="zk-icon-btn"
          style={{ marginLeft: -8, width: 'auto', padding: '0 8px' }}
        >
          <span
            className="flex items-baseline gap-1.5"
            style={{
              transformOrigin: 'left center',
              transform: scrolled ? 'scale(0.7)' : 'scale(1)',
              transition: 'transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1)',
            }}
          >
            <LogoSVG width={80} />
          </span>
        </Link>
        <div className="flex-1" />
        <Link
          href="/search"
          aria-label="検索"
          className="zk-icon-btn"
          data-active={onSearch ? '1' : '0'}
        >
          <SearchIcon size={17} strokeWidth={1.75} />
        </Link>
        <MenuGrid />
      </div>
    </header>
  );
};
