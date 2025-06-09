import * as fs from 'fs/promises';
import * as path from 'path';
import { fetchTweet } from 'react-tweet/api';

interface ProcessedArchiveLike {
  id: string;
  tweetId: string;
  fullText?: string;
  expandedUrl: string;
  isArchive: true;
  processedAt: string;
}

interface EnrichedArchiveLike extends ProcessedArchiveLike {
  react_tweet_data?: unknown;
  private?: boolean;
  notfound?: boolean;
  fetchedAt?: string;
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createPageFiles(
  enrichedLikes: EnrichedArchiveLike[],
  archiveDir: string,
) {
  const PAGE_SIZE = 20;
  const totalPages = Math.ceil(enrichedLikes.length / PAGE_SIZE);

  const pagesDir = path.join(archiveDir, 'pages');
  await fs.mkdir(pagesDir, { recursive: true });

  for (let page = 0; page < totalPages; page++) {
    const start = page * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, enrichedLikes.length);
    const pageLikes = enrichedLikes.slice(start, end);

    const pageData = {
      page: page + 1,
      totalPages,
      totalLikes: enrichedLikes.length,
      likes: pageLikes,
    };

    const pagePath = path.join(pagesDir, `page-${page + 1}.json`);
    await fs.writeFile(pagePath, JSON.stringify(pageData, null, 2));
  }

  return totalPages;
}

async function fetchArchiveTweets() {
  const projectRoot = path.join(__dirname, '../../');
  const archiveDir = path.join(projectRoot, 'src/content/archive');
  const inputPath = path.join(archiveDir, 'archive-likes.json');
  const outputPath = path.join(archiveDir, 'archive-likes-enriched.json');

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\nReceived interrupt signal. Progress has been saved.');
    console.log('Run the command again to continue from where you left off.');
    process.exit(0);
  });

  // Load processed archive data
  const content = await fs.readFile(inputPath, 'utf-8');
  const likes: ProcessedArchiveLike[] = JSON.parse(content);

  console.log(`Loading ${likes.length} archive likes...`);

  // Check if we already have enriched data
  let enrichedLikes: EnrichedArchiveLike[] = [];
  try {
    const existingContent = await fs.readFile(outputPath, 'utf-8');
    enrichedLikes = JSON.parse(existingContent);
    console.log(
      `Found existing enriched data with ${enrichedLikes.length} tweets`,
    );
  } catch {
    console.log('No existing enriched data found, starting fresh');
    enrichedLikes = likes.map((like) => ({ ...like }));
  }

  // Find tweets that need fetching
  const toFetch = enrichedLikes.filter(
    (like) => !like.react_tweet_data && !like.private && !like.notfound,
  );
  console.log(`Need to fetch data for ${toFetch.length} tweets`);

  // Count already fetched
  const alreadyFetched = enrichedLikes.filter(
    (like) => like.react_tweet_data || like.private || like.notfound,
  ).length;
  console.log(`Already fetched: ${alreadyFetched} tweets`);

  // Create initial page files if we have any data
  if (alreadyFetched > 0) {
    console.log('Creating page files for already fetched tweets...');
    const totalPages = await createPageFiles(enrichedLikes, archiveDir);
    console.log(`Created ${totalPages} page files`);
  }

  let successCount = 0;
  let errorCount = 0;
  let lastPageUpdateCount = 0;

  for (let i = 0; i < toFetch.length; i++) {
    const like = toFetch[i];
    console.log(
      `[${i + 1}/${toFetch.length}] Fetching tweet ${
        like.tweetId
      }... (Total progress: ${alreadyFetched + i + 1}/${enrichedLikes.length})`,
    );

    try {
      const { data, tombstone, notFound } = await fetchTweet(like.tweetId);

      if (data) {
        like.react_tweet_data = data;
        like.fetchedAt = new Date().toISOString();
        successCount++;
        console.log(`✓ Successfully fetched tweet ${like.tweetId}`);
      } else if (tombstone) {
        like.private = true;
        errorCount++;
        console.log(`✗ Tweet is private: ${like.tweetId}`);
      } else if (notFound) {
        like.notfound = true;
        errorCount++;
        console.log(`✗ Tweet not found: ${like.tweetId}`);
      }
    } catch (error) {
      like.notfound = true;
      errorCount++;
      console.log(
        `✗ Error fetching tweet ${like.tweetId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }

    // Save progress every 10 tweets
    if ((i + 1) % 10 === 0 || i === toFetch.length - 1) {
      await fs.writeFile(outputPath, JSON.stringify(enrichedLikes, null, 2));
      console.log(
        `Saved progress: ${i + 1}/${toFetch.length} tweets processed (Total: ${
          alreadyFetched + i + 1
        }/${enrichedLikes.length})`,
      );

      // Update page files every 100 tweets
      if (i + 1 - lastPageUpdateCount >= 100 || i === toFetch.length - 1) {
        console.log('Updating page files...');
        await createPageFiles(enrichedLikes, archiveDir);
        lastPageUpdateCount = i + 1;
      }
    }

    // Rate limiting: wait between requests
    if (i < toFetch.length - 1) {
      await delay(1000); // 1 second delay between requests
    }
  }

  // Save final results
  await fs.writeFile(outputPath, JSON.stringify(enrichedLikes, null, 2));

  console.log('\n=== Summary ===');
  console.log(`Total tweets: ${enrichedLikes.length}`);
  console.log(`Successfully fetched: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Previously fetched: ${enrichedLikes.length - toFetch.length}`);
  console.log(`\nSaved enriched data to ${outputPath}`);

  // Create final page files
  console.log('\nCreating final page files...');
  const totalPages = await createPageFiles(enrichedLikes, archiveDir);
  console.log(`\nCreated ${totalPages} page files for pagination`);
}

// Run the fetcher
fetchArchiveTweets().catch(console.error);
