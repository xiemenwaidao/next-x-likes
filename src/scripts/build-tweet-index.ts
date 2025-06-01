import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DayJson } from '@/types/like';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TweetIndexEntry {
  id: string;
  filePath: string;
  year: string;
  month: string;
  day: string;
  likedAt: string;
}

interface TweetIndex {
  [tweetId: string]: TweetIndexEntry;
}

const CONTENT_DIR = path.join(__dirname, '../content/likes');
const OUTPUT_FILE = path.join(__dirname, '../content/tweet-index.json');

async function buildTweetIndex() {
  const index: TweetIndex = {};
  
  // Get all year directories
  const years = fs.readdirSync(CONTENT_DIR)
    .filter(dir => dir.match(/^\d{4}$/))
    .sort();
  
  console.log(`Found ${years.length} year directories`);
  
  for (const year of years) {
    const yearPath = path.join(CONTENT_DIR, year);
    const months = fs.readdirSync(yearPath)
      .filter(dir => dir.match(/^\d{2}$/))
      .sort();
    
    for (const month of months) {
      const monthPath = path.join(yearPath, month);
      const dayFiles = fs.readdirSync(monthPath)
        .filter(file => file.endsWith('.json'));
      
      console.log(`Processing ${dayFiles.length} day files in ${year}/${month}`);
      
      for (const dayFile of dayFiles) {
        const day = dayFile.replace('.json', '');
        const filePath = path.join(monthPath, dayFile);
        const content: DayJson = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        
        // Process each tweet in the day file
        if (content.body && Array.isArray(content.body)) {
          for (const tweet of content.body) {
            if (tweet.tweet_id) {
              index[tweet.tweet_id] = {
                id: tweet.tweet_id,
                filePath: path.relative(path.dirname(OUTPUT_FILE), filePath),
                year,
                month,
                day,
                likedAt: tweet.liked_at
              };
            }
          }
        }
      }
    }
  }
  
  // Create content directory if it doesn't exist
  const contentDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(contentDir)) {
    fs.mkdirSync(contentDir, { recursive: true });
  }
  
  // Write index to file
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(index, null, 2));
  console.log(`Tweet index built with ${Object.keys(index).length} entries`);
  console.log(`Index saved to: ${OUTPUT_FILE}`);
}

buildTweetIndex().catch(console.error);