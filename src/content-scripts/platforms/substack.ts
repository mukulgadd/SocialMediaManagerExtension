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
 * Check if the current page is a Substack post/article page.
 */
function isPostPage(): boolean {
  return window.location.pathname.startsWith('/p/');
}

/**
 * Check if the current page is the Substack dashboard (publisher view).
 */
function isDashboardPage(): boolean {
  return window.location.pathname.startsWith('/publish');
}

/**
 * Check if the current page is Substack Notes.
 */
function isNotesPage(): boolean {
  const path = window.location.pathname;
  const hostname = window.location.hostname;
  // The main substack.com homepage is the Notes feed
  // Also /notes path and user profile notes
  return path.startsWith('/notes') ||
    path === '/' && (hostname === 'substack.com' || hostname === 'www.substack.com') ||
    path.startsWith('/@') ||
    path.startsWith('/home');
}

/**
 * Extract the post title from an article page.
 */
export function extractPostTitle(container: Document | Element): string {
  const selectors = [
    'h1.post-title',
    'h1[class*="post-title"]',
    'article h1',
    '.post-header h1',
    'h1',
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
 * Extract the post/article body text.
 */
export function extractPostContent(container: Document | Element): string {
  const postTextSelector = getSelector('postText');
  const selectors = postTextSelector
    ? [postTextSelector, '.body.markup', '.post-content', '.available-content', 'article .body']
    : ['.body.markup', '.post-content', '.available-content', 'article .body'];

  for (const selector of selectors) {
    try {
      const el = container.querySelector(selector);
      const text = el?.textContent?.trim();
      if (text && text.length > 20) return text;
    } catch {
      continue;
    }
  }
  return '';
}

/**
 * Extract the author name from a post page.
 */
export function extractAuthorName(container: Document | Element): string {
  const authorSelector = getSelector('authorName');
  const selectors = authorSelector
    ? [authorSelector, '.post-header .byline a', '.author-name', '.pencraft .profile-hover-card-target span']
    : ['.post-header .byline a', '.author-name', '.pencraft .profile-hover-card-target span'];

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
 * Extract comments from a Substack post page.
 */
export function scrapeComments(container: Document | Element): CommentData[] {
  const commentContainerSelector = getSelector('commentContainer') || '.comment-list-item, .comment, div[class*="comment-item"]';
  let commentElements: Element[];
  try {
    commentElements = Array.from(container.querySelectorAll(commentContainerSelector));
  } catch {
    return [];
  }

  const comments: CommentData[] = [];

  for (const el of commentElements) {
    try {
      const authorSelector = getSelector('commentAuthor') || '.comment-meta .commenter-name, .comment-author-name, .profile-hover-card-target span';
      const textSelector = getSelector('commentText') || '.comment-body .body, .comment-content';
      const likesSelector = getSelector('commentLikes') || '.comment-like-button .label, .like-button .label';

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
 * Extract subscriber count and dashboard metrics from publisher dashboard pages.
 */
export function scrapeDashboardMetrics(container: Document | Element): PostData[] {
  // Try to find subscriber count
  const subscriberSelector = getSelector('subscriberCount') || '.pencraft.pc-display-flex .pub-stats span, .subscriber-count';
  let subscriberText = '';
  try {
    const selectors = subscriberSelector.split(',').map(s => s.trim());
    for (const sel of selectors) {
      const el = container.querySelector(sel);
      if (el?.textContent?.trim()) {
        subscriberText = el.textContent.trim();
        break;
      }
    }
  } catch {
    // Ignore
  }

  // Gather any visible stats on the dashboard
  const statSelectors = [
    '.dashboard-stat',
    '.metrics-card',
    '.stat-value',
    '[class*="metric"]',
    '.publish-stats',
  ];

  let metricsText = subscriberText ? `Subscribers: ${subscriberText}` : '';

  for (const selector of statSelectors) {
    try {
      const els = container.querySelectorAll(selector);
      if (els.length > 0) {
        const stats = Array.from(els)
          .map(el => el.textContent?.trim())
          .filter(Boolean)
          .join(' | ');
        if (stats) {
          metricsText = metricsText ? `${metricsText} | ${stats}` : stats;
        }
        break;
      }
    } catch {
      continue;
    }
  }

  // Also try to extract recent post titles from the dashboard
  const postTitleSelectors = [
    '.post-list-item .post-title',
    '.draft-title',
    'table td a',
  ];

  for (const selector of postTitleSelectors) {
    try {
      const els = container.querySelectorAll(selector);
      if (els.length > 0) {
        const titles = Array.from(els)
          .slice(0, 5)
          .map(el => el.textContent?.trim())
          .filter(Boolean)
          .join(', ');
        if (titles) {
          metricsText = metricsText ? `${metricsText} | Recent posts: ${titles}` : `Recent posts: ${titles}`;
        }
        break;
      }
    } catch {
      continue;
    }
  }

  if (!metricsText) return [];

  const post: PostData = {
    id: `substack-dashboard-${hashString(metricsText.slice(0, 100))}`,
    platform: 'substack',
    author: { name: 'Substack Dashboard' },
    content: metricsText,
    timestamp: new Date().toISOString(),
    engagement: { likes: 0, comments: 0, reposts: 0 },
    url: window.location.href,
  };

  return [post];
}

/**
 * Extract Substack Notes (short-form content similar to tweets/posts).
 */
export function scrapeNotes(container: Document | Element): PostData[] {
  // Notes feed items have role="article" with aria-label="Note" or "Post"
  const noteSelectors = [
    '[role="article"][aria-label="Note"]',
    '[role="article"][aria-label="Post"]',
    '.feedItem-ONDKv3',
  ];

  let noteElements: Element[] = [];
  for (const selector of noteSelectors) {
    try {
      const found = Array.from(container.querySelectorAll(selector));
      if (found.length > 0) {
        noteElements = found;
        break;
      }
    } catch {
      continue;
    }
  }

  if (noteElements.length === 0) return [];

  const posts: PostData[] = [];

  for (const el of noteElements) {
    try {
      // Extract author name
      let author = '';
      const authorSelectors = [
        'span.weight-medium-fw81nC a.link-LIBpto',
        'a.link-LIBpto',
      ];
      for (const sel of authorSelectors) {
        const authorEl = el.querySelector(sel);
        if (authorEl?.textContent?.trim()) {
          author = authorEl.textContent.trim();
          break;
        }
      }

      // Extract content from ProseMirror editor
      let content = '';
      const contentSelectors = [
        '.ProseMirror.FeedProseMirror',
        '.feedCommentBodyInner-AOzMIC',
      ];
      for (const sel of contentSelectors) {
        const contentEl = el.querySelector(sel);
        if (contentEl?.textContent?.trim()) {
          content = contentEl.textContent.trim();
          break;
        }
      }

      // Extract likes
      let likes = 0;
      const likeButton = el.querySelector('button[aria-label="Like"]');
      if (likeButton) {
        const likeText = likeButton.textContent?.trim();
        if (likeText) {
          likes = parseEngagementCount(likeText.replace(/[^0-9kKmM.,]/g, ''));
        }
      }

      // Extract comments count
      let commentsCount = 0;
      const commentButton = el.querySelector('button[aria-label="Comment"]');
      if (commentButton) {
        const commentText = commentButton.textContent?.trim();
        if (commentText) {
          commentsCount = parseEngagementCount(commentText.replace(/[^0-9kKmM.,]/g, ''));
        }
      }

      // Extract timestamp
      let timestampText = '';
      const timeLink = el.querySelector('a.link-LIBpto[title]') as HTMLAnchorElement | null;
      if (timeLink?.title) {
        timestampText = timeLink.title;
      } else {
        // Look for relative time like "1d", "3d", "7h"
        const spans = el.querySelectorAll('span.color-secondary-ls1g8s');
        for (const span of spans) {
          const text = span.textContent?.trim() || '';
          if (/^\d+[hdwm]$/.test(text) || /^\d+ \w+$/.test(text)) {
            timestampText = text;
            break;
          }
        }
      }

      // Extract URL
      let url = '';
      if (timeLink?.href) {
        url = timeLink.href;
      }

      if (!author && !content) continue;

      const post: PostData = {
        id: `substack-note-${hashString((author + content).slice(0, 100))}`,
        platform: 'substack',
        author: { name: author || 'Unknown' },
        content,
        timestamp: timestampText,
        ageMinutes: parseRelativeTime(timestampText),
        engagement: { likes, comments: commentsCount, reposts: 0 },
        url,
      };

      posts.push(post);
    } catch {
      continue;
    }
  }

  return posts;
}

/**
 * Scrape a Substack post page — extract the article as a PostData plus individual comments.
 */
export function scrapePostPage(container: Document | Element): PostData[] {
  const title = extractPostTitle(container);
  const content = extractPostContent(container);
  const authorName = extractAuthorName(container);

  if (!title && !content) return [];

  const posts: PostData[] = [];

  // Extract engagement counts
  const likesSelector = getSelector('engagementLikes') || '.like-button-container .label, .post-ufi-button .label, button[aria-label*="like"] .label';
  const commentsSelector = getSelector('engagementComments') || '.post-ufi-comment-button .label, a[href*="comments"] .label, button[aria-label*="comment"] .label';
  const repostsSelector = getSelector('engagementReposts') || '.post-ufi-button[aria-label*="restack"] .label, button[aria-label*="restack"] .label';
  const timestampSelector = getSelector('timestamp') || 'time, .pencraft.pc-reset .date, .post-date';

  let likes = 0;
  let commentsCount = 0;
  let reposts = 0;
  let timestampText = '';

  try {
    const likeSelectors = likesSelector.split(',').map(s => s.trim());
    for (const sel of likeSelectors) {
      const el = container.querySelector(sel);
      if (el?.textContent?.trim()) {
        likes = parseEngagementCount(el.textContent.trim());
        break;
      }
    }
  } catch { /* ignore */ }

  try {
    const commentSelectors = commentsSelector.split(',').map(s => s.trim());
    for (const sel of commentSelectors) {
      const el = container.querySelector(sel);
      if (el?.textContent?.trim()) {
        commentsCount = parseEngagementCount(el.textContent.trim());
        break;
      }
    }
  } catch { /* ignore */ }

  try {
    const repostSelectors = repostsSelector.split(',').map(s => s.trim());
    for (const sel of repostSelectors) {
      const el = container.querySelector(sel);
      if (el?.textContent?.trim()) {
        reposts = parseEngagementCount(el.textContent.trim());
        break;
      }
    }
  } catch { /* ignore */ }

  try {
    const timeSelectors = timestampSelector.split(',').map(s => s.trim());
    for (const sel of timeSelectors) {
      const el = container.querySelector(sel);
      if (el?.textContent?.trim()) {
        timestampText = el.textContent.trim();
        break;
      }
    }
  } catch { /* ignore */ }

  const articlePost: PostData = {
    id: `substack-post-${hashString((authorName + title).slice(0, 100))}`,
    platform: 'substack',
    author: { name: authorName || 'Unknown Author' },
    content: content || title,
    timestamp: timestampText,
    ageMinutes: parseRelativeTime(timestampText),
    engagement: { likes, comments: commentsCount, reposts },
    url: window.location.href,
    topComments: [],
  };

  // Extract comments
  const comments = scrapeComments(container);
  if (comments.length > 0) {
    articlePost.topComments = comments.slice(0, 5);
  }

  posts.push(articlePost);

  // Also create individual PostData entries for each comment (for engagement opportunities)
  for (const comment of comments) {
    const commentPost: PostData = {
      id: `substack-comment-${hashString((comment.author + comment.content).slice(0, 100))}`,
      platform: 'substack',
      author: { name: comment.author },
      content: comment.content,
      timestamp: '',
      engagement: { likes: comment.engagement.likes, comments: 0, reposts: 0 },
      url: window.location.href,
    };
    posts.push(commentPost);
  }

  return posts;
}

/**
 * Scrape feed posts from a Substack homepage or archive page.
 */
export function scrapeFeedPosts(container: Document | Element): PostData[] {
  const feedPostSelector = getSelector('feedPost') || '.post-preview, article.post, .frontend-pencraft-Box-module__reset--VfQY8';
  let postElements: Element[];
  try {
    postElements = Array.from(container.querySelectorAll(feedPostSelector));
  } catch {
    return [];
  }

  const posts: PostData[] = [];

  for (const el of postElements) {
    try {
      // Title
      const titleEl = el.querySelector('h2, h3, .post-preview-title, a[data-testid="post-preview-title"]');
      const title = titleEl?.textContent?.trim() || '';

      // Content snippet
      const contentEl = el.querySelector('.post-preview-description, .subtitle, p');
      const content = contentEl?.textContent?.trim() || '';

      // Author
      const authorSelector = getSelector('authorName') || '.pencraft .profile-hover-card-target span, .post-header .byline a, .author-name';
      let author = '';
      const authorSelectors = authorSelector.split(',').map(s => s.trim());
      for (const sel of authorSelectors) {
        const authorEl = el.querySelector(sel);
        if (authorEl?.textContent?.trim()) {
          author = authorEl.textContent.trim();
          break;
        }
      }

      // Timestamp
      const timeEl = el.querySelector('time, .post-date');
      const timestampText = timeEl?.textContent?.trim() || '';

      // Engagement
      const likesEl = el.querySelector('.like-button-container .label, .post-ufi-button .label');
      const commentsEl = el.querySelector('.post-ufi-comment-button .label, a[href*="comments"] .label');

      if (!title && !content) continue;

      const post: PostData = {
        id: `substack-feed-${hashString((author + title + content).slice(0, 100))}`,
        platform: 'substack',
        author: { name: author || 'Unknown' },
        content: title ? `${title}\n${content}` : content,
        timestamp: timestampText,
        ageMinutes: parseRelativeTime(timestampText),
        engagement: {
          likes: parseEngagementCount(likesEl?.textContent?.trim() || ''),
          comments: parseEngagementCount(commentsEl?.textContent?.trim() || ''),
          reposts: 0,
        },
        url: (el.querySelector('a[href*="/p/"]') as HTMLAnchorElement)?.href || window.location.href,
      };

      posts.push(post);
    } catch {
      continue;
    }
  }

  return posts;
}

/**
 * Main scrape function — dispatches to the appropriate sub-scraper based on page type.
 */
export function scrapeSubstackPosts(container: Document | Element): PostData[] {
  // Dashboard/publisher pages
  if (isDashboardPage()) {
    return scrapeDashboardMetrics(container);
  }

  // Individual post/article pages
  if (isPostPage()) {
    return scrapePostPage(container);
  }

  // Substack Notes
  if (isNotesPage()) {
    return scrapeNotes(container);
  }

  // Homepage / archive — scrape feed previews
  return scrapeFeedPosts(container);
}

function handleScrapeRequest(): ScrapeResult {
  try {
    const posts = scrapeSubstackPosts(document);
    buffer.add(posts);
    return createSuccessResult(buffer.getAll());
  } catch (error) {
    return createErrorResult(
      `Substack scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// Initialize with selectors
export function init(selectors: PlatformSelectors): void {
  setSelectors(selectors);

  // Start observing for dynamically loaded content
  const feedSelector = selectors.feedPost;
  feedObserver = new FeedObserver(
    buffer,
    scrapeSubstackPosts,
    feedSelector
  );
  feedObserver.start();
}

/**
 * Handle Substack SPA navigation.
 * Substack uses client-side routing; detect via popstate and URL changes.
 */
function handleSPANavigation(): void {
  buffer.clear();
  if (feedObserver) {
    feedObserver.stop();
  }

  // Re-initialize observer for the new page
  const substackBundledSelectors = bundledSelectors.platforms.substack;
  if (substackBundledSelectors) {
    setSelectors(substackBundledSelectors as unknown as PlatformSelectors);
    const feedSelector = substackBundledSelectors.feedPost;
    feedObserver = new FeedObserver(
      buffer,
      scrapeSubstackPosts,
      feedSelector
    );
    feedObserver.start();
  }
}

// Listen for Substack SPA navigation (popstate + link interception)
let lastUrl = window.location.href;

const navigationObserver = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    handleSPANavigation();
  }
});

// Observe the document for URL-change-inducing mutations
navigationObserver.observe(document.body, { childList: true, subtree: true });

// Also listen for popstate (back/forward navigation)
window.addEventListener('popstate', () => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    handleSPANavigation();
  }
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
const substackBundledSelectors = bundledSelectors.platforms.substack;
if (substackBundledSelectors && !hasSelectors()) {
  setSelectors(substackBundledSelectors as unknown as PlatformSelectors);
}

console.log('Social Media Manager: Substack content script loaded');
