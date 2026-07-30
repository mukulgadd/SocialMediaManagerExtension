import type { PostData, CommentData, ScrapeResult, PlatformSelectors } from '../../shared/types';
import type { ContentScriptMessage } from '../../shared/messages';
import { PostBuffer } from '../shared/post-buffer';
import { FeedObserver } from '../shared/mutation-observer';
import { setSelectors, getSelector, hasSelectors } from '../shared/selector-reader';
import {
  safeQuerySelector, safeQuerySelectorAll, getTextContent,
  parseEngagementCount, parseRelativeTime,
  createErrorResult, createSuccessResult, findPostOnPage
} from '../shared/scraper-base';
import bundledSelectors from '../../config/selectors.json';

const buffer = new PostBuffer();
let feedObserver: FeedObserver | null = null;

export function scrapeLinkedInPosts(container: Document | Element): PostData[] {
  const feedPostSelector = getSelector('feedPost');
  console.log('[SMM] feedPost selector:', feedPostSelector);
  if (!feedPostSelector) return [];

  let postElements: Element[];
  try {
    postElements = Array.from(container.querySelectorAll(feedPostSelector));
    console.log('[SMM] Found', postElements.length, 'post elements');
  } catch {
    return [];
  }

  const posts: PostData[] = [];

  for (const el of postElements) {
    try {
      let author = getTextContent(safeQuerySelector(el, 'authorName'));
      const content = getTextContent(safeQuerySelector(el, 'postText'));
      const timestampText = getTextContent(safeQuerySelector(el, 'timestamp'));
      const likesText = getTextContent(safeQuerySelector(el, 'engagementLikes'));
      const commentsText = getTextContent(safeQuerySelector(el, 'engagementComments'));
      const repostsText = getTextContent(safeQuerySelector(el, 'engagementReposts'));
      const followersText = getTextContent(safeQuerySelector(el, 'authorFollowers'));

      // Fallback author extraction if selector didn't match
      if (!author) {
        // Try common LinkedIn patterns for actor name
        const actorNameSelectors = [
          '.update-components-actor__name span[aria-hidden="true"]',
          '.feed-shared-actor__name span[aria-hidden="true"]',
          'a[data-tracking-control-name*="actor"] span[aria-hidden="true"]',
          '.update-components-actor__title span[aria-hidden="true"]',
          'span.feed-shared-actor__name',
          '.artdeco-entity-lockup__title span[aria-hidden="true"]',
          'a.app-aware-link span[dir="ltr"] > span[aria-hidden="true"]',
        ];
        for (const sel of actorNameSelectors) {
          try {
            const nameEl = el.querySelector(sel);
            const text = nameEl?.textContent?.trim();
            if (text && text.length > 1 && text.length < 100) {
              author = text;
              break;
            }
          } catch { continue; }
        }
      }

      if (!author && !content) continue; // skip empty posts

      // Generate a unique ID from the post content + author
      const id = `li-${hashString((author + content).slice(0, 100))}`;

      // Try to get permalink — multiple strategies
      let url = '';
      const linkSelectors = [
        'a[href*="/feed/update/"]',
        'a[href*="/posts/"]',
        'a[href*="/activity-"]',
        'a[href*="/activity:"]',
        '.update-components-actor__sub-description a[href*="linkedin.com"]',
        'a.app-aware-link[href*="/feed/"]',
        // Timestamp links often point to the post
        'time[datetime]',
      ];
      for (const sel of linkSelectors) {
        try {
          const found = el.querySelector(sel);
          if (found) {
            // If it's a time element, get its parent <a> link
            const linkEl = found.tagName === 'TIME'
              ? found.closest('a') as HTMLAnchorElement | null
              : found as HTMLAnchorElement;
            if (linkEl?.href && linkEl.href.includes('linkedin.com')) {
              url = linkEl.href;
              break;
            }
          }
        } catch { continue; }
      }
      // Fallback: construct URL from data-urn (check self and ancestors)
      if (!url) {
        let urnEl: Element | null = el;
        let urn = '';
        while (urnEl && !urn) {
          urn = urnEl.getAttribute('data-urn') || urnEl.getAttribute('data-id') || '';
          if (!urn) urnEl = urnEl.parentElement;
        }
        if (urn && urn.includes('activity')) {
          const activityId = urn.split(':').pop();
          if (activityId) {
            url = `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}/`;
          }
        }
      }

      const post: PostData = {
        id,
        platform: 'linkedin',
        author: {
          name: author,
          followerCount: followersText ? parseEngagementCount(followersText) : undefined,
        },
        content,
        timestamp: timestampText,
        ageMinutes: parseRelativeTime(timestampText),
        engagement: {
          likes: parseEngagementCount(likesText),
          comments: parseEngagementCount(commentsText),
          reposts: parseEngagementCount(repostsText),
        },
        url,
      };

      // Extract top comments if visible
      const comments = scrapeTopComments(el);
      if (comments.length > 0) {
        post.topComments = comments;
      }

      posts.push(post);
    } catch {
      // Skip malformed posts
      continue;
    }
  }

  return posts;
}

export function scrapeTopComments(postElement: Element): CommentData[] {
  const commentEls = safeQuerySelectorAll(postElement, 'commentContainer');
  const comments: CommentData[] = [];

  for (const el of commentEls.slice(0, 3)) {
    const author = getTextContent(safeQuerySelector(el, 'commentAuthor'));
    const content = getTextContent(safeQuerySelector(el, 'commentText'));
    const likesText = getTextContent(safeQuerySelector(el, 'commentLikes'));

    if (author || content) {
      comments.push({
        author,
        content,
        engagement: { likes: parseEngagementCount(likesText) },
      });
    }
  }

  // Sort by likes descending to get "top" comments
  return comments.sort((a, b) => b.engagement.likes - a.engagement.likes);
}

function handleScrapeRequest(): ScrapeResult {
  try {
    console.log('[SMM] LinkedIn scraping requested, hasSelectors:', hasSelectors());
    const posts = scrapeLinkedInPosts(document);
    console.log('[SMM] LinkedIn scraped', posts.length, 'posts');
    buffer.add(posts);
    return createSuccessResult(buffer.getAll());
  } catch (error) {
    console.error('[SMM] LinkedIn scraping error:', error);
    return createErrorResult(
      `LinkedIn scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// Initialize with selectors
export function init(selectors: PlatformSelectors): void {
  setSelectors(selectors);

  // Start observing for infinite scroll
  feedObserver = new FeedObserver(
    buffer,
    scrapeLinkedInPosts,
    selectors.feedPost
  );
  feedObserver.start();
}

// Simple hash function for generating post IDs without btoa (not available in all envs)
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
const linkedinBundledSelectors = bundledSelectors.platforms.linkedin;
if (linkedinBundledSelectors && !hasSelectors()) {
  setSelectors(linkedinBundledSelectors as unknown as PlatformSelectors);
}

console.log('Social Media Manager: LinkedIn content script loaded');
