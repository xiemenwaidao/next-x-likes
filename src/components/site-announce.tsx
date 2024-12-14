'use client';

import { usePathname } from 'next/navigation';

export function SiteAnnounce() {
  const pathname = usePathname();
  const isRootPath = pathname === '/';

  if (!isRootPath) {
    return <div></div>;
  }

  return (
    <p className="text-center italic">Dive into my liked tweets archive.</p>
  );
}
