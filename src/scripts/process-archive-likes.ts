import * as fs from 'fs/promises';
import * as path from 'path';

interface ArchiveLike {
  like: {
    tweetId: string;
    fullText?: string;
    expandedUrl: string;
  };
}

interface ProcessedArchiveLike {
  id: string;
  tweetId: string;
  fullText?: string;
  expandedUrl: string;
  isArchive: true;
  processedAt: string;
}

async function loadArchiveFile(filePath: string): Promise<ArchiveLike[]> {
  const content = await fs.readFile(filePath, 'utf-8');
  
  // Remove window.YTD.like.part0 = prefix and trailing semicolon
  const jsonContent = content
    .replace(/^window\.YTD\.like\.part\d+\s*=\s*/, '')
    .replace(/;?\s*$/, '');
  
  return JSON.parse(jsonContent);
}

async function processArchiveLikes() {
  const projectRoot = path.join(__dirname, '../../');
  const archiveDir = projectRoot;
  const outputDir = path.join(projectRoot, 'src/content/archive');
  
  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });
  
  // Load existing tweet index to check for duplicates
  const tweetIndexPath = path.join(projectRoot, 'src/content/tweet-index.json');
  let existingTweetIds = new Set<string>();
  
  try {
    const indexContent = await fs.readFile(tweetIndexPath, 'utf-8');
    const tweetIndex = JSON.parse(indexContent);
    existingTweetIds = new Set(Object.keys(tweetIndex));
    console.log(`Loaded ${existingTweetIds.size} existing tweet IDs from index`);
  } catch {
    console.log('No existing tweet index found, will check all tweets');
  }
  
  // Find all archive files
  const files = await fs.readdir(archiveDir);
  const archiveFiles = files.filter(f => f.startsWith('like-twitter-') && f.endsWith('.js'));
  
  console.log(`Found ${archiveFiles.length} archive files`);
  
  const allLikes: ProcessedArchiveLike[] = [];
  const seenTweetIds = new Set<string>();
  let existingDuplicateCount = 0;
  
  // Process each archive file
  for (const file of archiveFiles) {
    console.log(`Processing ${file}...`);
    const filePath = path.join(archiveDir, file);
    const likes = await loadArchiveFile(filePath);
    
    for (const like of likes) {
      // Skip if already exists in current project
      if (existingTweetIds.has(like.like.tweetId)) {
        existingDuplicateCount++;
        console.log(`Skipping tweet ID ${like.like.tweetId} - already exists in project`);
        continue;
      }
      
      // Skip duplicates within archive
      if (seenTweetIds.has(like.like.tweetId)) {
        console.log(`Skipping duplicate tweet ID within archive: ${like.like.tweetId}`);
        continue;
      }
      
      seenTweetIds.add(like.like.tweetId);
      
      const processedLike: ProcessedArchiveLike = {
        id: `archive-${like.like.tweetId}`,
        tweetId: like.like.tweetId,
        fullText: like.like.fullText,
        expandedUrl: like.like.expandedUrl,
        isArchive: true,
        processedAt: new Date().toISOString()
      };
      
      allLikes.push(processedLike);
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Total unique likes in archive: ${allLikes.length}`);
  console.log(`Skipped (already in project): ${existingDuplicateCount}`);
  console.log(`Total processed: ${allLikes.length + existingDuplicateCount}`);
  
  // Sort by tweet ID (roughly chronological)
  allLikes.sort((a, b) => b.tweetId.localeCompare(a.tweetId));
  
  // Save processed data
  const outputPath = path.join(outputDir, 'archive-likes.json');
  await fs.writeFile(outputPath, JSON.stringify(allLikes, null, 2));
  
  console.log(`Saved processed archive to ${outputPath}`);
  
  // Create index for tweet IDs
  const tweetIds = allLikes.map(like => like.tweetId);
  const indexPath = path.join(outputDir, 'archive-tweet-ids.json');
  await fs.writeFile(indexPath, JSON.stringify(tweetIds, null, 2));
  
  console.log(`Saved tweet ID index to ${indexPath}`);
}

// Run the processor
processArchiveLikes().catch(console.error);