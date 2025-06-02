import fs from 'fs';
import path from 'path';
import glob from 'glob';
import { DayJson } from '@/types/like';

interface ExtractedUrl {
  tweet_id: string;
  username: string;
  tweet_url: string;
  liked_at: string;
  year: string;
  month: string;
  day: string;
  urls: {
    url: string;
    expanded_url: string;
    display_url: string;
  }[];
  card?: {
    url: string;
    title?: string;
    description?: string;
    image?: string;
  };
}

async function extractUrls() {
  console.log('Extracting URLs from tweets...');

  const contentDir = path.join(process.cwd(), 'src/content/likes');
  const pattern = path.join(contentDir, '**/[0-9][0-9].json');
  const files = glob.sync(pattern);

  const extractedUrls: ExtractedUrl[] = [];

  for (const file of files) {
    // Extract date from file path
    const relativePath = path.relative(contentDir, file);
    const pathParts = relativePath.split(path.sep);
    const year = pathParts[0];
    const month = pathParts[1];
    const day = pathParts[2].replace('.json', '');

    const content: DayJson = JSON.parse(fs.readFileSync(file, 'utf-8'));

    if (content.body && Array.isArray(content.body)) {
      for (const like of content.body) {
        // Skip if no tweet data or no URLs
        if (!like.react_tweet_data?.entities?.urls?.length) continue;

        const urls = like.react_tweet_data.entities.urls;
        let card = undefined;

        // Extract card data if available
        if (like.react_tweet_data.card) {
          const cardData = like.react_tweet_data.card;
          const bindingValues = cardData.binding_values;
          
          card = {
            url: cardData.url || '',
            title: bindingValues?.title?.string_value,
            description: bindingValues?.description?.string_value,
            image: bindingValues?.thumbnail_image_original?.image_value?.url ||
                   bindingValues?.photo_image_full_size_original?.image_value?.url ||
                   bindingValues?.summary_photo_image_original?.image_value?.url
          };
        }

        extractedUrls.push({
          tweet_id: like.tweet_id || '',
          username: like.username || '',
          tweet_url: like.tweet_url || '',
          liked_at: like.liked_at || '',
          year,
          month,
          day,
          urls: urls.map(u => ({
            url: u.url || '',
            expanded_url: u.expanded_url || '',
            display_url: u.display_url || ''
          })),
          card
        });
      }
    }
  }

  // Sort by date (newest first)
  extractedUrls.sort((a, b) => {
    const dateA = `${a.year}${a.month}${a.day}`;
    const dateB = `${b.year}${b.month}${b.day}`;
    return dateB.localeCompare(dateA);
  });

  // Save to JSON file
  const outputPath = path.join(process.cwd(), 'src/content/url-index.json');
  fs.writeFileSync(outputPath, JSON.stringify(extractedUrls, null, 2));

  console.log(`Extracted ${extractedUrls.length} tweets with URLs`);
  console.log(`Saved to ${outputPath}`);

  // Also create a summary for debugging
  const summary = extractedUrls.slice(0, 5).map(item => ({
    tweet_id: item.tweet_id,
    username: item.username,
    date: `${item.year}/${item.month}/${item.day}`,
    urls: item.urls.map(u => u.expanded_url),
    has_card: !!item.card
  }));

  console.log('\nSample extracted URLs:');
  console.log(JSON.stringify(summary, null, 2));
}

extractUrls().catch(console.error);