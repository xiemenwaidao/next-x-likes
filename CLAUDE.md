# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js 15 application that displays liked tweets from X (Twitter) in a calendar-based interface. It serves as a personal archive system for managing and viewing liked tweets organized by date.

## Development Commands

```bash
# Development
pnpm dev          # Start development server at localhost:3000
pnpm build        # Build production application
pnpm start        # Run production server
pnpm lint         # Run Next.js linter

# Data Processing
pnpm json:dl             # Sync new likes from AWS S3
pnpm json:conv           # Process raw data into daily collections
pnpm json:fetch-tweet    # Enrich with full tweet data from X API

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

### Important Considerations
- All pages use static generation with `force-static` and `revalidate: false`
- Japan timezone (Asia/Tokyo) is used for date processing
- Private/deleted tweets are marked but still displayed with a notice
- The calendar highlights dates that have tweet data available

## Data Sync Process

To update the site with new liked tweets:
1. Run `pnpm json:dl` to sync from S3
2. Run `pnpm json:conv` to process into daily files
3. Run `pnpm json:fetch-tweet` to enrich with tweet data
4. Run `pnpm build` to regenerate static pages

## Environment Variables

Required for data sync operations:
- AWS credentials for S3 access (see sync-x-likes.ts)
- X/Twitter API access may be needed for enrichment