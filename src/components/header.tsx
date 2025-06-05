import { LogoSVG } from './logo-svg';
import { CircleHelp, LinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import Link from 'next/link';
import { SearchBox } from './search';
import { AnnouncementList } from './announcements';

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
          <Button variant="ghost" size="icon" asChild className="flex-none">
            <Link href="/urls/1" title="URL一覧">
              <LinkIcon className="h-5 w-5" />
            </Link>
          </Button>
          <SearchBox />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="flex-none">
                <CircleHelp />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3">
              <AnnouncementList />
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </header>
  );
};
