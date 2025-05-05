'use client';

import { Button } from '@/components/ui/button';

export const ScrollTopButton = () => {
  return (
    <Button
      variant={'ghost'}
      size="icon"
      onClick={() => {
        window.scrollTo({
          top: 0,
          behavior: 'smooth',
        });
      }}
      className="fixed bottom-5 right-5 md:right-[calc(50vw-14rem+1.25rem)] backdrop-blur-md bg-gray-900/50 border-b border-gray-700/30 rounded-full p-3 transition-all duration-200 z-50"
    >
      ☝️
    </Button>
  );
};
