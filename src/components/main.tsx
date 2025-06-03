'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { CalendarPicker } from './calendar-picker';
import { TweetDrawer } from './tweet-drawer';
import { useCalendarStore } from '@/store/calendar-store';
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
  const { selectedDate, isDrawerOpen, setIsDrawerOpen } = useCalendarStore();
  
  // /tweet/[id] と /urls パスではカレンダーを表示しない
  const showCalendar = !pathname.startsWith('/tweet/') && !pathname.startsWith('/urls');
  
  // ルートページの場合はchildrenを表示しない（カレンダーのみ表示）
  const isRootPage = pathname === '/';
  
  return (
    <>
      <main className={`container mx-auto px-4 py-4 transition-all duration-300 ${isDrawerOpen ? 'scale-95 opacity-40' : ''}`}>
        {/* <SiteAnnounce /> */}
        {showCalendar && <CalendarPicker allDates={allDates} />}
        {!isRootPage && children}
      </main>
      
      {/* Tweet Drawer */}
      <TweetDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        date={selectedDate || null}
      />
    </>
  );
}
