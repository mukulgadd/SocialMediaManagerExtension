import type { PostData, ScrapeResult, PlatformSelectors } from '../../shared/types';
import type { ContentScriptMessage } from '../../shared/messages';
import { PostBuffer } from '../shared/post-buffer';
import { FeedObserver } from '../shared/mutation-observer';
import { setSelectors, getSelector, hasSelectors } from '../shared/selector-reader';
import {
  safeQuerySelector, getTextContent,
  parseEngagementCount,
  createErrorResult, createSuccessResult, findPostOnPage
} from '../shared/scraper-base';
import bundledSelectors from '../../config/selectors.json';

const buffer = new PostBuffer();
let feedObserver: FeedObserver | null = null;

/**
 * Compute age in minutes from an ISO 8601 datetime string.
 */
export function computeAgeMinutes(isoDatetime: string): number | undefined {
  if (!isoDatetime) return undefined;
  const parsed = Date.parse(isoDatetime);
  if (isNaN(parsed)) return undefined;
  const diffMs = Date.now() - parsed;
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / 60000);
}

export function scrapeXTwitterPosts(container: Document | Element): PostData[] {
  const feedPostSelector = getSelector('feedPost');
  if (!feedPostSelector) return [];

  let postElements: Element[];
  try {
    postElements = Array.from(container.querySelectorAll(feedPostSelector));
  } catch {
    return [];
  }

  const posts: PostData[] = [];

  for (const el of postElements) {
    try {
      const authorName = getTextContent(safeQuerySelector(el, 'authorName'));
      const authorHandle = getTextContent(safeQuerySelector(el, 'authorHandle'));
      const content = getTextContent(safeQuerySelector(el, 'postText'));

      // Extract timestamp from time[datetime] element
      const timestampSelector = getSelector('timestamp');
      const timeEl = timestampSelector ? el.querySelector(timestampSelector) : null;
      const datetimeAttr = timeEl?.getAttribute('datetime') || '';
      const timestampText = getTextContent(timeEl as Element | null);

      // Engagement counts
      const likesText = getTextContent(safeQuerySelector(el, 'engagementLikes'));
      const commentsText = getTextContent(safeQuerySelector(el, 'engagementComments'));
      const repostsText = getTextContent(safeQuerySelector(el, 'engagementReposts'));
      const viewsText = getTextContent(safeQuerySelector(el, 'engagementViews'));

      if (!authorName && !content) continue; // skip empty tweets

      // Generate a unique ID from handle + content
      const id = `xt-${hashString((authorHandle + authorName + content).slice(0, 100))}`;

      // Try to get permalink (X uses /status/ in tweet URLs)
      const linkEl = el.querySelector('a[href*="/status/"]') as HTMLAnchorElement | null;
      const url = linkEl?.href || '';

      const post: PostData = {
        id,
        platform: 'x-twitter',
        author: {
          name: authorName,
          handle: authorHandle || undefined,
        },
        content,
        timestamp: datetimeAttr || timestampText,
        ageMinutes: computeAgeMinutes(datetimeAttr),
        engagement: {
          likes: parseEngagementCount(likesText),
          comments: parseEngagementCount(commentsText),
          reposts: parseEngagementCount(repostsText),
          views: parseEngagementCount(viewsText) || undefined,
        },
        url,
      };

      posts.push(post);
    } catch {
      // Skip malformed tweets
      continue;
    }
  }

  return posts;
}

function handleScrapeRequest(): ScrapeResult {
  try {
    const posts = scrapeXTwitterPosts(document);
    buffer.add(posts);
    return createSuccessResult(buffer.getAll());
  } catch (error) {
    return createErrorResult(
      `X/Twitter scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// Initialize with selectors
export function init(selectors: PlatformSelectors): void {
  setSelectors(selectors);

  // Start observing for infinite scroll
  feedObserver = new FeedObserver(
    buffer,
    scrapeXTwitterPosts,
    selectors.feedPost
  );
  feedObserver.start();
}

// Simple hash function for generating post IDs
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

// Message listener
chrome.runtime.onMessage.addListener((message: ContentScriptMessage, _sender, sendResponse) => {
  if (message.type === 'SCRAPE_PAGE') {
    const result = handleScrapeRequest();
    sendResponse(result);
    return true; // async response
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

// Self-initialize with bundled selectors immediately (don't wait for service worker)
const xBundledSelectors = bundledSelectors.platforms['x-twitter'];
if (xBundledSelectors && !hasSelectors()) {
  setSelectors(xBundledSelectors as unknown as PlatformSelectors);
}

console.log('Social Media Manager: X/Twitter content script loaded');
