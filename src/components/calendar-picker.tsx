'use client';

import { Calendar } from '@/components/ui/calendar';
import { useCalendarStore } from '@/store/calendar-store';
import { toZonedTime } from 'date-fns-tz';
import { useTransitionRouter } from 'next-view-transitions';
import { useParams, usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo } from 'react';

interface DateInfo {
  year: string;
  month: string;
  day: string;
}

export function CalendarPicker({ allDates }: { allDates: DateInfo[] }) {
  const { selectedDate, setSelectedDate } = useCalendarStore();
  const params = useParams();
  const router = useTransitionRouter();
  const pathname = usePathname();
  const isRootPath = pathname === '/';

  // allDatesをDateオブジェクトのSetに変換（パフォーマンス最適化）
  const validDates = useMemo(() => {
    return new Set(
      allDates.map(
        ({ year, month, day }) =>
          `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(
            2,
            '0',
          )}`,
      ),
    );
  }, [allDates]);

  // URLから日付を設定
  useEffect(() => {
    if (params.year && params.month && params.day) {
      const dateFromUrl = new Date(
        Number(params.year),
        Number(params.month) - 1,
        Number(params.day),
      );
      // 無効な日付の場合はセットしない
      if (!isNaN(dateFromUrl.getTime())) {
        setSelectedDate(dateFromUrl);
      } else {
        setSelectedDate(undefined);
      }
    } else {
      setSelectedDate(undefined);
    }
  }, [params.year, params.month, params.day, setSelectedDate]);

  // 日付選択時のナビゲーション
  const handleSelect = useCallback(
    (date: Date | undefined) => {
      setSelectedDate(date);
      if (!date) {
        router.push('/');
        return;
      }
      const formattedDate = `/${date.getFullYear()}/${String(
        date.getMonth() + 1,
      ).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
      router.push(formattedDate);
    },
    [router, setSelectedDate],
  );

  // 日付の無効化チェック
  const isDateDisabled = useCallback(
    (date: Date) => {
      const dateString = `${date.getFullYear()}-${String(
        date.getMonth() + 1,
      ).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      return !validDates.has(dateString);
    },
    [validDates],
  );

  return (
    <div
      className={`flex items-center justify-center  ${
        isRootPath ? 'h-full' : ''
      }`}
    >
      <Calendar
        mode="single"
        className="rounded-md border"
        selected={selectedDate}
        onSelect={handleSelect}
        disabled={isDateDisabled}
        fromDate={useMemo(() => {
          const [firstDate] = [...allDates]
            .sort((a, b) => {
              const dateA = new Date(
                Number(a.year),
                Number(a.month) - 1,
                Number(a.day),
              );
              const dateB = new Date(
                Number(b.year),
                Number(b.month) - 1,
                Number(b.day),
              );
              return dateA.getTime() - dateB.getTime();
            })
            .map(
              ({ year, month, day }) =>
                new Date(Number(year), Number(month) - 1, Number(day)),
            );
          return firstDate;
        }, [allDates])}
        toDate={toZonedTime(new Date(), 'Asia/Tokyo')}
      />
    </div>
  );
}
