/**
 * TweetCard — react-tweet 依存を捨てた自前ツイートレンダラ。
 * raw_json (X / react-tweet API レスポンス) をそのまま受け取り、entities / mediaDetails /
 * quoted_tweet / card を解釈して JSX に変換する。サーバコンポーネントで動く純 JSX。
 */
import Image from 'next/image';
import { BadgeCheck, Link2 } from 'lucide-react';

type Indices = [number, number];

type MediaEntity = {
  display_url: string;
  expanded_url: string;
  indices: Indices;
  url: string;
};

type UrlEntity = {
  display_url: string;
  expanded_url: string;
  indices: Indices;
  url: string;
};

type UserMention = {
  id_str: string;
  name: string;
  screen_name: string;
  indices: Indices;
};

type Hashtag = { text: string; indices: Indices };
type Symbol = { text: string; indices: Indices };

type Entities = {
  hashtags?: Hashtag[];
  symbols?: Symbol[];
  urls?: UrlEntity[];
  user_mentions?: UserMention[];
  media?: MediaEntity[];
};

type MediaDetail = {
  type: 'photo' | 'video' | 'animated_gif' | string;
  media_url_https: string;
  display_url?: string;
  expanded_url?: string;
  indices?: Indices;
  url?: string;
  video_info?: {
    aspect_ratio?: [number, number];
    duration_millis?: number;
    variants?: Array<{
      content_type: string;
      url: string;
      bitrate?: number;
    }>;
  };
  original_info?: { width: number; height: number };
  ext_alt_text?: string;
};

type TweetUser = {
  id_str: string;
  name: string;
  screen_name: string;
  profile_image_url_https?: string;
  profile_image_shape?: string;
  is_blue_verified?: boolean;
  verified?: boolean;
};

type Card = {
  url?: string;
  name?: string;
  binding_values?: {
    title?: { string_value?: string };
    description?: { string_value?: string };
    domain?: { string_value?: string };
    card_url?: { string_value?: string };
    thumbnail_image_original?: {
      image_value?: { url: string; width?: number; height?: number };
    };
    photo_image_full_size_original?: {
      image_value?: { url: string; width?: number; height?: number };
    };
    summary_photo_image_original?: {
      image_value?: { url: string; width?: number; height?: number };
    };
  };
};

export type RawTweet = {
  id_str?: string;
  text?: string;
  display_text_range?: Indices;
  entities?: Entities;
  mediaDetails?: MediaDetail[];
  user?: TweetUser;
  created_at?: string;
  quoted_tweet?: RawTweet;
  card?: Card;
};

export type TweetCardProps = {
  /** raw_json (JSON string か object どちらでも受ける) */
  raw: RawTweet | string | null | undefined;
  /** SQLite から渡される fallback 用 */
  fallback?: {
    tweetId: string;
    text?: string;
    username?: string;
    tweetUrl?: string;
    isPrivate?: boolean;
    isNotFound?: boolean;
  };
};

function parseRaw(raw: TweetCardProps['raw']): RawTweet | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    if (raw === '' || raw === '{}') return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed as RawTweet;
    } catch {
      return null;
    }
  }
  return raw;
}

// 文字列を Unicode コードポイント単位で扱う (X の indices は UTF-16 code unit 基準)
function sliceByCodeUnit(s: string, start: number, end: number): string {
  return s.substring(start, end);
}

type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'link'; text: string; href: string }
  | { kind: 'mention'; text: string; href: string }
  | { kind: 'hashtag'; text: string; href: string }
  | { kind: 'media'; entity: MediaEntity }; // 表示テキストからは除去するが entity 情報は保持

