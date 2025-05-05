import fs from 'fs';
import { subDays } from 'date-fns';
import { format, toZonedTime } from 'date-fns-tz';
import { DayJson } from '@/types/like';
import axios, { AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
// import puppeteer from 'puppeteer';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import {
  PollyClient,
  StartSpeechSynthesisTaskCommand,
} from '@aws-sdk/client-polly';
import dotenv from 'dotenv';

// .envファイルを読み込む
dotenv.config();

// 型定義
interface ExtractOptions {
  timeout?: number;
  includeMetadata?: boolean;
}

interface ArticleMetadata {
  originalTitle?: string;
  description?: string;
  publishDate?: string;
  author?: string;
  siteName?: string;
}

interface ExtractedArticle {
  uuid: string;
  title: string;
  content: string;
  html: string;
  markdown: string;
  excerpt: string;
  byline: string;
  length: number;
  url: string;
  metadata?: ArticleMetadata;
  narrations?: string;
  voiceId?: string;
  voiceUrl?: string;
}

interface BedrockResponseBody {
  content: { text: string }[];
  usage: { input_tokens: number; output_tokens: number };
}

/** 取得するいいねの日数（本日を含む） */
const DAYS = 2;

const AWS_CONFIG = {
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
};

// https://dev.classmethod.jp/articles/amazon-bedrock-cross-region-inference-apac/
// const MODEL_ID = 'apac.anthropic.claude-3-5-sonnet-20241022-v2:0';
const MODEL_ID = 'anthropic.claude-3-5-sonnet-20240620-v1:0';
const SYSTEM_PROMPT = `你是一位优秀的广播编剧。请根据提供的信息，创作一个广播主持人朗读的脚本。

# 主持人设定
- 名字：小林
- 身份：中国职业女性
- 性格：亲切活泼
- 说话风格：类似中国FM电台
- 语气：温柔、礼貌且友好

# 脚本内容要求
- 文章介绍
- 内容解析
- 对于普通软件工程师来说较难理解的概念或术语的补充解释
- 主持人自己视角的感想

# 脚本格式要求
- 直接输出脚本内容，不要添加任何前言说明
- 不要包含"以下是我会朗读的台词"等解释性文字
- 不要使用引号或书名号标记文章标题

# 绝对必须遵守的事项
- 不要包含"大家好"、"您好"或"下次再见"、"谢谢各位"等开场白或结束语
- 不要包含"我是小林"等自我介绍
- 不要包含源代码，因为无法朗读
- 必须严格使用"关于<文章标题>为大家介绍。这篇文章～"作为第一句话
- 不要在脚本开头添加任何额外解释，直接以"关于<文章标题>为大家介绍。这篇文章～"开始
- 不要在脚本结尾添加任何告别或感谢语
- 输出必须使用中国语（简体中文）
- 如果文章标题是其他语言，请务必将其翻译成中文再使用

如果不遵守以上规则，脚本将不被采用，你将被解雇。请确保直接输出可朗读的脚本，不含任何格式说明或元数据。
`;

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

/**
 * Create a new podcast
 *
 * - N日分のいいねJSONを取得、「src/content/likes/yyyy/MM/dd.json」
 * - react_tweet_data.entities.urls[].expanded_urlをリストアップ
 * - そのURLがブログ記事っぽいかどうかを判定
 * - URLをクロールして、ブログ記事の内容を取得
 * - 取得したブログ記事の内容をAIで要約 → 要約しない
 * - 要約した内容をAIで音声化
 * - その音声をポッドキャストとして公開
 */
async function createPodcastFromJson() {
  console.log('Creating a new podcast...');
  let data = [];

  // いいねJSONを取得
  const likeJsonPathList = getLikeJsonPathList();
  console.log('likeJsonPathList:', likeJsonPathList);

  // いいねJSONからURLリストを抽出
  const urls = getUrls(likeJsonPathList);
  console.log('urls:', urls, urls.length);

  // URLからブログ記事を取得
  data = await getArticles(urls);
  console.log('articles:', data.length);

  // ブログ記事からナレーションテキストを生成
  data = await getNarrations(data);
  console.log('narrations:', data.length);

  // 要約を音声化
  data = await getVoices(data);
  console.log('voices:', data.length);

  // // 音声をポッドキャストとして公開
  // publishPodcast(voices);
}

function getLikeJsonPathList(to = new Date()) {
  // いいねJSONを取得
  // 今日からN日前までのいいねJSONを取得
  const japanTime = toZonedTime(to, 'Asia/Tokyo');

  // date-fnsを使って、N日前の日付を取得
  const dateList = Array.from({ length: DAYS }, (_, i) => {
    return format(subDays(japanTime, i), 'yyyyMMdd');
  });

  const jsonPathList = [];
  for (const date of dateList) {
    const jsonPath = `src/content/likes/${date.slice(0, 4)}/${date.slice(
      4,
      6,
    )}/${date.slice(6, 8)}.json`;

    // 存在チェック
    if (fs.existsSync(jsonPath)) {
      jsonPathList.push(jsonPath);
    }
  }

  // 並び順を逆にする（古い順）
  jsonPathList.reverse();

  return jsonPathList;
}

