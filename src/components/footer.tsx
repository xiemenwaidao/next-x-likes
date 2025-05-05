import Link from 'next/link';
import { LogoSVG } from './logo-svg';
import { ReactNode } from 'react';

export const Footer = ({ children }: { children?: ReactNode }) => {
  return (
    <footer className="px-4">
      {children}
      {/* (ง ˙ω˙)ว */}
      <div className="text-center py-8">
        <Link href="/">
          <span className="inline-block">@</span>{' '}
          <LogoSVG width={50} className="inline-block" />
        </Link>
      </div>
    </footer>
  );
};
