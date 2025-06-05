'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { CalendarPicker } from './calendar-picker';
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

  // /tweet/[id] と /urls パスではカレンダーを表示しない
  const showCalendar =
    !pathname.startsWith('/tweet/') && !pathname.startsWith('/urls');

  // トップページではカレンダーとchildrenを特別にレイアウト
  const isHomePage = pathname === '/';

  if (isHomePage) {
    return (
      <main className="container mx-auto px-4 py-4 flex flex-col">
        {/* <SiteAnnounce /> */}
        <div className="flex-1 flex flex-col justify-center">
          <CalendarPicker allDates={allDates} />
          {children}
        </div>
      </main>
    );
  }

  return (
    <main className="container mx-auto px-4 py-4 space-y-8">
      {/* <SiteAnnounce /> */}
      {showCalendar && <CalendarPicker allDates={allDates} />}
      {children}
    </main>
  );
}
