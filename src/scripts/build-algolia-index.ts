import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import glob from 'glob';
import { algoliasearch } from 'algoliasearch';
import { Like } from '@/types/like';

// Load environment variables
config();

interface AlgoliaRecord {
  objectID: string;
  text: string;
  username: string;
  date: string;
  year: string;
  month: string;
  day: string;
  path: string;
  [key: string]: unknown; // Index signature for Algolia compatibility
}

async function buildAlgoliaIndex() {
  console.log('Building Algolia search index...');

  // Validate environment variables
  const appId = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID;
  const adminKey = process.env.ALGOLIA_ADMIN_API_KEY;

  if (!appId || !adminKey) {
    throw new Error('Missing Algolia credentials. Please set NEXT_PUBLIC_ALGOLIA_APP_ID and ALGOLIA_ADMIN_API_KEY in .env.local');
  }

  // Initialize Algolia client
  const client = algoliasearch(appId, adminKey);
  
  // Configure index settings for Japanese language support
  await client.setSettings({
    indexName: 'tweets',
    indexSettings: {
      searchableAttributes: [
        'text',
        'username',
      ],
      attributesToRetrieve: [
        'text',
        'username',
        'date',
        'path',
      ],
      attributesToHighlight: [
        'text',
        'username',
      ],
      // Japanese language support
      queryLanguages: ['ja'],
      indexLanguages: ['ja'],
      // Enable typo tolerance
      typoTolerance: true,
      // Ranking and relevance
      ranking: [
        'typo',
        'geo',
        'words',
        'filters',
        'proximity',
        'attribute',
        'exact',
        'custom',
      ],
      customRanking: [
        'desc(date)',
      ],
      // Performance optimization
      hitsPerPage: 20,
      maxValuesPerFacet: 100,
      // Japanese specific settings
      removeStopWords: false,
      ignorePlurals: false,
    }
  });

  // Read tweet data
  const contentDir = path.join(process.cwd(), 'src/content/likes');
  const pattern = path.join(contentDir, '**/[0-9][0-9].json');
  const files = glob.sync(pattern);

  const records: AlgoliaRecord[] = [];
  const tweetIndex = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), 'src/content/tweet-index.json'),
      'utf-8',
    ),
  );

  for (const file of files) {
    const content = JSON.parse(fs.readFileSync(file, 'utf-8'));

    if (content.body && Array.isArray(content.body)) {
      for (const like of content.body as Like[]) {
        if (like.tweet_id && !like.private && !like.notfound) {
          const tweetInfo = tweetIndex[like.tweet_id];
          if (tweetInfo) {
            records.push({
              objectID: like.tweet_id,
              text: like.text || '',
              username: like.username || '',
              date: `${tweetInfo.year}/${tweetInfo.month}/${tweetInfo.day}`,
              year: tweetInfo.year,
              month: tweetInfo.month,
              day: tweetInfo.day,
              path: `/tweet/${like.tweet_id}`,
            });
          }
        }
      }
    }
  }

  // Remove duplicates
  const uniqueRecords = Array.from(
    new Map(records.map((item) => [item.objectID, item])).values(),
  );

  // Clear existing index and upload new records
  console.log(`Clearing existing index...`);
  await client.clearObjects({ indexName: 'tweets' });

  console.log(`Uploading ${uniqueRecords.length} records to Algolia...`);
  
  // Upload in batches of 1000 records
  const batchSize = 1000;
  for (let i = 0; i < uniqueRecords.length; i += batchSize) {
    const batch = uniqueRecords.slice(i, i + batchSize);
    await client.saveObjects({ 
      indexName: 'tweets',
      objects: batch 
    });
    console.log(`Uploaded ${Math.min(i + batchSize, uniqueRecords.length)}/${uniqueRecords.length} records`);
  }

  console.log(`Algolia index built successfully with ${uniqueRecords.length} tweets`);
}

buildAlgoliaIndex().catch(console.error);