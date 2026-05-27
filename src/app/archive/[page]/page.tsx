import { notFound } from 'next/navigation';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Archive, CircleHelp } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/pagination';
import { TweetEmbedCard } from '@/components/tweet-embed-card';

export const dynamic = 'force-static';
export const revalidate = false;

interface ArchiveLike {
  id: string;
  tweetId: string;
  fullText?: string;
  expandedUrl: string;
  isArchive: true;
  processedAt: string;
  // 旧 react_tweet_data は最小限の互換用に残す
  react_tweet_data?: {
    user?: { screen_name?: string };
    text?: string;
    created_at?: string;
  };
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
  } catch {
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
  } catch {
    return null;
  }
}

export default async function ArchivePageView({ params }: Props) {
  const { page: pageParam } = await params;
  const pageData = await getPageData(pageParam);

  if (!pageData) notFound();

  const { page, totalPages, totalLikes, likes } = pageData;
  const startIndex = (page - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalLikes);

  return (
    <div className="col-28" style={{ padding: '16px 16px 60px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="flex items-center justify-center gap-2 mb-1">
        <Archive className="h-5 w-5" style={{ color: 'var(--text-2)' }} />
        <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-0)', margin: 0 }}>Archive</h1>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6 cursor-pointer">
              <CircleHelp className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3">
            <p className="text-sm" style={{ color: 'var(--text-2)' }}>
              2024年11月以前（本プロジェクト開始前）にいいねしたツイート一覧
            </p>
          </PopoverContent>
        </Popover>
      </div>
      <div className="text-center" style={{ fontSize: 12, color: 'var(--text-3)' }}>
        計 {totalLikes.toLocaleString()} 件中 {startIndex + 1}-{endIndex} 件
      </div>

      <Pagination currentPage={page} totalPages={totalPages} basePath="/archive" />

      <div className="flex flex-col gap-2.5">
        {likes.map((like) => {
          const username = like.react_tweet_data?.user?.screen_name ?? 'unknown';
          const likedAt = like.fetchedAt ?? like.processedAt ?? '';
          return (
            <TweetEmbedCard
              key={like.id}
              meta={{
                tweet_id: like.tweetId,
                username,
                liked_at: likedAt,
                category: null,
                summary_ja: null,
                sub_tags: [],
                text: like.fullText ?? like.react_tweet_data?.text ?? '',
                showScore: false,
              }}
            />
          );
        })}

        {likes.length === 0 && (
          <div className="zk-empty">
            <div>—</div>
            <div>このページにはツイートがありません</div>
          </div>
        )}
      </div>

      <Pagination currentPage={page} totalPages={totalPages} basePath="/archive" />
    </div>
  );
}
