import { LogoSVG } from './logo-svg';
import Link from 'next/link';
import { SearchBox } from './search';
import { MenuGrid } from './menu-grid';

export const Header = () => {
  return (
    <header className="sticky top-0 z-50 w-full backdrop-blur-md bg-gray-900/50 border-b border-gray-700/30">
      <div className="max-w-[28rem] mx-auto px-4">
        <div className="flex items-center h-16">
          <h1 className="flex-none">
            <Link href="/">
              <LogoSVG width={80} />
            </Link>
          </h1>
          <div className="grow"></div>
          <SearchBox />
          <MenuGrid />
        </div>
      </div>
    </header>
  );
};
