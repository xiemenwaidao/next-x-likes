export const dynamic = 'force-static';
export const revalidate = false;

import { promises as fs } from 'fs';
import path from 'path';
import Link from 'next/link';
import { Calendar, ExternalLink, Link2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { UrlCardImage } from '@/components/url-card-image';
import { Pagination } from '@/components/pagination';

interface ExtractedUrl {
  tweet_id: string;
  username: string;
  tweet_url: string;
  liked_at: string;
  year: string;
  month: string;
  day: string;
  urls: {
    url: string;
    expanded_url: string;
    display_url: string;
  }[];
  card?: {
    url: string;
    title?: string;
    description?: string;
    image?: string;
  };
}

const ITEMS_PER_PAGE = 20;

type Props = {
  params: Promise<{
    page: string;
  }>;
};

async function getUrlData(): Promise<ExtractedUrl[]> {
  try {
    const filePath = path.join(process.cwd(), 'src/content/url-index.json');
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error reading URL index:', error);
    return [];
  }
}

export async function generateStaticParams() {
  const urlData = await getUrlData();
  const totalPages = Math.ceil(urlData.length / ITEMS_PER_PAGE);
  
  return Array.from({ length: totalPages }, (_, i) => ({
    page: String(i + 1),
  }));
}

export default async function UrlsPage({ params }: Props) {
  const { page } = await params;
  const currentPage = parseInt(page, 10);
  const urlData = await getUrlData();
  
  const totalPages = Math.ceil(urlData.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentItems = urlData.slice(startIndex, endIndex);

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-xl font-bold mb-4 text-center">URL一覧</h1>
      <p className="text-gray-400 mb-4 text-center text-sm">
        計 {urlData.length} 件中 {startIndex + 1}-{Math.min(endIndex, urlData.length)} 件を表示
      </p>

      {/* 上部ページネーション */}
      <div className="mb-6">
        <Pagination currentPage={currentPage} totalPages={totalPages} basePath="/urls" />
      </div>

      <div className="space-y-4">
        {currentItems.map((item) => (
          <Card key={item.tweet_id} className="border-gray-700 bg-gray-900/50 hover:border-gray-600 transition-all duration-200">
            {item.urls.map((url, idx) => (
              <a
                key={idx}
                href={url.expanded_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                {item.card ? (
                  // OG画像がある場合のリッチカード表示
                  <div className="flex flex-col sm:flex-row">
                    {item.card.image ? (
                      <div className="sm:w-1/3 h-32 sm:h-auto">
                        <UrlCardImage
                          src={item.card.image}
                          alt={item.card.title || ''}
                          className="w-full h-full object-cover rounded-t-lg sm:rounded-l-lg sm:rounded-tr-none"
                        />
                      </div>
                    ) : (
                      // カード情報はあるが画像URLがない場合のフォールバック
                      <div className="sm:w-1/3 h-32 sm:h-auto bg-gray-800 flex items-center justify-center rounded-t-lg sm:rounded-l-lg sm:rounded-tr-none">
                        <div className="text-gray-600">
                          <Link2 className="h-12 w-12" />
                        </div>
                      </div>
                    )}
                    <div className="flex-1 p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1">
                          {item.card.title && (
                            <h3 className="font-semibold text-sm line-clamp-2 mb-1">
                              {item.card.title}
                            </h3>
                          )}
                          {item.card.description && (
                            <p className="text-xs text-gray-400 line-clamp-2">
                              {item.card.description}
                            </p>
                          )}
                        </div>
                        <ExternalLink className="h-4 w-4 text-gray-500 flex-shrink-0" />
                      </div>
                      <p className="text-xs text-blue-400 truncate">
                        {url.display_url}
                      </p>
                    </div>
                  </div>
                ) : (
                  // OG画像がない場合のシンプルな表示
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-blue-400 break-all flex-1">
                        {url.expanded_url}
                      </p>
                      <ExternalLink className="h-4 w-4 text-gray-500 flex-shrink-0" />
                    </div>
                  </div>
                )}
              </a>
            ))}
            
            {/* ツイート情報フッター */}
            <div className="px-4 pb-3 pt-2 border-t border-gray-800">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <div className="flex items-center gap-4">
                  <Link
                    href={`/${item.year}/${item.month}/${item.day}`}
                    className="flex items-center gap-1 hover:text-gray-300 transition-colors"
                  >
                    <Calendar className="h-3 w-3" />
                    {item.year}/{item.month}/{item.day}
                  </Link>
                  <span>@{item.username}</span>
                </div>
                <Link
                  href={`/tweet/${item.tweet_id}`}
                  className="hover:text-gray-300 transition-colors"
                >
                  ツイートを見る
                </Link>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* 下部ページネーション */}
      <div className="mt-8">
        <Pagination currentPage={currentPage} totalPages={totalPages} basePath="/urls" />
      </div>
    </div>
  );
}