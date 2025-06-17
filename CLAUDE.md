# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js 15 application that displays liked tweets from X (Twitter) in a calendar-based interface. It serves as a personal archive system for managing and viewing liked tweets organized by date.

## Development Commands

**Important**: When adding new commands to package.json, always update this list in CLAUDE.md

```bash
# Development (Note: Always use pnpm, not npm or yarn)
pnpm dev          # Start development server at localhost:3000
pnpm build        # Build production application
pnpm start        # Run production server
pnpm lint         # Run Next.js linter

# Data Processing
pnpm json:dl                    # Sync new likes from AWS S3
pnpm json:conv                  # Process raw data into daily collections
pnpm json:fetch-tweet           # Enrich with full tweet data from X API
pnpm json:build-index           # Build tweet ID index for /tweet/<id> routes
pnpm json:build-search          # Build search index for full-text search
pnpm json:extract-urls          # Extract URLs from tweets for /urls page
pnpm json:remove-duplicates     # Remove duplicate tweets from processed data
pnpm json:remove-raw-duplicates # Remove duplicate files from raw S3 data
pnpm json:build-activity        # Build activity data for recent activity graph
pnpm json:process-archive       # Process Twitter archive files (like-twitter-*.js)
pnpm json:fetch-archive         # Fetch tweet data for archive tweets
pnpm json:build-algolia         # Build Algolia search index (full rebuild)
pnpm json:update-algolia        # Update Algolia search index (incremental)

# Git Commits
pnpm commit       # Create standardized commit with gitmoji
```

## Architecture

### Data Flow Pipeline
1. **Collection**: IFTTT webhook saves liked tweets to S3
2. **Sync**: `sync-x-likes.ts` downloads new files from S3 to `src/assets/data/x/likes/`
3. **Process**: `likes-processor.ts` organizes by date and extracts tweet IDs
4. **Enrich**: `insert-tweet-to-json.ts` fetches full tweet data using react-tweet
5. **Display**: Static pages generated for each day with tweets

### File Structure
- **Raw Data**: `src/assets/data/x/likes/YYYYMM/*.json` - Original IFTTT data
- **Processed Data**: `src/content/likes/YYYY/MM/DD.json` - Daily collections with enriched tweet data
- **Dynamic Routes**: `/[year]/[month]/[day]` - View tweets by date

### Key Components
- **CalendarPicker**: Interactive calendar using Zustand for state management
- **CustomTweet**: Renders tweets using react-tweet library
- **Main**: Layout wrapper that includes the calendar
- **SearchBox**: Full-text search with real-time suggestions as you type
- **RecentActivityGraph**: Shows recent like activity using shadcn/ui charts
- **AnnouncementList**: Header popup announcements with data-driven content

### UI Framework
This project uses **shadcn/ui** for UI components. shadcn/ui is a collection of reusable components built with Radix UI and Tailwind CSS.

#### Key shadcn Components Used:
- **Card**: Used for content containers
- **Button**: Interactive buttons
- **Calendar**: Date picker functionality
- **Chart**: Data visualization (based on Recharts)
- **Badge**: Status indicators
- **Popover**: Contextual overlays

#### Adding New Components:
```bash
pnpm dlx shadcn@latest add [component-name]
```

#### Design Guidelines:
- **Always prefer shadcn/ui components** when implementing new UI elements (dialogs, modals, dropdowns, etc.)
- Check existing shadcn components before creating custom solutions
- Use shadcn's Dialog component for modals and popups
- Use shadcn's DropdownMenu for navigation menus
- Maintain consistency with existing shadcn styling patterns

### Important Considerations
- All pages use static generation with `force-static` and `revalidate: false`
- Japan timezone (Asia/Tokyo) is used for date processing
- Private/deleted tweets are marked but still displayed with a notice
- The calendar highlights dates that have tweet data available
- All main content components (Calendar, RecentActivityGraph, etc.) use a consistent max width of `max-w-[28rem]` for visual unity
- Header announcements are managed in `src/data/announcements.ts` - update this file to add new features or modify existing ones

## Data Sync Process

To update the site with new liked tweets:
1. Run `pnpm json:dl` to sync from S3
2. Run `pnpm json:conv` to process into daily files
3. Run `pnpm json:fetch-tweet` to enrich with tweet data
4. Run `pnpm json:build-index` to create tweet ID index for individual tweet pages
5. Run `pnpm json:update-algolia` to update Algolia search index incrementally (or `pnpm json:build-algolia` for full rebuild)
6. Run `pnpm build` to regenerate static pages

Note: The old local search index generation (`pnpm json:build-search`) is now replaced by Algolia integration.

## Environment Variables

Required for data sync operations:
- AWS credentials for S3 access (see sync-x-likes.ts)
- X/Twitter API access may be needed for enrichment

Required for Algolia search integration:
- `NEXT_PUBLIC_ALGOLIA_APP_ID` - Your Algolia application ID
- `NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY` - Search-only API key for client-side search
- `ALGOLIA_ADMIN_API_KEY` - Admin API key for updating the search index (server-side only)