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
  [key: string]: unknown;
}

interface LastSyncInfo {
  timestamp: string;
  recordCount: number;
}

const LAST_SYNC_FILE = path.join(process.cwd(), 'src/content/.metadata/algolia-last-sync.json');

async function getLastSyncInfo(): Promise<LastSyncInfo | null> {
  try {
    if (fs.existsSync(LAST_SYNC_FILE)) {
      return JSON.parse(fs.readFileSync(LAST_SYNC_FILE, 'utf-8'));
    }
  } catch (error) {
    console.error('Error reading last sync info:', error);
  }
  return null;
}

async function saveLastSyncInfo(info: LastSyncInfo) {
  fs.writeFileSync(LAST_SYNC_FILE, JSON.stringify(info, null, 2));
}

async function buildAlgoliaIndexIncremental() {
  console.log('Building Algolia search index (incremental)...');

  // Validate environment variables
  const appId = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID;
  const adminKey = process.env.ALGOLIA_ADMIN_API_KEY;

  if (!appId || !adminKey) {
    throw new Error('Missing Algolia credentials. Please set NEXT_PUBLIC_ALGOLIA_APP_ID and ALGOLIA_ADMIN_API_KEY in .env');
  }

  // Initialize Algolia client
  const client = algoliasearch(appId, adminKey);

  // Get last sync info
  const lastSync = await getLastSyncInfo();
  const lastSyncDate = lastSync ? new Date(lastSync.timestamp) : null;

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

  // Filter files modified since last sync
  const modifiedFiles = lastSyncDate
    ? files.filter(file => {
        const stats = fs.statSync(file);
        return stats.mtime > lastSyncDate;
      })
    : files;

  if (modifiedFiles.length === 0) {
    console.log('No files modified since last sync. Skipping index update.');
    return;
  }

  console.log(`Processing ${modifiedFiles.length} modified files...`);

  for (const file of modifiedFiles) {
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

  if (uniqueRecords.length === 0) {
    console.log('No new records to add to index.');
    return;
  }

  console.log(`Updating ${uniqueRecords.length} records in Algolia...`);

  // Update records (partial update)
  const batchSize = 1000;
  for (let i = 0; i < uniqueRecords.length; i += batchSize) {
    const batch = uniqueRecords.slice(i, i + batchSize);
    await client.partialUpdateObjects({
      indexName: 'tweets',
      objects: batch,
      createIfNotExists: true,
    });
    console.log(`Updated ${Math.min(i + batchSize, uniqueRecords.length)}/${uniqueRecords.length} records`);
  }

  // Save sync info
  await saveLastSyncInfo({
    timestamp: new Date().toISOString(),
    recordCount: uniqueRecords.length,
  });

  console.log(`Algolia index updated successfully with ${uniqueRecords.length} records`);
}

buildAlgoliaIndexIncremental().catch(console.error);