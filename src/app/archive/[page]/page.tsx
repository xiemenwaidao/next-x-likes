import { notFound } from 'next/navigation';
import * as fs from 'fs/promises';
import * as path from 'path';
import { CustomTweet } from '@/components/custom-tweet';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Archive, CircleHelp } from 'lucide-react';
import { Tweet } from 'react-tweet/api';
import { Pagination } from '@/components/pagination';

export const dynamic = 'force-static';
export const revalidate = false;

interface ArchiveLike {
  id: string;
  tweetId: string;
  fullText?: string;
  expandedUrl: string;
  isArchive: true;
  processedAt: string;
  react_tweet_data?: Tweet;
  private?: boolean;
  notfound?: boolean;
  fetchedAt?: string;
}

interface PageData {
  page: number;
  totalPages: number;
  totalLikes: number;
  likes: ArchiveLike[];
}

const ITEMS_PER_PAGE = 20;

type Props = {
  params: Promise<{
    page: string;
  }>;
};

export async function generateStaticParams() {
  try {
    const pagesDir = path.join(process.cwd(), 'src/content/archive/pages');
    const files = await fs.readdir(pagesDir);
    const pageFiles = files.filter(
      (f) => f.startsWith('page-') && f.endsWith('.json'),
    );

    return pageFiles.map((file) => ({
      page: file.replace('page-', '').replace('.json', ''),
    }));
  } catch (error) {
    return [];
  }
}

async function getPageData(pageNumber: string): Promise<PageData | null> {
  try {
    const pagePath = path.join(
      process.cwd(),
      'src/content/archive/pages',
      `page-${pageNumber}.json`,
    );
    const content = await fs.readFile(pagePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    return null;
  }
}

export default async function ArchivePageView({ params }: Props) {
  const { page: pageParam } = await params;
  const pageData = await getPageData(pageParam);

  if (!pageData) {
    notFound();
  }

  const { page, totalPages, totalLikes, likes } = pageData;
  const startIndex = (page - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalLikes);

  return (
    <div className="max-w-md mx-auto">
      <div className="flex items-center justify-center gap-2 mb-2">
        <Archive className="h-5 w-5" />
        <h1 className="text-xl font-bold text-center">Archive</h1>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6 cursor-pointer">
              <CircleHelp className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3">
            <p className="text-sm text-gray-300">
              2024年11月以前（本プロジェクト開始前）にいいねしたツイート一覧
            </p>
          </PopoverContent>
        </Popover>
      </div>
      <p className="text-gray-400 mb-4 text-center text-sm">
        計 {totalLikes.toLocaleString()} 件中 {startIndex + 1}-{endIndex}{' '}
        件を表示
      </p>

      {/* 上部ページネーション */}
      <div className="mb-6">
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          basePath="/archive"
        />
      </div>

      {/* Tweets */}
      <div className="w-full max-w-md mx-auto space-y-4 py-4 p-0 relative">
        {/* Sticky header */}
        <div className="sticky top-[4.25rem] z-40 text-center mb-6">
          <h2 className="inline-flex items-center gap-2 px-4 py-1.5 backdrop-blur-md bg-gray-800/60 border border-gray-700/50 rounded-full text-sm font-medium text-gray-300 shadow-lg">
            <Archive className="h-4 w-4" />
            <span className="text-gray-200">Archive Page {page}</span>
          </h2>
        </div>

        {likes.map((like) => {
          if (like.react_tweet_data) {
            return (
              <CustomTweet
                key={like.id}
                tweetId={like.tweetId}
                tweetData={like.react_tweet_data}
                isPrivate={!!like.private}
                isNotFound={!!like.notfound}
              />
            );
          } else if (like.private || like.notfound) {
            return (
              <Card key={like.id} className="opacity-60">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground mb-2">
                    {like.private ? 'This tweet is private' : 'Tweet not found'}
                    : {like.tweetId}
                  </p>
                  {like.fullText && <p className="text-sm">{like.fullText}</p>}
                  <a
                    href={like.expandedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:underline mt-2 inline-block"
                  >
                    View on Twitter →
                  </a>
                </CardContent>
              </Card>
            );
          }
          return null;
        })}

        {likes.length === 0 && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">
                No tweets available on this page.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 下部ページネーション */}
      <div className="mt-8">
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          basePath="/archive"
        />
      </div>
    </div>
  );
}