function renderTextSegments(
  text: string,
  entities: Entities | undefined,
  displayRange: Indices | undefined,
): Segment[] {
  if (!text) return [];
  const [rangeStart, rangeEnd] = displayRange ?? [0, text.length];

  type Marker = {
    start: number;
    end: number;
    seg: Segment;
  };
  const markers: Marker[] = [];

  for (const u of entities?.urls ?? []) {
    markers.push({
      start: u.indices[0],
      end: u.indices[1],
      seg: {
        kind: 'link',
        text: u.display_url || u.expanded_url || u.url,
        href: u.expanded_url || u.url,
      },
    });
  }
  for (const m of entities?.user_mentions ?? []) {
    markers.push({
      start: m.indices[0],
      end: m.indices[1],
      seg: {
        kind: 'mention',
        text: `@${m.screen_name}`,
        href: `https://x.com/${m.screen_name}`,
      },
    });
  }
  for (const h of entities?.hashtags ?? []) {
    markers.push({
      start: h.indices[0],
      end: h.indices[1],
      seg: {
        kind: 'hashtag',
        text: `#${h.text}`,
        href: `https://x.com/hashtag/${h.text}`,
      },
    });
  }
  // メディア URL は本文から除去（メディア自体は別表示）
  for (const m of entities?.media ?? []) {
    markers.push({
      start: m.indices[0],
      end: m.indices[1],
      seg: { kind: 'media', entity: m },
    });
  }

  markers.sort((a, b) => a.start - b.start);

  const segments: Segment[] = [];
  let cursor = rangeStart;
  for (const mk of markers) {
    if (mk.end <= rangeStart) continue;
    if (mk.start >= rangeEnd) break;
    if (mk.start > cursor) {
      segments.push({
        kind: 'text',
        text: sliceByCodeUnit(text, cursor, mk.start),
      });
    }
    if (mk.seg.kind !== 'media') segments.push(mk.seg);
    cursor = Math.max(cursor, mk.end);
  }
  if (cursor < rangeEnd) {
    segments.push({
      kind: 'text',
      text: sliceByCodeUnit(text, cursor, rangeEnd),
    });
  }
  return segments;
}

