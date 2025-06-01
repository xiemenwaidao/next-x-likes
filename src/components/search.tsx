'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

interface SearchIndexItem {
  id: string;
  text: string;
  username: string;
  date: string;
  path: string;
}

export const SearchBox = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchIndexItem[]>([]);
  const [searchIndex, setSearchIndex] = useState<SearchIndexItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    // 検索インデックスを読み込む
    fetch('/search-index.json')
      .then(res => res.json())
      .then((data: SearchIndexItem[]) => {
        setSearchIndex(data);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // ひらがなをカタカナに変換
  const toKatakana = (str: string) => {
    return str.replace(/[\u3041-\u3096]/g, (match) => {
      const chr = match.charCodeAt(0) + 0x60;
      return String.fromCharCode(chr);
    });
  };

  // カタカナをひらがなに変換
  const toHiragana = (str: string) => {
    return str.replace(/[\u30A1-\u30F6]/g, (match) => {
      const chr = match.charCodeAt(0) - 0x60;
      return String.fromCharCode(chr);
    });
  };

  // ひらがな/カタカナの両方のパターンでマッチングを試みる
  const matchesKanaVariations = (text: string, query: string) => {
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    
    // 元のクエリでマッチ
    if (lowerText.includes(lowerQuery)) return true;
    
    // クエリをひらがなに変換してマッチ
    const hiraganaQuery = toHiragana(lowerQuery);
    if (lowerText.includes(hiraganaQuery)) return true;
    
    // クエリをカタカナに変換してマッチ
    const katakanaQuery = toKatakana(lowerQuery);
    if (lowerText.includes(katakanaQuery)) return true;
    
    // テキストをひらがなに変換してマッチ
    const hiraganaText = toHiragana(lowerText);
    if (hiraganaText.includes(lowerQuery)) return true;
    
    // テキストをカタカナに変換してマッチ
    const katakanaText = toKatakana(lowerText);
    if (katakanaText.includes(lowerQuery)) return true;
    
    return false;
  };

  const handleSearch = useCallback((searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setSelectedIndex(-1);
      return;
    }

    // 空白で分割してAND検索
    const queries = searchQuery.split(/\s+/).filter(q => q);
    
    const searchResults = searchIndex.filter(item => {
      const searchText = `${item.text} ${item.username}`;
      // すべてのクエリが含まれているかチェック（ひらがな/カタカナ対応）
      return queries.every(q => matchesKanaVariations(searchText, q));
    }).slice(0, 10);

    setResults(searchResults);
    setSelectedIndex(-1);
  }, [searchIndex]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      handleSearch(query);
    }, 300);

    return () => clearTimeout(debounce);
  }, [query, handleSearch]);

  // 選択されたアイテムをスクロールして表示
  useEffect(() => {
    if (selectedIndex >= 0 && resultsContainerRef.current) {
      const container = resultsContainerRef.current;
      const selectedElement = container.children[selectedIndex] as HTMLElement;
      
      if (selectedElement) {
        const containerRect = container.getBoundingClientRect();
        const elementRect = selectedElement.getBoundingClientRect();
        
        // 要素が見えない場合はスクロール
        if (elementRect.bottom > containerRect.bottom) {
          selectedElement.scrollIntoView({ block: 'end', behavior: 'smooth' });
        } else if (elementRect.top < containerRect.top) {
          selectedElement.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }
      }
    }
  }, [selectedIndex]);

  const handleSelect = (path: string) => {
    setIsOpen(false);
    setQuery('');
    setResults([]);
    setSelectedIndex(-1);
    router.push(path);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setQuery('');
      setResults([]);
      setSelectedIndex(-1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => 
        prev < results.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      handleSelect(results[selectedIndex].path);
    }
  };

  const searchModal = isOpen && mounted && (
    <>
      <div 
        className="fixed inset-0 z-[60] bg-black/50" 
        onClick={() => {
          setIsOpen(false);
          setQuery('');
          setResults([]);
          setSelectedIndex(-1);
        }}
      />
      <div className="fixed top-20 left-1/2 -translate-x-1/2 w-full max-w-2xl p-4 z-[70]">
        <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700">
          <div className="flex items-center p-4 border-b border-gray-700">
            <Search className="h-5 w-5 text-gray-400 mr-3" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="ツイートを検索（空白区切りでAND検索）..."
              className="flex-1 bg-transparent text-white placeholder-gray-400 outline-none"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setIsOpen(false);
                setQuery('');
                setResults([]);
                setSelectedIndex(-1);
              }}
              className="ml-2"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {results.length > 0 && (
            <div ref={resultsContainerRef} className="max-h-96 overflow-y-auto">
              {results.map((result, index) => (
                <button
                  key={result.id}
                  onClick={() => handleSelect(result.path)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`w-full p-4 text-left transition-colors border-b border-gray-700/50 last:border-b-0 ${
                    index === selectedIndex 
                      ? 'bg-gray-700' 
                      : 'hover:bg-gray-700'
                  }`}
                >
                  <div className="text-sm text-gray-400 mb-1">
                    @{result.username} · {result.date}
                  </div>
                  <div className="text-white line-clamp-2">
                    {result.text}
                  </div>
                </button>
              ))}
            </div>
          )}

          {query && results.length === 0 && (
            <div className="p-8 text-center text-gray-400">
              「{query}」に一致するツイートは見つかりませんでした
            </div>
          )}

          {results.length > 0 && (
            <div className="p-2 text-xs text-gray-500 text-center border-t border-gray-700">
              ↑↓ で選択 · Enter で開く · Esc で閉じる
            </div>
          )}
        </div>
      </div>
    </>
  );

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(true)}
        className="flex-none"
      >
        <Search className="h-5 w-5" />
      </Button>

      {mounted && searchModal && createPortal(searchModal, document.body)}
    </>
  );
};