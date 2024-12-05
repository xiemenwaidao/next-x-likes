// /store/calendar-store.ts
import { create } from 'zustand';

type CalendarStore = {
  selectedDate: Date | undefined;
  setSelectedDate: (date: Date | undefined) => void;
};

export const useCalendarStore = create<CalendarStore>((set) => ({
  selectedDate: undefined,
  setSelectedDate: (date) => set({ selectedDate: date }),
}));
