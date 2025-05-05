'use client';

import { Button } from '@/components/ui/button';

export const ScrollTopButton = () => {
  return (
    <div className="">
      <Button
        variant={'ghost'}
        size="icon"
        onClick={() => {
          window.scrollTo({
            top: 0,
            behavior: 'smooth',
          });
        }}
        className="fixed bottom-4 right-4 z-50 backdrop-blur-md bg-gray-900/50 border-b border-gray-700/30 rounded-full p-3 transition-all duration-200"
      >
        ☝️
      </Button>
    </div>
  );
};
