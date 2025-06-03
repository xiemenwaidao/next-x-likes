// /store/calendar-store.ts
import { create } from 'zustand';

type CalendarStore = {
  selectedDate: Date | undefined;
  setSelectedDate: (date: Date | undefined) => void;
  displayMonth: Date | undefined;
  setDisplayMonth: (date: Date | undefined) => void;
  isDrawerOpen: boolean;
  setIsDrawerOpen: (isOpen: boolean) => void;
};

export const useCalendarStore = create<CalendarStore>((set) => ({
  selectedDate: undefined,
  setSelectedDate: (date) => set({ selectedDate: date }),
  displayMonth: undefined,
  setDisplayMonth: (date) => set({ displayMonth: date }),
  isDrawerOpen: false,
  setIsDrawerOpen: (isOpen) => set({ isDrawerOpen: isOpen }),
}));
