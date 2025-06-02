'use client';

import { Link2 } from 'lucide-react';

interface UrlCardImageProps {
  src: string;
  alt: string;
  className?: string;
}

export function UrlCardImage({ className }: UrlCardImageProps) {
  // 一時的に全てフォールバック画像を表示
  // TODO: 将来的にはsrcとaltを使用してOG画像を表示
  return (
    <div className={`${className} bg-gray-800 flex items-center justify-center`}>
      <div className="text-gray-600">
        <Link2 className="h-12 w-12" />
      </div>
    </div>
  );
}