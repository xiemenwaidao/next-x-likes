'use client';

import { useState, useEffect } from 'react';
import { Archive, LinkIcon, CircleHelp, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { AnnouncementList } from './announcements';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  Dialog,
  DialogTrigger,
} from '@/components/ui/dialog';

export function MenuGrid() {
  const [showHelp, setShowHelp] = useState(false);
  const [open, setOpen] = useState(false);
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // パスが変わったらローディングを解除
  useEffect(() => {
    if (navigatingTo && pathname === navigatingTo) {
      setNavigatingTo(null);
      setOpen(false);
    }
  }, [pathname, navigatingTo]);

  const handleNavigation = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    
    // すでに同じページにいる場合は何もしない
    if (pathname === href) {
      setOpen(false);
      return;
    }
    
    setNavigatingTo(href);
    
    // 少し遅延を入れてからナビゲート（ローディング表示を見せるため）
    setTimeout(() => {
      router.push(href);
    }, 100);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="flex-none w-10 h-10 flex items-center justify-center rounded-md hover:bg-gray-800/50 transition-all duration-200 cursor-pointer group"
          aria-label="メニューを開く"
        >
          <div className="grid grid-cols-3 gap-[3px] w-[18px] h-[18px]">
            {[...Array(9)].map((_, i) => (
              <div 
                key={i} 
                className="bg-gray-500 rounded-[1px] transition-all duration-200 group-hover:bg-gray-400"
              />
            ))}
          </div>
        </button>
      </DialogTrigger>
      
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 glass-overlay-bg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content 
          className="fixed top-[50%] left-[50%] z-50 translate-x-[-50%] translate-y-[-50%] w-[calc(100vw-2rem)] max-w-md border-0 p-0 bg-transparent shadow-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-200"
        >
          <DialogPrimitive.Description className="sr-only">
            アーカイブ、URL、ヘルプへのアクセスメニュー
          </DialogPrimitive.Description>
          <div className={`glass-container transition-all duration-300 ${
            navigatingTo ? 'scale-98 opacity-90' : ''
          }`}>
            <div className="glass-wave-overlay" />
            
            <div className="relative z-10 p-4 pb-2 border-b border-gray-700/30">
              <DialogPrimitive.Title 
                className="text-lg font-semibold text-white"
                style={{ 
                  fontFamily: '"SF Pro Display", -apple-system, system-ui, sans-serif',
                  letterSpacing: '0.1em',
                  fontWeight: '600'
                }}
              >
                MENU
              </DialogPrimitive.Title>
            </div>
            
            <div className="relative z-10 p-4 space-y-2">
              <Link
                href="/archive/1"
                onClick={(e) => handleNavigation(e, '/archive/1')}
                className={`flex items-center gap-3 p-3 rounded-lg transition-all group w-full ${
                  navigatingTo === '/archive/1' 
                    ? 'bg-white/20 scale-95' 
                    : 'hover:bg-white/10'
                }`}
              >
                <div className="w-10 h-10 rounded-lg bg-gray-800/50 flex items-center justify-center transition-transform group-hover:scale-110">
                  {navigatingTo === '/archive/1' ? (
                    <Loader2 className="h-5 w-5 text-white animate-spin" />
                  ) : (
                    <Archive className="h-5 w-5 text-gray-400 group-hover:text-white transition-colors" />
                  )}
                </div>
                <div className="flex-1 text-left">
                  <div className="font-medium text-white transition-colors" style={{ fontFamily: '"SF Pro Display", -apple-system, system-ui, sans-serif' }}>Archive</div>
                  <div className="text-sm text-gray-400" style={{ fontFamily: '"SF Pro Display", -apple-system, system-ui, sans-serif' }}>Past liked tweets</div>
                </div>
              </Link>
              
              <Link
                href="/urls/1"
                onClick={(e) => handleNavigation(e, '/urls/1')}
                className={`flex items-center gap-3 p-3 rounded-lg transition-all group w-full ${
                  navigatingTo === '/urls/1' 
                    ? 'bg-white/20 scale-95' 
                    : 'hover:bg-white/10'
                }`}
              >
                <div className="w-10 h-10 rounded-lg bg-gray-800/50 flex items-center justify-center transition-transform group-hover:scale-110">
                  {navigatingTo === '/urls/1' ? (
                    <Loader2 className="h-5 w-5 text-white animate-spin" />
                  ) : (
                    <LinkIcon className="h-5 w-5 text-gray-400 group-hover:text-white transition-colors" />
                  )}
                </div>
                <div className="flex-1 text-left">
                  <div className="font-medium text-white transition-colors" style={{ fontFamily: '"SF Pro Display", -apple-system, system-ui, sans-serif' }}>URLs</div>
                  <div className="text-sm text-gray-400" style={{ fontFamily: '"SF Pro Display", -apple-system, system-ui, sans-serif' }}>Shared links collection</div>
                </div>
              </Link>
              
              <button
                onClick={() => setShowHelp(!showHelp)}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/10 transition-all group w-full cursor-pointer"
              >
                <div className="w-10 h-10 rounded-lg bg-gray-800/50 flex items-center justify-center transition-transform group-hover:scale-110">
                  <CircleHelp className="h-5 w-5 text-gray-400 group-hover:text-white transition-colors" />
                </div>
                <div className="flex-1 text-left">
                  <div className="font-medium text-white transition-colors" style={{ fontFamily: '"SF Pro Display", -apple-system, system-ui, sans-serif' }}>Help</div>
                  <div className="text-sm text-gray-400" style={{ fontFamily: '"SF Pro Display", -apple-system, system-ui, sans-serif' }}>Announcements & guide</div>
                </div>
              </button>
              
              {showHelp && (
                <div className="mt-2 p-3 rounded-lg bg-gray-800/30 border border-gray-700/30">
                  <AnnouncementList />
                </div>
              )}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
        
      <style jsx>{`
        :global(.glass-overlay-bg) {
          background: linear-gradient(135deg, rgba(0, 0, 0, 0.4) 0%, rgba(20, 20, 20, 0.2) 30%, rgba(0, 0, 0, 0.5) 100%) !important;
          backdrop-filter: blur(24px) saturate(200%) contrast(130%) brightness(110%) !important;
          -webkit-backdrop-filter: blur(24px) saturate(200%) contrast(130%) brightness(110%) !important;
        }
        
        :global(.glass-overlay-bg::before) {
          content: '';
          position: absolute;
          top: -100%;
          left: -100%;
          width: 300%;
          height: 300%;
          background: 
            radial-gradient(ellipse 400px 300px at 20% 30%, rgba(255, 255, 255, 0.25) 0%, transparent 50%),
            radial-gradient(ellipse 300px 400px at 80% 20%, rgba(255, 255, 255, 0.18) 0%, transparent 40%),
            radial-gradient(ellipse 350px 250px at 30% 80%, rgba(255, 255, 255, 0.15) 0%, transparent 35%),
            radial-gradient(ellipse 500px 200px at 70% 70%, rgba(255, 255, 255, 0.12) 0%, transparent 30%);
          animation: organicWave 8s ease-in-out infinite;
          pointer-events: none;
        }
        
        :global(.glass-overlay-bg::after) {
          content: '';
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: 
            conic-gradient(from 45deg at 30% 30%, 
              transparent 0deg, 
              rgba(255, 255, 255, 0.08) 45deg, 
              transparent 90deg, 
              rgba(255, 255, 255, 0.12) 135deg, 
              transparent 180deg, 
              rgba(255, 255, 255, 0.06) 225deg, 
              transparent 270deg, 
              rgba(255, 255, 255, 0.10) 315deg, 
              transparent 360deg);
          animation: spiralDrift 15s linear infinite;
          pointer-events: none;
        }
        
        .glass-container {
          position: relative;
          background: linear-gradient(145deg, rgba(15, 15, 15, 0.95) 0%, rgba(5, 5, 5, 0.98) 100%);
          backdrop-filter: blur(40px) saturate(150%);
          -webkit-backdrop-filter: blur(40px) saturate(150%);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 1rem;
          overflow: hidden;
          box-shadow: 
            0 25px 50px -12px rgba(0, 0, 0, 0.8),
            0 0 0 1px rgba(255, 255, 255, 0.05),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        }
        
        .glass-wave-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(135deg, rgba(0, 0, 0, 0.3) 0%, rgba(20, 20, 20, 0.1) 30%, rgba(0, 0, 0, 0.4) 100%);
          pointer-events: none;
          overflow: hidden;
        }
        
        @keyframes organicWave {
          0%, 100% {
            transform: translate(0%, 0%) rotate(0deg) scale(1) skew(0deg, 0deg);
          }
          16.66% {
            transform: translate(3%, -2%) rotate(2deg) scale(1.05) skew(1deg, -0.5deg);
          }
          33.33% {
            transform: translate(-1%, 4%) rotate(-1.5deg) scale(0.95) skew(-0.8deg, 1deg);
          }
          50% {
            transform: translate(-4%, -1%) rotate(1.8deg) scale(1.02) skew(0.5deg, -1.2deg);
          }
          66.66% {
            transform: translate(2%, 3%) rotate(-2.2deg) scale(0.98) skew(-1.1deg, 0.7deg);
          }
          83.33% {
            transform: translate(-2%, -3%) rotate(1.2deg) scale(1.03) skew(0.9deg, -0.8deg);
          }
        }
        
        @keyframes spiralDrift {
          0% {
            transform: translate(0%, 0%) rotate(0deg);
          }
          100% {
            transform: translate(0%, 0%) rotate(360deg);
          }
        }
        
        .scale-98 {
          transform: scale(0.98);
        }
      `}</style>
    </Dialog>
  );
}