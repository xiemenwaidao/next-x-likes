'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { useCombobox } from 'downshift';
import { algoliasearch } from 'algoliasearch';

interface SearchResult {
  objectID: string;
  text: string;
  username: string;
  date: string;
  path: string;
  _highlightResult?: {
    text?: { value: string };
    username?: { value: string };
  };
}

type SearchTarget = 'all' | 'text' | 'username';

interface SearchFilter {
  target: SearchTarget;
  label: string;
}

const searchFilters: SearchFilter[] = [
  { target: 'all', label: 'すべて' },
  { target: 'text', label: '本文' },
  { target: 'username', label: 'ユーザー名' },
];

// Initialize Algolia client
const getAlgoliaClient = () => {
  const appId = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID;
  const searchKey = process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY;

  if (!appId || !searchKey) {
    console.error('Missing Algolia credentials');
    return null;
  }

  return algoliasearch(appId, searchKey);
};

const SearchModal = ({ onClose }: { onClose: () => void }) => {
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [searchTarget, setSearchTarget] = useState<SearchTarget>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const router = useRouter();
  const algoliaClient = useRef(getAlgoliaClient());
  const searchTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  
  // IME composition状態を追跡するref（issue #1452の解決策）
  const onComposition = useRef(false);
  
  // input要素へのref（クリック時のフォーカス用）
  const inputRef = useRef<HTMLInputElement>(null);
  
  // IME対応のchangeハンドラー（issue #1452の解決策）
  const getOnChangeWithCompositionSupport = useCallback(
    ({ onChangeProp }: { onChangeProp?: (event: React.ChangeEvent<HTMLInputElement> | React.CompositionEvent<HTMLInputElement>) => void }) =>
    (event: React.ChangeEvent<HTMLInputElement> | React.CompositionEvent<HTMLInputElement>) => {
      // 入力値を常に更新（IMEの表示用）
      setInputValue(event.currentTarget.value);

      if (event.type === 'compositionstart') {
        onComposition.current = true;
        return;
      }

      if (event.type === 'compositionend') {
        onComposition.current = false;
      }

      // IME入力中でなければDownshiftのonChangeを呼び出す
      if (!onComposition.current) {
        onChangeProp?.(event);
      }
    },
    []
  );

  // Algolia search with debounce
  useEffect(() => {
    if (!algoliaClient.current) {
      console.error('Algolia client not initialized');
      return;
    }

    if (!inputValue.trim()) {
      setSearchResults([]);
      return;
    }

    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Set new timeout for debounced search
    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        // Build search options based on target
        const searchOptions: {
          indexName: string;
          query: string;
          hitsPerPage: number;
          restrictSearchableAttributes?: string[];
        } = {
          indexName: 'tweets',
          query: inputValue,
          hitsPerPage: 100,
        };

        if (searchTarget !== 'all') {
          searchOptions.restrictSearchableAttributes = [searchTarget];
        }

        const { results } = await algoliaClient.current!.search([searchOptions]);
        if (results && results[0] && 'hits' in results[0]) {
          setSearchResults(results[0].hits as SearchResult[]);
        } else {
          setSearchResults([]);
        }
      } catch (error) {
        console.error('Search error:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300); // 300ms debounce

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [inputValue, searchTarget]);

  // IME対応版 (issue #1452の解決策)
  const {
    isOpen: comboboxIsOpen,
    getMenuProps,
    getInputProps,
    getItemProps,
    highlightedIndex,
  } = useCombobox({
    items: searchResults,
    inputValue,
    // Downshift側では値を制御しない（手動で管理）
    onInputValueChange: () => {
      // 何もしない（IME対応ハンドラーで管理）
    },
    onSelectedItemChange: ({ selectedItem }) => {
      if (selectedItem) {
        onClose();
        router.push(selectedItem.path);
      }
    },
    itemToString: (item) => item?.text || '',
    // フォーカスが外れてもメニューを開いたままにする
    stateReducer: (state, actionAndChanges) => {
      const { type, changes } = actionAndChanges;
      // Blurイベント時にメニューを閉じないようにする
      if (type === useCombobox.stateChangeTypes.InputBlur) {
        return {
          ...changes,
          isOpen: state.isOpen, // 現在の開閉状態を維持
        };
      }
      return changes;
    },
  });

  // Highlight text helper
  const renderHighlightedText = (result: SearchResult, field: 'text' | 'username') => {
    const highlightedValue = result._highlightResult?.[field]?.value;
    if (!highlightedValue) {
      return result[field];
    }

    // Parse highlighted text and render with proper styling
    const parts = highlightedValue.split(/(<em>|<\/em>)/);
    return parts.map((part, index) => {
      if (part === '<em>') return null;
      if (part === '</em>') return null;
      const isHighlighted = parts[index - 1] === '<em>';
      return isHighlighted ? (
        <mark key={index} className="bg-yellow-500/30 text-inherit">{part}</mark>
      ) : (
        part
      );
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/50" onClick={onClose} />
      <div className="fixed top-20 left-1/2 -translate-x-1/2 w-[calc(100vw-1rem)] max-w-[28rem] z-[70]">
        <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700">
          <div>
            <div 
              className="flex items-center p-3 sm:p-4 border-b border-gray-700 cursor-text"
              onClick={(e) => {
                // パディング部分をクリックした時もinputにフォーカス
                if (e.target === e.currentTarget || !['INPUT', 'BUTTON'].includes((e.target as HTMLElement).tagName)) {
                  inputRef.current?.focus();
                }
              }}
            >
              <Search className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 mr-2 sm:mr-3 flex-shrink-0 pointer-events-none" />
              <input
                {...getInputProps({
                  ref: inputRef,
                  placeholder: searchTarget === 'text' ? 'ツイート本文を検索...' : searchTarget === 'username' ? 'ユーザー名を検索...' : 'ツイートを検索...',
                  className:
                    'flex-1 bg-transparent text-white placeholder-gray-400 outline-none text-base min-w-0',
                  autoFocus: true,
                  // IME対応のイベントハンドラー（issue #1452の解決策）
                  onChange: getOnChangeWithCompositionSupport({}),
                  onCompositionStart: getOnChangeWithCompositionSupport({}),
                  onCompositionEnd: getOnChangeWithCompositionSupport({}),
                  value: inputValue,
                })}
              />
              {isSearching && (
                <div className="mr-2 text-gray-400 text-sm">検索中...</div>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowFilters(!showFilters)}
                className="ml-1 sm:ml-2 flex-shrink-0 relative"
              >
                <Filter className="h-4 w-4 sm:h-5 sm:w-5" />
                {searchTarget !== 'all' && (
                  <span className="absolute -top-1 -right-1 h-2 w-2 bg-blue-500 rounded-full" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="ml-1 sm:ml-2 flex-shrink-0"
              >
                <X className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </div>
            
            {showFilters && (
              <div className="flex gap-2 p-3 border-b border-gray-700 bg-gray-800/50">
                {searchFilters.map((filter) => (
                  <Badge
                    key={filter.target}
                    variant={searchTarget === filter.target ? 'default' : 'secondary'}
                    className={`cursor-pointer transition-colors ${
                      searchTarget === filter.target
                        ? 'bg-blue-600 hover:bg-blue-700'
                        : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                    onClick={() => {
                      setSearchTarget(filter.target);
                      inputRef.current?.focus();
                    }}
                  >
                    {filter.label}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div {...getMenuProps()}>
            {comboboxIsOpen && searchResults.length > 0 && (
              <div className="max-h-96 overflow-y-auto">
                {searchResults.map((item, index) => (
                  <div
                    key={item.objectID}
                    {...getItemProps({ item, index })}
                    className={`w-full p-3 sm:p-4 text-left transition-colors border-b border-gray-700/50 last:border-b-0 cursor-pointer ${
                      highlightedIndex === index
                        ? 'bg-gray-700'
                        : 'hover:bg-gray-700'
                    }`}
                  >
                    <div className="text-xs sm:text-sm text-gray-400 mb-1 truncate">
                      @{renderHighlightedText(item, 'username')} · {item.date}
                    </div>
                    <div className="text-white line-clamp-2 text-sm sm:text-base">
                      {renderHighlightedText(item, 'text')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {inputValue && searchResults.length === 0 && !isSearching && (
            <div className="p-6 sm:p-8 text-center text-gray-400 text-sm sm:text-base">
              「{inputValue}」に一致するツイートは見つかりませんでした
            </div>
          )}

          {searchResults.length > 0 && (
            <div className="p-2 text-xs text-gray-500 text-center border-t border-gray-700 hidden sm:block">
              ↑↓ で選択 · Enter で開く · Esc で閉じる
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export const SearchBox = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleClose = () => {
    setIsOpen(false);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(true)}
        className="flex-none cursor-pointer"
      >
        <Search className="h-5 w-5" />
      </Button>

      {mounted &&
        isOpen &&
        createPortal(<SearchModal onClose={handleClose} />, document.body)}
    </>
  );
};