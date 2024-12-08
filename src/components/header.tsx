import { LogoSVG } from './logo-svg';
import { CircleHelp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import Link from 'next/link';

export const Header = () => {
  return (
    <header className="sticky top-0 z-50 w-full backdrop-blur-md bg-gray-900/50 border-b border-gray-700/30">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center h-16">
          <h1 className="flex-none">
            <Link href="/">
              <LogoSVG width={80} />
            </Link>
          </h1>
          <div className="grow"></div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="flex-none">
                <CircleHelp />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-fit">
              <div className="text-center text-xs">いいねの備忘録</div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </header>
  );
};
