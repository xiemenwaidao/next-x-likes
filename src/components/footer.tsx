import Link from 'next/link';
import { LogoSVG } from './logo-svg';

export const Footer = () => {
  return (
    <footer>
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
