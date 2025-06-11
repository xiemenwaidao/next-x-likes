'use client';

import { useCalendarStore } from '@/store/calendar-store';
import { DateInfo } from '@/types/like';
import { CalendarIcon, X } from 'lucide-react';
import { useTransitionRouter } from 'next-view-transitions';
import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import styles from './floating-date-selector.module.css';

interface FloatingDateSelectorProps {
  allDates: DateInfo[];
}

export function FloatingDateSelector({ allDates }: FloatingDateSelectorProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const { selectedDate, setSelectedDate } = useCalendarStore();
  const router = useTransitionRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // スクロール検知
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      const shouldShow = scrollPosition > 300;
      setIsVisible(shouldShow);
      if (shouldShow && !isMounted) {
        setIsMounted(true);
      }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, [isMounted]);

  // 日付リストを作成（新しい順）
  const sortedDates = useMemo(() => {
    return [...allDates]
      .sort((a, b) => {
        const dateA = new Date(Number(a.year), Number(a.month) - 1, Number(a.day));
        const dateB = new Date(Number(b.year), Number(b.month) - 1, Number(b.day));
        return dateB.getTime() - dateA.getTime();
      })
      .map(({ year, month, day }) => ({
        date: new Date(Number(year), Number(month) - 1, Number(day)),
        value: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        label: format(new Date(Number(year), Number(month) - 1, Number(day)), 'yyyy年M月d日(E)', { locale: ja }),
      }));
  }, [allDates]);

  // 現在選択されている日付のラベル
  const selectedLabel = useMemo(() => {
    if (!selectedDate) return '日付を選択';
    return format(selectedDate, 'yyyy年M月d日(E)', { locale: ja });
  }, [selectedDate]);

  // 日付選択時の処理
  const handleDateSelect = useCallback(
    (value: string) => {
      const [year, month, day] = value.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      setSelectedDate(date);
      
      const formattedDate = `/likes/${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      router.push(formattedDate);
      setIsOpen(false);
    },
    [router, setSelectedDate],
  );

  // 外側クリックで閉じる
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  if (!isMounted) return null;

  return (
    <div 
      className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-50 w-full max-w-[28rem] px-4 transition-all duration-500 ease-out ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'
      }`}
    >
      <div className="flex justify-end" ref={dropdownRef}>
        {isOpen ? (
          <div className="relative">
            <button
              onClick={() => setIsOpen(false)}
              className={`w-[240px] flex items-center justify-between px-3 py-2 text-sm text-gray-200 rounded-md ${styles.glassEffect}`}
            >
              <span className="truncate">{selectedLabel}</span>
              <X className="h-4 w-4 opacity-50" />
            </button>
            <div className={`absolute bottom-full mb-2 right-0 w-[240px] rounded-md ${styles.glassContent}`}>
              <div className="max-h-[300px] overflow-y-auto overscroll-contain">
                {sortedDates.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => handleDateSelect(value)}
                    className={`w-full text-left px-3 py-2 text-sm text-gray-200 transition-colors ${styles.glassItem} ${
                      selectedDate && format(selectedDate, 'yyyy-MM-dd') === value ? 'bg-white/15' : ''
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsOpen(true)}
            className={`flex h-12 w-12 items-center justify-center rounded-full text-gray-200 transition-all hover:scale-110 md:h-14 md:w-14 ${styles.glassButton}`}
            aria-label="日付を選択"
          >
            <CalendarIcon className="h-5 w-5 md:h-6 md:w-6" />
          </button>
        )}
      </div>
    </div>
  );
}