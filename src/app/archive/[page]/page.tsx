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
import { isHiddenUser } from '@/data/hidden-users';

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

// pages/page-*.json (20 件ずつ) を全部読み、非表示ユーザーを除いてから
// ページングし直す。ファイル単位のままだと除外したページだけ件数が欠けるため。
let allLikesPromise: Promise<ArchiveLike[]> | null = null;
function getAllArchiveLikes(): Promise<ArchiveLike[]> {
  allLikesPromise ??= (async () => {
    const pagesDir = path.join(process.cwd(), 'src/content/archive/pages');
    let files: string[];
    try {
      files = await fs.readdir(pagesDir);
    } catch {
      return [];
    }
    const pageFiles = files
      .filter((f) => f.startsWith('page-') && f.endsWith('.json'))
      .sort((a, b) => parseInt(a.slice(5), 10) - parseInt(b.slice(5), 10));
    const likes: ArchiveLike[] = [];
    for (const f of pageFiles) {
      const data: PageData = JSON.parse(await fs.readFile(path.join(pagesDir, f), 'utf-8'));
      likes.push(...data.likes);
    }
    return likes.filter((l) => !isHiddenUser(l.react_tweet_data?.user?.screen_name));
  })();
  return allLikesPromise;
}

export async function generateStaticParams() {
  const likes = await getAllArchiveLikes();
  const totalPages = Math.ceil(likes.length / ITEMS_PER_PAGE);
  return Array.from({ length: totalPages }, (_, i) => ({ page: String(i + 1) }));
}

async function getPageData(pageNumber: string): Promise<PageData | null> {
  const page = parseInt(pageNumber, 10);
  const all = await getAllArchiveLikes();
  const totalPages = Math.ceil(all.length / ITEMS_PER_PAGE);
  if (!Number.isInteger(page) || page < 1 || page > totalPages) return null;
  const start = (page - 1) * ITEMS_PER_PAGE;
  return {
    page,
    totalPages,
    totalLikes: all.length,
    likes: all.slice(start, start + ITEMS_PER_PAGE),
  };
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
          // エクスポートには「いいねした日時」が無いので、liked_at は空で渡して
          // カード側で ARCHIVE_DATE_LABEL (~2024-11-10) を表示させる
          const likedAt = '';
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
                unavailable: like.notfound === true || like.private === true,
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
