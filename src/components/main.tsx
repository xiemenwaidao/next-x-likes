'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { DateInfo } from '@/types/like';

export function Main({
  children,
  allDates: _allDates,
}: {
  children: ReactNode;
  allDates: DateInfo[];
}) {
  // 各ルートが独自レイアウトを持つようになったので、Main は単純な main 要素に。
  // /tweet/[id] と /likes/[date] は削除済み (検索/カテゴリに統合)。
  const pathname = usePathname();
  const isWideRoute =
    pathname === '/' ||
    pathname.startsWith('/search') ||
    pathname.startsWith('/categories') ||
    pathname.startsWith('/archive') ||
    pathname.startsWith('/urls');

  if (isWideRoute) {
    return <main className="flex-1 flex flex-col">{children}</main>;
  }

  return (
    <main className="container mx-auto px-4 py-4 space-y-8">{children}</main>
  );
}
