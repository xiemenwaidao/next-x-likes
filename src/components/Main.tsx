import { ReactNode } from 'react';
import { CalendarPicker } from './calendar-picker';
import { SiteAnnounce } from './site-announce';
import { DateInfo } from '@/types/like';

export function Main({
  children,
  allDates,
}: {
  children: ReactNode;
  allDates: DateInfo[];
}) {
  return (
    <main className="container mx-auto px-4 py-4">
      <SiteAnnounce />
      <CalendarPicker allDates={allDates} />
      {children}
    </main>
  );
}