function getUrls(jsonPathList: string[]) {
  const urls = [];
  for (const jsonPath of jsonPathList) {
    const json: DayJson = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const likes = json.body;

    for (const like of likes) {
      if (like?.react_tweet_data) {
        if (like.react_tweet_data.entities.urls) {
          for (const url of like.react_tweet_data.entities.urls) {
            // ブログ記事URLのみを抽出
            if (isBlogArticleUrl(url.expanded_url)) {
              urls.push(url.expanded_url);
            } else {
              console.log('Skip:', url.expanded_url);
            }
          }
        }
      }
    }
  }

  return [...new Set(urls)];
}

async function getArticles(urls: string[]) {
  const articles = [];

  for (const url of urls) {
    try {
      const article = await extractArticleFromUrl(url, {
        timeout: 10000,
        includeMetadata: true,
      });

      articles.push(article);
    } catch (error) {
      console.error('Error:', url);
      console.error(error);
    }
  }

  return articles;
}

async function getNarrations(articles: ExtractedArticle[]) {
  const client = new BedrockRuntimeClient(AWS_CONFIG);

  for (const [index, article] of articles.entries()) {
    try {
      const payload = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `请将以下文章"${article.title}"转换为广播脚本格式：\n\n${article.markdown}`,
              },
            ],
          },
        ],
      };

      const apiResponse = await client.send(
        new InvokeModelCommand({
          contentType: 'application/json',
          body: JSON.stringify(payload),
          modelId: MODEL_ID,
        }),
      );

      const decodedResponseBody = new TextDecoder().decode(apiResponse.body);
      const responseBody: BedrockResponseBody = JSON.parse(decodedResponseBody);
      const responses = responseBody.content;

      articles[index].narrations = responses[0].text;
    } catch (error) {
      console.error('Error:', article.title);
      console.error(error);

      // エラーが発生した場合は、その記事をスキップ
      articles.splice(index, 1);
    }
  }

  return articles;
}

async function getVoices(articles: ExtractedArticle[]) {
  const pollyClient = new PollyClient(AWS_CONFIG);

  for (const [index, article] of articles.entries()) {
    try {
      const command = new StartSpeechSynthesisTaskCommand({
        Engine: 'neural',
        LanguageCode: 'cmn-CN',
        OutputFormat: 'mp3',
        OutputS3BucketName: process.env.AWS_BUCKET_NAME, // あなたのS3バケット名
        OutputS3KeyPrefix: `podcast/`,
        Text: article.narrations,
        TextType: 'text',
        VoiceId: 'Zhiyu', // 中国語の女性音声の例
      });
      const response = await pollyClient.send(command);

      if (response.SynthesisTask) {
        const taskId = response.SynthesisTask.TaskId;
        const outputUri = response.SynthesisTask.OutputUri;

        articles[index].voiceId = taskId;
        articles[index].voiceUrl = outputUri;

        // console.log(`Started synthesis task: ${taskId}`);
        // console.log(`Output will be available at: ${outputUri}`);

        // // タスク情報を保存
        // const taskInfo = {
        //   taskId,
        //   outputUri,
        //   episodeTitle,
        //   createdAt: new Date().toISOString(),
        // };

        // console.log('taskInfo:', taskInfo);

        // ここでRSSフィードを更新する関数を呼び出すこともできます
        // await updateRssFeed(outputUri, episodeTitle);
      }
    } catch (error) {
      console.error('Error starting speech synthesis task:', error);

      // エラーが発生した場合は、その記事をスキップ
      articles.splice(index, 1);
    }
  }

  return articles;
}

// _/_/_/_/_/_/_/_/_/_/_/_/_/_/_/_/_/_/_/_/
// private functions
// _/_/_/_/_/_/_/_/_/_/_/_/_/_/_/_/_/_/_/_/
/**
 * URLがブログ記事のURLらしいかどうかを判定する関数
 * @param url 判定対象のURL
 * @returns ブログ記事URLらしい場合はtrue、それ以外（画像など）はfalse
 */
