'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { CalendarPicker } from './calendar-picker';
import { FloatingDateSelector } from './floating-date-selector-custom';
// import { SiteAnnounce } from './site-announce';
import { DateInfo } from '@/types/like';

export function Main({
  children,
  allDates,
}: {
  children: ReactNode;
  allDates: DateInfo[];
}) {
  const pathname = usePathname();

  // 検索 / カテゴリ / トップは独自レイアウトを使うので Main 側ではカレンダー描画しない
  const isHomePage = pathname === '/';
  const isSearchOrCategories =
    pathname.startsWith('/search') || pathname.startsWith('/categories');
  const showCalendar =
    !isHomePage &&
    !isSearchOrCategories &&
    !pathname.startsWith('/tweet/') &&
    !pathname.startsWith('/urls') &&
    !pathname.startsWith('/archive');

  // 日付ページでは浮動カレンダーを表示
  const showFloatingCalendar = pathname.startsWith('/likes/');

  if (isHomePage || isSearchOrCategories) {
    return <main className="flex-1 flex flex-col">{children}</main>;
  }

  return (
    <main className="container mx-auto px-4 py-4 space-y-8">
      {showCalendar && <CalendarPicker allDates={allDates} />}
      {children}
      {showFloatingCalendar && <FloatingDateSelector allDates={allDates} />}
    </main>
  );
}
