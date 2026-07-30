import type { PostData, CommentData, ScrapeResult, PlatformSelectors } from '../../shared/types';
import type { ContentScriptMessage } from '../../shared/messages';
import { PostBuffer } from '../shared/post-buffer';
import { FeedObserver } from '../shared/mutation-observer';
import { setSelectors, getSelector, hasSelectors } from '../shared/selector-reader';
import {
  parseEngagementCount, parseRelativeTime,
  createErrorResult, createSuccessResult, findPostOnPage
} from '../shared/scraper-base';
import bundledSelectors from '../../config/selectors.json';

const buffer = new PostBuffer(50);
let feedObserver: FeedObserver | null = null;

/**
 * Simple hash function for generating unique post IDs.
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Check if the current page is a YouTube Studio analytics page.
 */
function isAnalyticsPage(): boolean {
  return window.location.href.includes('/analytics');
}

/**
 * Check if the current page is a video watch page.
 */
function isWatchPage(): boolean {
  return window.location.pathname === '/watch';
}

/**
 * Extract video title from the watch page.
 */
export function extractVideoTitle(container: Document | Element): string {
  const selectors = [
    'h1.ytd-watch-metadata yt-formatted-string',
    '#title h1 yt-formatted-string',
    'h1.ytd-video-primary-info-renderer yt-formatted-string',
    '#title h1',
  ];
  for (const selector of selectors) {
    try {
      const el = container.querySelector(selector);
      const text = el?.textContent?.trim();
      if (text) return text;
    } catch {
      continue;
    }
  }
  return '';
}

/**
 * Extract video description text.
 */
export function extractVideoDescription(container: Document | Element): string {
  const selectors = [
    '#description yt-formatted-string',
    'ytd-text-inline-expander > span',
    '#description-inline-expander > yt-formatted-string',
    '#description .content',
  ];
  for (const selector of selectors) {
    try {
      const el = container.querySelector(selector);
      const text = el?.textContent?.trim();
      if (text) return text;
    } catch {
      continue;
    }
  }
  return '';
}

/**
 * Extract channel name from the watch page.
 */
export function extractChannelName(container: Document | Element): string {
  const selectors = [
    '#channel-name yt-formatted-string a',
    '#channel-name yt-formatted-string',
    'ytd-channel-name yt-formatted-string a',
    '#owner-name a',
  ];
  for (const selector of selectors) {
    try {
      const el = container.querySelector(selector);
      const text = el?.textContent?.trim();
      if (text) return text;
    } catch {
      continue;
    }
  }
  return '';
}

/**
 * Extract comments from the video page.
 */
export function scrapeComments(container: Document | Element): CommentData[] {
  const commentSelector = getSelector('commentContainer') || '#contents ytd-comment-thread-renderer';
  let commentElements: Element[];
  try {
    commentElements = Array.from(container.querySelectorAll(commentSelector));
  } catch {
    return [];
  }

  const comments: CommentData[] = [];

  for (const el of commentElements) {
    try {
      const authorSelector = getSelector('commentAuthor') || '#author-text span';
      const textSelector = getSelector('commentText') || '#content-text';
      const likesSelector = getSelector('commentLikes') || '#vote-count-middle';

      const authorEl = el.querySelector(authorSelector);
      const textEl = el.querySelector(textSelector);
      const likesEl = el.querySelector(likesSelector);

      const author = authorEl?.textContent?.trim() || '';
      const content = textEl?.textContent?.trim() || '';
      const likesText = likesEl?.textContent?.trim() || '';

      if (author || content) {
        comments.push({
          author,
          content,
          engagement: { likes: parseEngagementCount(likesText) },
        });
      }
    } catch {
      continue;
    }
  }

  return comments.sort((a, b) => b.engagement.likes - a.engagement.likes);
}

/**
 * Extract visible metrics from YouTube Studio analytics page.
 */
export function scrapeAnalyticsMetrics(container: Document | Element): PostData[] {
  const metricsSelectors = [
    '.metric-value',
    'yt-formatted-string.metric-value',
    '.data-value',
    '#metric-value',
  ];

  let metricsText = '';
  for (const selector of metricsSelectors) {
    try {
      const els = container.querySelectorAll(selector);
      if (els.length > 0) {
        metricsText = Array.from(els)
          .map(el => el.textContent?.trim())
          .filter(Boolean)
          .join(' | ');
        break;
      }
    } catch {
      continue;
    }
  }

  if (!metricsText) return [];

  const post: PostData = {
    id: `yt-analytics-${hashString(metricsText.slice(0, 100))}`,
    platform: 'youtube',
    author: { name: 'YouTube Studio Analytics' },
    content: metricsText,
    timestamp: new Date().toISOString(),
    engagement: { likes: 0, comments: 0, reposts: 0 },
    url: window.location.href,
  };

  return [post];
}

/**
 * Main scrape function for YouTube pages.
 * Creates one PostData for the video itself plus individual PostData for each comment.
 */
