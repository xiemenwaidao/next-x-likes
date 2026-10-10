'use client';

/**
 * 記事 (X Articles) ツイートのカード内アコーディオン。
 *
 * 記事ツイートは公式埋め込みだと URL しか出ないため、タイトル / カバー /
 * 冒頭プレビュー / AI 要約を折りたたみで見せ、全文は X へのリンクで読ませる。
 * 本文は著者の著作権上サイトに載せない。データは articles.json.gz を
 * クライアントで fetch するので、素の HTML には含まれない。
 */

import { useEffect, useState } from 'react';
import { ChevronDown, FileText } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { loadArticles, type ArticleInfo } from '@/lib/articles-client';

export function ArticleSection({ tweetId }: { tweetId: string }) {
  const [article, setArticle] = useState<ArticleInfo | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadArticles()
      .then((map) => {
        if (!cancelled) setArticle(map.get(tweetId) ?? null);
      })
      .catch(() => {
        /* 記事メタが取れなくてもカード本体は表示できるので無視 */
      });
    return () => {
      cancelled = true;
    };
  }, [tweetId]);

  if (!article) return null;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      style={{
        borderRadius: 10,
        background: 'oklch(20% 0.012 250 / 0.5)',
        boxShadow: 'inset 0 0 0 0.5px var(--line-soft)',
        overflow: 'hidden',
      }}
    >
      <CollapsibleTrigger
        className="flex w-full items-center gap-2 text-left cursor-pointer"
        style={{ padding: '10px 12px', background: 'transparent', border: 0 }}
      >
        <FileText size={13} strokeWidth={1.75} style={{ color: 'var(--text-2)', flexShrink: 0 }} />
        <span className="font-mono" style={{ fontSize: 10.5, color: 'var(--text-3)', flexShrink: 0 }}>
          {article.v === 'quote' ? '引用元の記事' : '記事'}
        </span>
        <span
          className="flex-1 min-w-0 truncate"
          style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-1)' }}
        >
          {article.t || '(無題)'}
        </span>
        <ChevronDown
          size={14}
          strokeWidth={1.75}
          style={{
            color: 'var(--text-3)',
            flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 160ms ease',
          }}
        />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="flex flex-col gap-2.5" style={{ padding: '0 12px 12px' }}>
          {article.c && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={article.c}
              alt=""
              loading="lazy"
              style={{
                width: '100%',
                aspectRatio: '5 / 2',
                objectFit: 'cover',
                borderRadius: 8,
                display: 'block',
              }}
            />
          )}
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-0)', lineHeight: 1.45 }}>
            {article.t}
          </div>
          {article.p && (
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-2)',
                lineHeight: 1.6,
                whiteSpace: 'pre-line',
              }}
            >
              {/* 段落間の空行は詰めて、冒頭だけをコンパクトに見せる */}
              {article.p.replace(/\n\s*\n+/g, '\n').trim()}…
            </div>
          )}
          {article.s && (
            <div
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                background: 'var(--zk-accent-soft)',
                boxShadow: 'inset 0 0 0 0.5px var(--zk-accent-line)',
              }}
            >
              <div className="font-mono" style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 4 }}>
                AI 要約
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-1)', lineHeight: 1.6 }}>{article.s}</div>
            </div>
          )}
          <a
            href={`https://x.com/i/status/${article.a}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono"
            style={{ fontSize: 11, color: 'var(--zk-accent)', alignSelf: 'flex-end' }}
          >
            X で全文を読む ↗
          </a>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
