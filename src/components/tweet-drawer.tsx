'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { CustomTweet } from '@/components/custom-tweet';
import { DayJson } from '@/types/like';
import { useCalendarStore } from '@/store/calendar-store';

interface TweetDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  date: Date | null;
}

export function TweetDrawer({ isOpen, onClose, date }: TweetDrawerProps) {
  const [content, setContent] = useState<DayJson | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!date || !isOpen) return;

    const fetchContent = async () => {
      setLoading(true);
      try {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        
        const response = await fetch(`/api/tweets/${year}/${month}/${day}`);
        if (response.ok) {
          const data = await response.json();
          setContent(data);
        } else {
          setContent(null);
        }
      } catch (error) {
        console.error('Failed to fetch tweets:', error);
        setContent(null);
      } finally {
        setLoading(false);
      }
    };

    fetchContent();
  }, [date, isOpen]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm transition-all duration-300 z-40 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 bg-gray-900 rounded-t-3xl shadow-2xl transition-all duration-300 ease-out transform ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ maxHeight: '90vh', touchAction: 'pan-y' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3">
          <div className="w-12 h-1 bg-gray-600 rounded-full" />
        </div>
        
        {/* Header */}
        <div className="sticky top-0 bg-gray-900 px-4 py-4 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-100">
                {date && (
                  <>
                    liked on: {date.getFullYear()}/
                    {String(date.getMonth() + 1).padStart(2, '0')}/
                    {String(date.getDate()).padStart(2, '0')}
                  </>
                )}
              </h2>
              <p className="text-sm text-gray-400">
                {content?.body.length || 0} tweets
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-800 transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="overflow-y-auto overscroll-contain" style={{ maxHeight: 'calc(90vh - 120px)' }}>
          <div className="w-full max-w-md mx-auto space-y-4 p-4 pb-8">
            {loading ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300" />
              </div>
            ) : content === null ? (
              <div className="text-center italic text-lg py-8">
                Not Found : (ง ˙ω˙)ว
              </div>
            ) : (
              content?.body.map(
                (tweet) =>
                  tweet.tweet_id && (
                    <CustomTweet
                      key={tweet.tweet_id}
                      tweetData={tweet.react_tweet_data}
                      tweetId={tweet.tweet_id}
                      isPrivate={tweet.private}
                      isNotFound={tweet.notfound}
                    />
                  ),
              )
            )}
          </div>
        </div>
      </div>
    </>
  );
}