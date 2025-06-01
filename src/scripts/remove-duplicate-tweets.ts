import { promises as fs } from 'fs';
import { join } from 'path';

interface Tweet {
  tweet_id: string;
  text: string;
  username: string;
  tweet_url: string;
  first_link: string;
  created_at: string;
  liked_at: string;
  source: string;
  private?: boolean;
  notfound?: boolean;
  react_tweet_data?: Record<string, unknown>;
}

interface DailyLikes {
  body: Tweet[];
}

interface TweetOccurrence {
  tweet: Tweet;
  filePath: string;
  likedAt: Date;
}

async function removeDuplicateTweets() {
  console.log('Starting duplicate tweet removal process...\n');
  
  const contentDir = join(process.cwd(), 'src', 'content', 'likes');
  
  // tweet_idごとに全ての出現箇所を記録
  const tweetOccurrences = new Map<string, TweetOccurrence[]>();
  
  // 全ファイルのデータを保持
  const fileData = new Map<string, DailyLikes>();
  
  // 統計情報
  let totalFiles = 0;
  let totalTweets = 0;
  
  console.log('Phase 1: Scanning all files and collecting tweet data...\n');
  
  // 年ディレクトリを取得
  const years = await fs.readdir(contentDir);
  
  for (const year of years) {
    const yearPath = join(contentDir, year);
    const yearStat = await fs.stat(yearPath);
    
    if (!yearStat.isDirectory()) continue;
    
    // 月ディレクトリを取得
    const months = await fs.readdir(yearPath);
    
    for (const month of months) {
      const monthPath = join(yearPath, month);
      const monthStat = await fs.stat(monthPath);
      
      if (!monthStat.isDirectory()) continue;
      
      // 日付ファイルを取得
      const days = await fs.readdir(monthPath);
      
      for (const day of days) {
        if (!day.endsWith('.json')) continue;
        
        const filePath = join(monthPath, day);
        const relativePath = `${year}/${month}/${day}`;
        
        try {
          const content = await fs.readFile(filePath, 'utf8');
          const data: DailyLikes = JSON.parse(content);
          
          totalFiles++;
          
          if (!data.body || !Array.isArray(data.body)) {
            console.warn(`Skipping ${relativePath}: Invalid data structure`);
            continue;
          }
          
          // ファイルデータを保存
          fileData.set(filePath, data);
          
          // ツイートの出現箇所を記録
          for (const tweet of data.body) {
            totalTweets++;
            
            if (!tweet.tweet_id) {
              console.warn(`Tweet without ID in ${relativePath}`);
              continue;
            }
            
            const occurrence: TweetOccurrence = {
              tweet,
              filePath,
              likedAt: new Date(tweet.liked_at)
            };
            
            if (!tweetOccurrences.has(tweet.tweet_id)) {
              tweetOccurrences.set(tweet.tweet_id, []);
            }
            
            tweetOccurrences.get(tweet.tweet_id)!.push(occurrence);
          }
          
        } catch (error) {
          console.error(`Error processing ${relativePath}:`, error);
        }
      }
    }
  }
  
  console.log(`\nPhase 2: Identifying duplicates...\n`);
  
  // 重複を持つツイートを特定
  const duplicatedTweets = new Map<string, TweetOccurrence[]>();
  let duplicatesFound = 0;
  
  for (const [tweetId, occurrences] of tweetOccurrences.entries()) {
    if (occurrences.length > 1) {
      duplicatedTweets.set(tweetId, occurrences);
      duplicatesFound += occurrences.length - 1; // 1つを残すので-1
      
      // 重複情報を表示
      console.log(`Duplicate found: ${tweetId}`);
      console.log(`  Tweet: @${occurrences[0].tweet.username}: ${occurrences[0].tweet.text.substring(0, 50)}...`);
      console.log(`  Found in ${occurrences.length} files:`);
      
      // liked_atでソート（古い順）
      occurrences.sort((a, b) => a.likedAt.getTime() - b.likedAt.getTime());
      
      occurrences.forEach((occ, index) => {
        const relPath = occ.filePath.replace(contentDir + '/', '');
        console.log(`    ${index + 1}. ${relPath} (${occ.likedAt.toISOString()})${index === 0 ? ' <- KEEP (oldest)' : ' <- REMOVE'}`);
      });
      console.log('');
    }
  }
  
  if (duplicatesFound === 0) {
    console.log('No duplicates found!');
    return;
  }
  
  console.log(`\nPhase 3: Removing duplicates and updating files...\n`);
  
  // 各ファイルで保持すべきツイートIDを決定
  const tweetsToKeepByFile = new Map<string, Set<string>>();
  
  // 最も古い出現箇所のみを保持
  for (const [tweetId, occurrences] of duplicatedTweets.entries()) {
    // 最も古い出現箇所（インデックス0）のファイルにのみ保持
    const oldestOccurrence = occurrences[0];
    
    if (!tweetsToKeepByFile.has(oldestOccurrence.filePath)) {
      tweetsToKeepByFile.set(oldestOccurrence.filePath, new Set());
    }
    tweetsToKeepByFile.get(oldestOccurrence.filePath)!.add(tweetId);
  }
  
  // 更新が必要なファイルを特定して更新
  let filesUpdated = 0;
  
  for (const [filePath, data] of fileData.entries()) {
    const originalCount = data.body.length;
    
    // このファイルのツイートをフィルタリング
    const updatedTweets = data.body.filter(tweet => {
      // tweet_idがない場合は保持
      if (!tweet.tweet_id) return true;
      
      // 重複していないツイートは保持
      if (!duplicatedTweets.has(tweet.tweet_id)) return true;
      
      // 重複しているツイートは、このファイルに保持すべきかチェック
      const keepSet = tweetsToKeepByFile.get(filePath);
      return keepSet && keepSet.has(tweet.tweet_id);
    });
    
    // 変更がある場合のみファイルを更新
    if (updatedTweets.length !== originalCount) {
      await fs.writeFile(
        filePath,
        JSON.stringify({ body: updatedTweets }, null, 2)
      );
      const relPath = filePath.replace(contentDir + '/', '');
      console.log(`Updated ${relPath}: ${originalCount} → ${updatedTweets.length} tweets`);
      filesUpdated++;
    }
  }
  
  // サマリーを表示
  console.log('\n=== Summary ===');
  console.log(`Total files processed: ${totalFiles}`);
  console.log(`Total tweets processed: ${totalTweets}`);
  console.log(`Unique tweets with duplicates: ${duplicatedTweets.size}`);
  console.log(`Total duplicates removed: ${duplicatesFound}`);
  console.log(`Files updated: ${filesUpdated}`);
  
  // tweet-index.jsonの再構築を推奨
  if (duplicatesFound > 0) {
    console.log('\n⚠️  Duplicates were removed. Please run "pnpm json:build-index" to rebuild the tweet index.');
  }
}

// スクリプトを実行
removeDuplicateTweets().catch(console.error);