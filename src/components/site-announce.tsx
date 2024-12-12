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

  // Xで私自身がいいねした投稿をifttt/lambda/s3を利用してjsonに保存し、それをnextjsから読み込んで表示するサイトを作成しました。 サイトにカレンダーコンポーネントを置いていて、日付を選択したらその日にいいねした投稿を表示する仕組みなのですが、カレンダーの上に何かサイトの説明文を気取った感じで記載したいと考えています。私が考えた文章は「collection my iine tweets」です。
}