function TweetText({
  text,
  entities,
  displayRange,
}: {
  text: string;
  entities?: Entities;
  displayRange?: Indices;
}) {
  const segments = renderTextSegments(text, entities, displayRange);
  return (
    <p className="whitespace-pre-wrap text-[15px] leading-[1.4] text-gray-100">
      {segments.map((seg, i) => {
        switch (seg.kind) {
          case 'text':
            return <span key={i}>{seg.text}</span>;
          case 'link':
            return (
              <a
                key={i}
                href={seg.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-400 hover:underline"
              >
                {seg.text}
              </a>
            );
          case 'mention':
            return (
              <a
                key={i}
                href={seg.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-400 hover:underline"
              >
                {seg.text}
              </a>
            );
          case 'hashtag':
            return (
              <a
                key={i}
                href={seg.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-400 hover:underline"
              >
                {seg.text}
              </a>
            );
          default:
            return null;
        }
      })}
    </p>
  );
}

function MediaGrid({ media }: { media: MediaDetail[] }) {
  if (!media || media.length === 0) return null;
  const count = media.length;
  // 1: 1col, 2-4: 2col grid
  const gridCols = count === 1 ? 'grid-cols-1' : 'grid-cols-2';
  return (
    <div className={`mt-3 grid gap-1 overflow-hidden rounded-2xl ${gridCols}`}>
      {media.slice(0, 4).map((m, i) => {
        if (m.type === 'video' || m.type === 'animated_gif') {
          const variants = (m.video_info?.variants ?? []).filter(
            (v) => v.content_type === 'video/mp4',
          );
          const best =
            variants.length > 0
              ? variants.reduce((a, b) =>
                  (a.bitrate ?? 0) > (b.bitrate ?? 0) ? a : b,
                )
              : null;
          return (
            <div
              key={i}
              className="relative w-full overflow-hidden bg-black"
              style={{ aspectRatio: '16/9' }}
            >
              {best ? (
                <video
                  src={best.url}
                  poster={m.media_url_https}
                  controls
                  preload="metadata"
                  className="h-full w-full object-cover"
                  playsInline
                />
              ) : (
                <img
                  src={m.media_url_https}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              )}
            </div>
          );
        }
        // photo
        const w = m.original_info?.width ?? 1200;
        const h = m.original_info?.height ?? 800;
        return (
          <a
            key={i}
            href={m.expanded_url ?? m.media_url_https}
            target="_blank"
            rel="noopener noreferrer"
            className="relative block overflow-hidden bg-gray-800"
            style={count === 1 ? { aspectRatio: `${w}/${h}` } : { aspectRatio: '1/1' }}
          >
            <Image
              src={m.media_url_https}
              alt={m.ext_alt_text ?? ''}
              fill
              sizes="(max-width: 768px) 100vw, 480px"
              className="object-cover"
              unoptimized
            />
          </a>
        );
      })}
    </div>
  );
}

function CardPreview({ card }: { card: Card }) {
  const bv = card.binding_values ?? {};
  const title = bv.title?.string_value;
  const desc = bv.description?.string_value;
  const domain = bv.domain?.string_value;
  const url = bv.card_url?.string_value ?? card.url;
  const img =
    bv.summary_photo_image_original?.image_value?.url ??
    bv.thumbnail_image_original?.image_value?.url ??
    bv.photo_image_full_size_original?.image_value?.url;

  if (!title && !url) return null;

  return (
    <a
      href={url ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 block overflow-hidden rounded-2xl border border-gray-700/60 transition hover:bg-gray-800/50"
    >
      {img && (
        <div className="relative aspect-[2/1] w-full bg-gray-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
      )}
      <div className="p-3">
        {domain && (
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Link2 className="h-3 w-3" />
            <span>{domain}</span>
          </div>
        )}
        {title && (
          <div className="mt-1 line-clamp-2 text-sm font-medium text-gray-100">
            {title}
          </div>
        )}
        {desc && (
          <div className="mt-1 line-clamp-2 text-xs text-gray-400">{desc}</div>
        )}
      </div>
    </a>
  );
}

function UserHeader({
  user,
  createdAt,
  tweetId,
}: {
  user: TweetUser;
  createdAt?: string;
  tweetId?: string;
}) {
  const tweetUrl =
    tweetId && user.screen_name
      ? `https://x.com/${user.screen_name}/status/${tweetId}`
      : `https://x.com/${user.screen_name}`;
  const isVerified = user.is_blue_verified || user.verified;
  return (
    <div className="flex items-start gap-3">
      {user.profile_image_url_https && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.profile_image_url_https.replace('_normal', '_bigger')}
          alt={user.name}
          className={
            user.profile_image_shape === 'Square'
              ? 'h-10 w-10 rounded-md'
              : 'h-10 w-10 rounded-full'
          }
          loading="lazy"
        />
      )}
      <div className="min-w-0 flex-1">
        <a
          href={tweetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block hover:underline"
        >
          <div className="flex items-center gap-1">
            <span className="truncate text-sm font-semibold text-gray-100">
              {user.name}
            </span>
            {isVerified && (
              <BadgeCheck className="h-4 w-4 shrink-0 text-sky-400" />
            )}
          </div>
          <div className="truncate text-xs text-gray-400">
            @{user.screen_name}
            {createdAt && (
              <>
                {' · '}
                {formatRelative(createdAt)}
              </>
            )}
          </div>
        </a>
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'Asia/Tokyo',
    }).format(d);
  } catch {
    return '';
  }
}

function TweetInner({ tweet }: { tweet: RawTweet }) {
  const user = tweet.user;
  return (
    <div className="space-y-2">
      {user && (
        <UserHeader
          user={user}
          createdAt={tweet.created_at}
          tweetId={tweet.id_str}
        />
      )}
      {tweet.text && (
        <TweetText
          text={tweet.text}
          entities={tweet.entities}
          displayRange={tweet.display_text_range}
        />
      )}
      {tweet.mediaDetails && tweet.mediaDetails.length > 0 && (
        <MediaGrid media={tweet.mediaDetails} />
      )}
      {tweet.card && <CardPreview card={tweet.card} />}
      {tweet.quoted_tweet && (
        <div className="mt-3 rounded-2xl border border-gray-700/60 p-3">
          <TweetInner tweet={tweet.quoted_tweet} />
        </div>
      )}
    </div>
  );
}

export function TweetCard({ raw, fallback }: TweetCardProps) {
  const tweet = parseRaw(raw);

  if (fallback?.isPrivate || fallback?.isNotFound) {
    return (
      <div className="rounded-2xl border border-gray-700/60 bg-gray-900/40 p-4 text-sm text-gray-400">
        <p className="mb-2">
          {fallback.isPrivate
            ? 'このツイートは非公開（鍵）です'
            : 'このツイートは削除されたか取得できませんでした'}
        </p>
        {fallback.text && (
          <p className="text-gray-300">{fallback.text}</p>
        )}
        {fallback.username && (
          <p className="mt-2 text-xs text-gray-500">@{fallback.username}</p>
        )}
        {fallback.tweetUrl && (
          <a
            href={fallback.tweetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-xs text-sky-400 hover:underline"
          >
            X で見る →
          </a>
        )}
      </div>
    );
  }

  if (!tweet || !tweet.user) {
    // raw_json が空 (archive など) のフォールバック
    return (
      <div className="rounded-2xl border border-gray-700/60 bg-gray-900/40 p-4">
        {fallback?.text && (
          <p className="text-sm text-gray-100 whitespace-pre-wrap">
            {fallback.text}
          </p>
        )}
        {fallback?.username && (
          <p className="mt-2 text-xs text-gray-500">@{fallback.username}</p>
        )}
        {fallback?.tweetUrl && (
          <a
            href={fallback.tweetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-xs text-sky-400 hover:underline"
          >
            X で見る →
          </a>
        )}
      </div>
    );
  }

  return (
    <article className="rounded-2xl border border-gray-700/60 bg-gray-900/40 p-4 backdrop-blur-sm">
      <TweetInner tweet={tweet} />
    </article>
  );
}
