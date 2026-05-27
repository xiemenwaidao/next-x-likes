'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search as SearchIcon } from 'lucide-react';
import { LogoSVG } from './logo-svg';
import { MenuGrid } from './menu-grid';

export const Header = () => {
  const pathname = usePathname();
  const onSearch = pathname?.startsWith('/search');

  return (
    <header
      className="sticky top-0 z-30 w-full"
      style={{
        background: 'oklch(15% 0.012 250 / 0.7)',
        backdropFilter: 'blur(18px) saturate(160%)',
        WebkitBackdropFilter: 'blur(18px) saturate(160%)',
        borderBottom: '0.5px solid var(--line-soft)',
      }}
    >
      <div className="col-28 flex items-center gap-2" style={{ height: 56 }}>
        <Link
          href="/"
          aria-label="ホーム"
          className="zk-icon-btn"
          style={{ marginLeft: -8, width: 'auto', padding: '0 8px' }}
        >
          <span className="flex items-baseline gap-1.5">
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