export function scrapeYouTubePosts(container: Document | Element): PostData[] {
  // Handle analytics pages
  if (isAnalyticsPage()) {
    return scrapeAnalyticsMetrics(container);
  }

  const posts: PostData[] = [];

  // On watch pages, extract video info as a "post"
  if (isWatchPage()) {
    const title = extractVideoTitle(container);
    const description = extractVideoDescription(container);
    const channelName = extractChannelName(container);

    if (title || description) {
      const videoPost: PostData = {
        id: `yt-video-${hashString((channelName + title).slice(0, 100))}`,
        platform: 'youtube',
        author: { name: channelName || 'Unknown Channel' },
        content: description || title,
        timestamp: '',
        engagement: { likes: 0, comments: 0, reposts: 0 },
        url: window.location.href,
        topComments: [],
      };

      // Try to extract engagement counts from the video
      const likeSelector = getSelector('engagementLikes');
      if (likeSelector) {
        try {
          // Video-level likes are typically in a different location
          const likeButton = container.querySelector(
            'ytd-menu-renderer yt-formatted-string#text, ' +
            'segmented-like-dislike-button-view-model button .yt-spec-button-shape-next__button-text-content, ' +
            '#segmented-like-button button'
          );
          if (likeButton) {
            videoPost.engagement.likes = parseEngagementCount(likeButton.textContent?.trim() || '');
          }
        } catch {
          // Ignore engagement extraction failures
        }
      }

      // Extract comment count
      const commentCountSelector = getSelector('engagementComments');
      if (commentCountSelector) {
        try {
          const countEl = container.querySelector(commentCountSelector);
          if (countEl) {
            videoPost.engagement.comments = parseEngagementCount(countEl.textContent?.trim() || '');
          }
        } catch {
          // Ignore
        }
      }

      // Extract timestamp
      const timestampSelector = getSelector('timestamp');
      if (timestampSelector) {
        try {
          const timeEl = container.querySelector(timestampSelector);
          if (timeEl) {
            videoPost.timestamp = timeEl.textContent?.trim() || '';
            videoPost.ageMinutes = parseRelativeTime(videoPost.timestamp);
          }
        } catch {
          // Ignore
        }
      }

      // Extract comments
      const comments = scrapeComments(container);
      if (comments.length > 0) {
        videoPost.topComments = comments.slice(0, 5);
      }

      posts.push(videoPost);

      // Also create individual PostData entries for each comment
      for (const comment of comments) {
        const commentPost: PostData = {
          id: `yt-comment-${hashString((comment.author + comment.content).slice(0, 100))}`,
          platform: 'youtube',
          author: { name: comment.author },
          content: comment.content,
          timestamp: '',
          engagement: {
            likes: comment.engagement.likes,
            comments: 0,
            reposts: 0,
          },
          url: window.location.href,
        };
        posts.push(commentPost);
      }
    }
  }

  return posts;
}

function handleScrapeRequest(): ScrapeResult {
  try {
    const posts = scrapeYouTubePosts(document);
    buffer.add(posts);
    return createSuccessResult(buffer.getAll());
  } catch (error) {
    return createErrorResult(
      `YouTube scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// Initialize with selectors
export function init(selectors: PlatformSelectors): void {
  setSelectors(selectors);

  // Start observing for new comments loading
  const commentSelector = selectors.commentContainer || selectors.feedPost;
  feedObserver = new FeedObserver(
    buffer,
    scrapeYouTubePosts,
    commentSelector
  );
  feedObserver.start();
}

/**
 * Handle YouTube SPA navigation.
 * YouTube fires 'yt-navigate-finish' on page transitions.
 */
function handleSPANavigation(): void {
  // Re-scrape on SPA navigation
  buffer.clear();
  if (feedObserver) {
    feedObserver.stop();
  }

  // Re-initialize observer for the new page
  const ytBundledSelectors = bundledSelectors.platforms.youtube;
  if (ytBundledSelectors) {
    setSelectors(ytBundledSelectors as unknown as PlatformSelectors);
    const commentSelector = ytBundledSelectors.commentContainer || ytBundledSelectors.feedPost;
    feedObserver = new FeedObserver(
      buffer,
      scrapeYouTubePosts,
      commentSelector
    );
    feedObserver.start();
  }
}

// Listen for YouTube SPA navigation events
document.addEventListener('yt-navigate-finish', () => {
  handleSPANavigation();
});

// Message listener
chrome.runtime.onMessage.addListener((message: ContentScriptMessage, _sender, sendResponse) => {
  if (message.type === 'SCRAPE_PAGE') {
    const result = handleScrapeRequest();
    sendResponse(result);
    return true;
  }
  if (message.type === 'INIT_SELECTORS') {
    init(message.selectors as unknown as PlatformSelectors);
    sendResponse({ success: true });
    return true;
  }
  if (message.type === 'FIND_POST') {
    const found = findPostOnPage(message.postId, message.url);
    sendResponse({ found });
    return true;
  }
});

// Self-initialize with bundled selectors immediately
const ytBundledSelectors = bundledSelectors.platforms.youtube;
if (ytBundledSelectors && !hasSelectors()) {
  setSelectors(ytBundledSelectors as unknown as PlatformSelectors);
}

console.log('Social Media Manager: YouTube content script loaded');
