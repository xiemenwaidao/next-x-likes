'use client';

import { Calendar } from '@/components/ui/calendar';
import { useCalendarStore } from '@/store/calendar-store';
import { DateInfo } from '@/types/like';
import { toZonedTime } from 'date-fns-tz';
import { useTransitionRouter } from 'next-view-transitions';
import { useParams, usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo } from 'react';

export function CalendarPicker({
  allDates,
  isFooter = false,
}: {
  allDates: DateInfo[];
  isFooter?: boolean;
}) {
  const { selectedDate, setSelectedDate, displayMonth, setDisplayMonth } =
    useCalendarStore();
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
    // 新しいURL形式をチェック: /likes/2025-01-10
    if (params.date && typeof params.date === 'string') {
      const [year, month, day] = params.date.split('-').map(Number);
      if (year && month && day) {
        const dateFromUrl = new Date(year, month - 1, day);
        if (!isNaN(dateFromUrl.getTime())) {
          setSelectedDate(dateFromUrl);
          setDisplayMonth(new Date(year, month - 1, 1));
        } else {
          setSelectedDate(undefined);
          setDisplayMonth(undefined);
        }
      }
    }
    // 旧URL形式をチェック（後方互換性のため）
    else if (params.year && params.month && params.day) {
      const dateFromUrl = new Date(
        Number(params.year),
        Number(params.month) - 1,
        Number(params.day),
      );
      // 無効な日付の場合はセットしない
      if (!isNaN(dateFromUrl.getTime())) {
        setSelectedDate(dateFromUrl);
        // カレンダーの表示月も同じ月に設定
        setDisplayMonth(
          new Date(Number(params.year), Number(params.month) - 1, 1),
        );
      } else {
        setSelectedDate(undefined);
        setDisplayMonth(undefined);
      }
    } else {
      // URLにパラメータがない場合、日本時間の現在日を基準に表示月を設定
      setSelectedDate(undefined);
      const nowJapan = toZonedTime(new Date(), 'Asia/Tokyo');
      setDisplayMonth(new Date(nowJapan.getFullYear(), nowJapan.getMonth(), 1));
    }
  }, [
    params.date,
    params.year,
    params.month,
    params.day,
    setSelectedDate,
    setDisplayMonth,
  ]);

  // 日付選択時のナビゲーション
  const handleSelect = useCallback(
    (date: Date | undefined) => {
      setSelectedDate(date);
      if (!date) {
        router.push('/');
        return;
      }
      const formattedDate = `/likes/${date.getFullYear()}-${String(
        date.getMonth() + 1,
      ).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
      className={`flex items-center justify-center ${
        isRootPath && isFooter ? 'hidden' : ''
      }`}
    >
      <Calendar
        mode="single"
        className="rounded-md border max-w-[28rem] w-full"
        classNames={{
          months: 'w-full flex flex-col space-y-4',
          month: 'w-full space-y-4',
          table: 'w-full border-collapse space-y-1',
          head_row: 'flex w-full',
          head_cell:
            'w-full rounded-md text-muted-foreground text-sm font-normal',
          row: 'flex w-full mt-2',
          cell: 'w-full text-center text-sm p-0 relative focus-within:relative focus-within:z-20',
          day: 'h-9 w-9 p-0 font-normal aria-selected:opacity-100 hover:bg-accent hover:rounded-sm rounded-sm mx-auto cursor-pointer disabled:cursor-not-allowed',
          day_selected:
            'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground rounded-full',
          day_disabled:
            'text-muted-foreground opacity-50 cursor-not-allowed hover:bg-transparent',
          nav: 'space-x-1 flex items-center justify-center',
          nav_button: 'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100',
          nav_button_previous: 'absolute left-1',
          nav_button_next: 'absolute right-1',
          caption: 'flex justify-center py-2 relative items-center',
        }}
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
        month={displayMonth}
        onMonthChange={setDisplayMonth}
      />
    </div>
  );
}
