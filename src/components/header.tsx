import { LogoSVG } from './logo-svg';
import { CircleHelp, LinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { SearchBox } from './search';

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
            <PopoverContent className="w-80">
              <div className="space-y-3">
                <div className="text-xs">
                  <p>いいねの備忘録。</p>
                  <p>毎朝5時過ぎに自動更新。</p>
                </div>
                
                <div className="border-t pt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                      NEW
                    </Badge>
                    <span className="text-xs font-medium">新機能</span>
                  </div>
                  
                  <div className="space-y-2 text-xs text-gray-300">
                    <div className="flex items-start gap-2">
                      <span className="text-gray-500 text-[11px]">2025/6/2</span>
                      <div>
                        <p className="font-medium">🔍 検索機能を追加</p>
                        <p className="text-[11px] text-gray-400">
                          虫眼鏡アイコンから全ツイートを検索可能
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-2">
                      <span className="text-gray-500 text-[11px]">2025/6/3</span>
                      <div>
                        <p className="font-medium">🔗 URL一覧を追加</p>
                        <p className="text-[11px] text-gray-400">
                          リンクアイコンからURL付きツイートを閲覧
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </header>
  );
};
