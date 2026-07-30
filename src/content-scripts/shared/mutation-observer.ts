import type { PostData } from '../../shared/types';
import { PostBuffer } from './post-buffer';

export type ScrapeFunction = (container: Document | Element) => PostData[];

export class FeedObserver {
  private observer: MutationObserver | null = null;
  private buffer: PostBuffer;
  private scrapeFn: ScrapeFunction;
  private feedSelector: string;

  constructor(buffer: PostBuffer, scrapeFn: ScrapeFunction, feedSelector: string) {
    this.buffer = buffer;
    this.scrapeFn = scrapeFn;
    this.feedSelector = feedSelector;
  }

  start(): void {
    const feedContainer = document.querySelector(this.feedSelector);
    const target = feedContainer || document.body;

    this.observer = new MutationObserver((mutations) => {
      const hasNewNodes = mutations.some(m => m.addedNodes.length > 0);
      if (hasNewNodes) {
        const posts = this.scrapeFn(document);
        if (posts.length > 0) {
          this.buffer.add(posts);
        }
      }
    });

    this.observer.observe(target, {
      childList: true,
      subtree: true,
    });
  }

  stop(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
}
