import type { PostData, ScrapeResult } from '../../shared/types';
import { getSelector } from './selector-reader';
import type { PlatformSelectors } from '../../shared/types';

export function safeQuerySelector(container: Element | Document, selectorKey: keyof PlatformSelectors): Element | null {
  const selector = getSelector(selectorKey);
  if (!selector) return null;
  try {
    return container.querySelector(selector);
  } catch {
    return null;
  }
}

export function safeQuerySelectorAll(container: Element | Document, selectorKey: keyof PlatformSelectors): Element[] {
  const selector = getSelector(selectorKey);
  if (!selector) return [];
  try {
    return Array.from(container.querySelectorAll(selector));
  } catch {
    return [];
  }
}

export function getTextContent(element: Element | null): string {
  return element?.textContent?.trim() || '';
}

export function parseEngagementCount(text: string): number {
  if (!text) return 0;
  const cleaned = text.replace(/,/g, '').trim();
  if (cleaned.endsWith('K') || cleaned.endsWith('k')) {
    return Math.round(parseFloat(cleaned) * 1000);
  }
  if (cleaned.endsWith('M') || cleaned.endsWith('m')) {
    return Math.round(parseFloat(cleaned) * 1000000);
  }
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? 0 : num;
}

export function parseRelativeTime(text: string): number | undefined {
  if (!text) return undefined;
  const lower = text.toLowerCase();

  const minuteMatch = lower.match(/(\d+)\s*m(?:in)?/);
  if (minuteMatch) return parseInt(minuteMatch[1], 10);

  const hourMatch = lower.match(/(\d+)\s*h(?:r|our)?/);
  if (hourMatch) return parseInt(hourMatch[1], 10) * 60;

  const dayMatch = lower.match(/(\d+)\s*d(?:ay)?/);
  if (dayMatch) return parseInt(dayMatch[1], 10) * 1440;

  const weekMatch = lower.match(/(\d+)\s*w(?:eek)?/);
  if (weekMatch) return parseInt(weekMatch[1], 10) * 10080;

  return undefined;
}

export function createErrorResult(error: string): ScrapeResult {
  return { success: false, posts: [], error };
}

export function createSuccessResult(posts: PostData[]): ScrapeResult {
  return { success: true, posts };
}

/**
 * Find a post on the current page by its URL or content, scroll to it, and briefly highlight it.
 * Returns true if found, false otherwise.
 */
export function findPostOnPage(postId: string, url: string): boolean {
  // Strategy 1: Find by post ID embedded in data attributes
  const byDataId = document.querySelector(`[data-id="${postId}"], [data-urn*="${postId}"]`);
  if (byDataId) {
    scrollAndHighlight(byDataId as HTMLElement);
    return true;
  }

  // Strategy 2: Find by URL in a link element
  if (url) {
    // Try matching the full URL or just the path
    const urlPath = url.replace(/^https?:\/\/[^/]+/, '');
    const selectors = [
      `a[href*="${url}"]`,
      `a[href*="${urlPath}"]`,
    ];
    // Also try matching activity ID from LinkedIn URLs
    const activityMatch = url.match(/activity[:-](\d+)/);
    if (activityMatch) {
      selectors.push(`[data-urn*="${activityMatch[1]}"]`);
      selectors.push(`a[href*="${activityMatch[1]}"]`);
    }

    for (const selector of selectors) {
      try {
        const el = document.querySelector(selector);
        if (el) {
          const postEl = el.closest('article, [data-urn], [data-testid="tweet"], .feed-shared-update-v2, .occludable-update, div[data-id], .post-preview, .comment-list-item');
          if (postEl) {
            scrollAndHighlight(postEl as HTMLElement);
            return true;
          }
          // If no parent post container, highlight the link itself
          scrollAndHighlight(el as HTMLElement);
          return true;
        }
      } catch {
        continue;
      }
    }
  }

  // Strategy 3: If URL is a full page URL, navigate to it
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    window.location.href = url;
    return true;
  }

  return false;
}

function scrollAndHighlight(element: HTMLElement): void {
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Add a temporary highlight
  const originalOutline = element.style.outline;
  const originalTransition = element.style.transition;
  element.style.transition = 'outline 0.3s ease';
  element.style.outline = '2px solid #3b82f6';

  setTimeout(() => {
    element.style.outline = 'none';
    setTimeout(() => {
      element.style.outline = originalOutline;
      element.style.transition = originalTransition;
    }, 300);
  }, 2000);
}