function isBlogArticleUrl(url: string): boolean {
  try {
    // URLが有効かどうかをチェック
    const parsedUrl = new URL(url);
    const path = parsedUrl.pathname;
    const extension = path.split('.').pop()?.toLowerCase();

    // 画像、動画、ドキュメントなどの一般的なファイル拡張子をチェック
    const nonBlogExtensions = [
      // 画像
      'jpg',
      'jpeg',
      'png',
      'gif',
      'bmp',
      'svg',
      'webp',
      // 動画
      'mp4',
      'webm',
      'avi',
      'mov',
      'wmv',
      'flv',
      // 音声
      'mp3',
      'wav',
      'ogg',
      'flac',
      // ドキュメント
      'pdf',
      'doc',
      'docx',
      'xls',
      'xlsx',
      'ppt',
      'pptx',
      // 圧縮ファイル
      'zip',
      'rar',
      'tar',
      'gz',
      '7z',
      // 実行ファイル
      'exe',
      'dmg',
      'apk',
      'ipa',
      // コード関連
      'css',
      'js',
      'json',
      'xml',
    ];

    // 拡張子がある場合、ブログ記事ではない可能性が高いファイルかチェック
    if (extension && nonBlogExtensions.includes(extension)) {
      return false;
    }

    // 拡張子チェック以外はすべてブログ記事URLの可能性があるとみなす
    return true;
  } catch {
    // URLのパースに失敗した場合はfalse
    return false;
  }
}

/**
 * URLから記事コンテンツを抽出する関数
 * @param url - 記事を取得するURL
 * @param options - オプション設定
 * @returns 抽出された記事情報
 */
export async function extractArticleFromUrl(
  url: string,
  options: ExtractOptions = {},
): Promise<ExtractedArticle> {
  const defaultOptions: ExtractOptions = {
    timeout: 10000,
    includeMetadata: false,
  };

  const config = { ...defaultOptions, ...options };

  try {
    // URLの形式を検証
    try {
      new URL(url);
    } catch {
      throw new Error('無効なURLです。正しいURLを指定してください。');
    }

    // ウェブページを取得
    const response: AxiosResponse = await axios.get(url, {
      timeout: config.timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ArticleExtractor/1.0)',
        Accept: 'text/html,application/xhtml+xml,application/xml',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      },
    });

    // Content-Typeをチェック
    const contentType = response.headers['content-type'] || '';
    if (!contentType.includes('text/html')) {
      throw new Error('HTMLではないコンテンツタイプです: ' + contentType);
    }

    const html = response.data;

    /** @see https://gist.github.com/kimihito/0c0c68c17bcf6b4545166fc6ce778f03 */
    // const browser = await puppeteer.launch({
    //   args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=ja,en-US,en'],
    // });
    // const page = await browser.newPage();
    // await page.goto(url);
    // const html = await page.evaluate(() => {
    //   return document.body.innerHTML;
    // });

    // Readabilityライブラリを使用して記事本文を抽出
    // @see https://github.com/thymikee/jest-preset-angular/issues/2194 エラーになるのでstyle記述を削除する
    const cleanedHtml = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    const dom = new JSDOM(cleanedHtml, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) {
      throw new Error('記事の抽出に失敗しました');
    }

    // メタデータの取得（オプション）
    const metadata: ArticleMetadata = {};
    if (config.includeMetadata) {
      const $ = cheerio.load(html);

      // タイトル（Readabilityとは別に元のメタタグからも取得）
      metadata.originalTitle = $('title').text().trim();

      // メタ説明
      metadata.description =
        $('meta[name="description"]').attr('content') ||
        $('meta[property="og:description"]').attr('content') ||
        '';

      // 発行日
      metadata.publishDate =
        $('meta[property="article:published_time"]').attr('content') ||
        $('time[datetime]').attr('datetime') ||
        '';

      // 著者
      metadata.author =
        $('meta[name="author"]').attr('content') ||
        $('meta[property="article:author"]').attr('content') ||
        $('a[rel="author"]').first().text().trim() ||
        '';

      // サイト名
      metadata.siteName =
        $('meta[property="og:site_name"]').attr('content') || '';
    }

    let markdown = '';
    markdown += `# ${metadata.originalTitle}\n\n`;
    markdown += `> ${metadata.description}\n\n`;
    if (article.content) {
      // Readabilityから取得したコンテンツをMarkdownに変換
      markdown += turndownService.turndown(article.content);
    }

    // 結果を返す
    const result: ExtractedArticle = {
      // create uuid
      uuid: crypto.randomUUID(),
      title: article.title ?? '',
      // content: article.textContent ?? '',
      content: '',
      // html: article.content ?? '',
      html: '',
      markdown: markdown,
      excerpt: article.excerpt ?? '',
      byline: article.byline ?? '',
      length: (article.textContent || '').length,
      url: url,
    };

    if (config.includeMetadata) {
      result.metadata = metadata;
    }

    return result;
  } catch (error) {
    // エラーメッセージを整形して返す
    if (axios.isAxiosError(error) && error.response) {
      // サーバーからのレスポンスがあるがエラー
      throw new Error(
        `HTTPエラー: ${error.response.status} - ${error.response.statusText}`,
      );
    } else if (axios.isAxiosError(error) && error.request) {
      // リクエストは送られたがレスポンスなし
      throw new Error(
        `接続エラー: サーバーから応答がありません (${error.message})`,
      );
    } else {
      // その他のエラー
      const errorMessage =
        error instanceof Error ? error.message : '不明なエラー';
      throw new Error(errorMessage);
    }
  }
}

createPodcastFromJson();
