import fs from "fs";
import path from "path";

const LIKES_DIR = "src/assets/data/x/likes";

interface TweetLike {
  text: string;
  username: string;
  tweet_url: string;
  first_link: string;
  created_at: string;
  embed_code: string;
  liked_at: string;
  source: string;
}

function extractTweetId(tweetUrl: string): string | null {
  const match = tweetUrl.match(/\/status\/(\d+)/);
  return match ? match[1] : null;
}

function processDirectory() {
  if (!fs.existsSync(LIKES_DIR)) {
    console.log(`Directory ${LIKES_DIR} does not exist`);
    return;
  }

  const monthDirs = fs.readdirSync(LIKES_DIR).filter(dir => {
    const fullPath = path.join(LIKES_DIR, dir);
    return fs.statSync(fullPath).isDirectory();
  });

  const seenTweetIds = new Set<string>();
  let totalFiles = 0;
  let duplicatesRemoved = 0;

  for (const monthDir of monthDirs) {
    const monthPath = path.join(LIKES_DIR, monthDir);
    const files = fs.readdirSync(monthPath).filter(file => file.endsWith('.json'));
    
    console.log(`Processing ${monthDir}: ${files.length} files`);
    
    for (const file of files) {
      const filePath = path.join(monthPath, file);
      totalFiles++;
      
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const tweet: TweetLike = JSON.parse(content);
        
        const tweetId = extractTweetId(tweet.tweet_url);
        if (!tweetId) {
          console.warn(`Could not extract tweet ID from ${tweet.tweet_url} in file ${filePath}`);
          continue;
        }
        
        if (seenTweetIds.has(tweetId)) {
          console.log(`Removing duplicate tweet ID ${tweetId} from ${filePath}`);
          fs.unlinkSync(filePath);
          duplicatesRemoved++;
        } else {
          seenTweetIds.add(tweetId);
        }
      } catch (error) {
        console.error(`Error processing file ${filePath}:`, error);
      }
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Total files processed: ${totalFiles}`);
  console.log(`Duplicate files removed: ${duplicatesRemoved}`);
  console.log(`Unique tweets remaining: ${seenTweetIds.size}`);
}

console.log('Removing duplicate tweets from raw like data...');
processDirectory();
console.log('Duplicate removal completed.');