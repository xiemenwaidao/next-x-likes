'use client';

import { useState, useEffect } from 'react';
import {
  Archive,
  LinkIcon,
  CircleHelp,
  Loader2,
  Search as SearchIcon,
  CalendarDays,
  LayoutGrid,
  Headphones,
  X as CloseIcon,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { AnnouncementList } from './announcements';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';

type MenuItem = {
  id: string;
  title: string;
  sub: string;
  href: string;
  icon: React.ReactNode;
  match: (pathname: string) => boolean;
};

const MENU_ITEMS: MenuItem[] = [
  {
    id: 'home',
    title: 'ホーム',
    sub: 'カレンダー / カテゴリで探す',
    href: '/',
    icon: <CalendarDays size={18} strokeWidth={1.75} />,
    match: (p) => p === '/',
  },
  {
    id: 'search',
    title: '検索',
    sub: 'キーワード・意味で全件横断',
    href: '/search',
    icon: <SearchIcon size={18} strokeWidth={1.75} />,
    match: (p) => p.startsWith('/search'),
  },
  {
    id: 'categories',
    title: 'カテゴリ',
    sub: '11 カテゴリ別に眺める',
    href: '/?tab=categories',
    icon: <LayoutGrid size={18} strokeWidth={1.75} />,
    match: (p) => p.startsWith('/categories'),
  },
  {
    id: 'podcast',
    title: '集讚館ラジオ',
    sub: '週まとめを聞きながら眺める',
    href: '/podcast',
    icon: <Headphones size={18} strokeWidth={1.75} />,
    match: (p) => p.startsWith('/podcast'),
  },
  {
    id: 'archive',
    title: 'アーカイブ',
    sub: '月別 / 年別の一覧',
    href: '/archive/1',
    icon: <Archive size={18} strokeWidth={1.75} />,
    match: (p) => p.startsWith('/archive'),
  },
  {
    id: 'urls',
    title: 'URL 一覧',
    sub: 'いいねしたツイートの外部リンク',
    href: '/urls/1',
    icon: <LinkIcon size={14} strokeWidth={1.75} />,
    match: (p) => p.startsWith('/urls'),
  },
];

export function MenuGrid() {
  const [showHelp, setShowHelp] = useState(false);
  const [open, setOpen] = useState(false);
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname() ?? '/';

  useEffect(() => {
    if (navigatingTo && pathname === navigatingTo) {
      setNavigatingTo(null);
      setOpen(false);
    }
  }, [pathname, navigatingTo]);

  const handleNavigation = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string,
  ) => {
    e.preventDefault();
    if (pathname === href) {
      setOpen(false);
      return;
    }
    setNavigatingTo(href);
    setTimeout(() => {
      router.push(href);
    }, 100);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="zk-icon-btn relative"
          aria-label="メニューを開く"
          type="button"
        >
          <span className="zk-dots">
            {Array.from({ length: 9 }).map((_, i) => (
              <i key={i} />
            ))}
          </span>
        </button>
      </DialogTrigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          style={{
            background: 'oklch(8% 0.01 250 / 0.6)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        />
        <DialogPrimitive.Content
          className="fixed top-[50%] left-[50%] z-50 translate-x-[-50%] translate-y-[-50%] w-[calc(100vw-2rem)] max-w-md border-0 p-0 bg-transparent shadow-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-200"
        >
          <DialogPrimitive.Description className="sr-only">
            ホーム、検索、カテゴリ、アーカイブ、URL、ヘルプへのアクセスメニュー
          </DialogPrimitive.Description>
          <div
            style={{
              background: 'var(--bg-1)',
              borderRadius: 20,
              boxShadow:
                'inset 0 0 0 0.5px var(--line), 0 24px 64px rgba(0,0,0,0.5)',
              padding: 18,
              position: 'relative',
            }}
          >
            <div className="flex items-center justify-between mb-2.5 pt-1 px-1">
              <DialogPrimitive.Title
                className="font-mono"
                style={{
                  fontSize: 10,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: 'var(--text-3)',
                }}
              >
                menu
              </DialogPrimitive.Title>
              <DialogPrimitive.Close asChild>
                <button
                  className="zk-icon-btn"
                  style={{ width: 28, height: 28 }}
                  aria-label="閉じる"
                >
                  <CloseIcon size={14} strokeWidth={1.75} />
                </button>
              </DialogPrimitive.Close>
            </div>

            <div className="flex flex-col gap-0.5">
              {MENU_ITEMS.map((it) => {
                const active = it.match(pathname);
                const loading = navigatingTo === it.href;
                return (
                  <Link
                    key={it.id}
                    href={it.href}
                    onClick={(e) => handleNavigation(e, it.href)}
                    className="flex items-center gap-3 transition-colors group"
                    style={{
                      padding: '10px 8px',
                      borderRadius: 10,
                      background: active
                        ? 'var(--bg-2)'
                        : 'transparent',
                    }}
                  >
                    <div
                      className="flex-shrink-0 flex items-center justify-center"
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: active
                          ? 'var(--zk-accent-soft)'
                          : 'var(--bg-2)',
                        color: active
                          ? 'var(--zk-accent)'
                          : 'var(--text-2)',
                        boxShadow: 'inset 0 0 0 0.5px var(--line-soft)',
                      }}
                    >
                      {loading ? (
                        <Loader2
                          size={18}
                          strokeWidth={1.75}
                          className="animate-spin"
                        />
                      ) : (
                        it.icon
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: 'var(--text-0)',
                        }}
                      >
                        {it.title}
                      </div>
                      <div
                        style={{
                          fontSize: 11.5,
                          color: 'var(--text-3)',
                          marginTop: 1,
                        }}
                      >
                        {it.sub}
                      </div>
                    </div>
                    <ChevronRight
                      size={14}
                      strokeWidth={1.75}
                      style={{ color: 'var(--text-3)' }}
                    />
                  </Link>
                );
              })}

              <button
                type="button"
                onClick={() => setShowHelp((v) => !v)}
                className="flex items-center gap-3 transition-colors group w-full text-left cursor-pointer"
                style={{
                  padding: '10px 8px',
                  borderRadius: 10,
                  background: 'transparent',
                  border: 0,
                }}
              >
                <div
                  className="flex-shrink-0 flex items-center justify-center"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: 'var(--bg-2)',
                    color: 'var(--text-2)',
                    boxShadow: 'inset 0 0 0 0.5px var(--line-soft)',
                  }}
                >
                  <CircleHelp size={18} strokeWidth={1.75} />
                </div>
                <div className="flex-1 text-left">
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--text-0)',
                    }}
                  >
                    ヘルプ
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: 'var(--text-3)',
                      marginTop: 1,
                    }}
                  >
                    お知らせと使い方
                  </div>
                </div>
                <Sparkles
                  size={14}
                  strokeWidth={1.75}
                  style={{ color: 'var(--text-3)' }}
                />
              </button>

              {showHelp && (
                <div
                  style={{
                    marginTop: 4,
                    padding: 12,
                    borderRadius: 10,
                    background: 'oklch(20% 0.012 250 / 0.5)',
                    boxShadow: 'inset 0 0 0 0.5px var(--line-soft)',
                  }}
                >
                  <AnnouncementList />
                </div>
              )}
            </div>

            <div
              className="flex justify-between font-mono"
              style={{
                marginTop: 8,
                padding: '10px 8px 0',
                borderTop: '0.5px solid var(--line-soft)',
                fontSize: 10.5,
                color: 'var(--text-3)',
              }}
            >
              <span>集讚館 · xiemen-zankan</span>
              <span>{new Date().getFullYear()}</span>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}
