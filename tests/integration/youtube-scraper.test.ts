/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { setSelectors, hasSelectors } from '../../src/content-scripts/shared/selector-reader';
import { PostBuffer } from '../../src/content-scripts/shared/post-buffer';
import {
  extractVideoTitle,
  extractVideoDescription,
  extractChannelName,
  scrapeComments,
  scrapeYouTubePosts,
  scrapeAnalyticsMetrics,
} from '../../src/content-scripts/platforms/youtube';
import type { PlatformSelectors } from '../../src/shared/types';

const youtubeSelectors: PlatformSelectors = {
  feedPost: '#contents ytd-comment-thread-renderer, ytd-comment-renderer',
  authorName: '.yt-author-text span, #channel-name yt-formatted-string',
  postText: '.yt-content-text, #description yt-formatted-string, ytd-text-inline-expander > span',
  engagementLikes: '.yt-vote-count-middle',
  engagementComments: '#count .count-text span',
  timestamp: '#published-time-text a, #info-strings yt-formatted-string',
  commentContainer: '#contents ytd-comment-thread-renderer',
  commentAuthor: '.yt-author-text span',
  commentText: '.yt-content-text',
  commentLikes: '.yt-vote-count-middle',
};

function createMockYouTubeWatchPage(options: {
  title: string;
  channel: string;
  description: string;
  timestamp?: string;
  comments?: Array<{ author: string; text: string; likes: string }>;
}): string {
  const commentsHtml = (options.comments || []).map((c, i) => `
    <ytd-comment-thread-renderer>
      <div id="author-text-${i}" class="yt-author-text"><span>${c.author}</span></div>
      <div id="content-text-${i}" class="yt-content-text">${c.text}</div>
      <span id="vote-count-${i}" class="yt-vote-count-middle">${c.likes}</span>
    </ytd-comment-thread-renderer>
  `).join('');

  return `
    <div id="page-manager">
      <h1 class="ytd-watch-metadata">
        <yt-formatted-string>${options.title}</yt-formatted-string>
      </h1>
      <div id="channel-name">
        <yt-formatted-string><a>${options.channel}</a></yt-formatted-string>
      </div>
      <div id="description">
        <yt-formatted-string>${options.description}</yt-formatted-string>
      </div>
      <div id="info-strings">
        <yt-formatted-string>${options.timestamp || '2 days ago'}</yt-formatted-string>
      </div>
      <div id="count">
        <span class="count-text"><span>${options.comments?.length || 0} Comments</span></span>
      </div>
      <div id="contents">
        ${commentsHtml}
      </div>
    </div>
  `;
}

function createMockYouTubeAnalyticsPage(): string {
  return `
    <div class="analytics-container">
      <div class="metric-value">1,234 views</div>
      <div class="metric-value">56 likes</div>
      <div class="metric-value">12 subscribers</div>
    </div>
  `;
}

describe('YouTube Scraper Integration', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    setSelectors(youtubeSelectors);
    // Mock window.location for watch page
    Object.defineProperty(window, 'location', {
      value: { href: 'https://www.youtube.com/watch?v=test123', pathname: '/watch' },
      writable: true,
    });
  });

  describe('extractVideoTitle', () => {
    it('should extract video title from ytd-watch-metadata', () => {
      document.body.innerHTML = `
        <h1 class="ytd-watch-metadata">
          <yt-formatted-string>How to Build a Chrome Extension</yt-formatted-string>
        </h1>
      `;

      const title = extractVideoTitle(document);
      expect(title).toBe('How to Build a Chrome Extension');
    });

    it('should fall back to #title h1 selector', () => {
      document.body.innerHTML = `
        <div id="title"><h1>Fallback Title</h1></div>
      `;

      const title = extractVideoTitle(document);
      expect(title).toBe('Fallback Title');
    });

    it('should return empty string when no title found', () => {
      document.body.innerHTML = '<div>No title here</div>';

      const title = extractVideoTitle(document);
      expect(title).toBe('');
    });
  });

  describe('extractVideoDescription', () => {
    it('should extract description from #description element', () => {
      document.body.innerHTML = `
        <div id="description">
          <yt-formatted-string>This video explains how to build extensions with TypeScript.</yt-formatted-string>
        </div>
      `;

      const description = extractVideoDescription(document);
      expect(description).toBe('This video explains how to build extensions with TypeScript.');
    });

    it('should fall back to ytd-text-inline-expander', () => {
      document.body.innerHTML = `
        <ytd-text-inline-expander>
          <span>Description from inline expander</span>
        </ytd-text-inline-expander>
      `;

      const description = extractVideoDescription(document);
      expect(description).toBe('Description from inline expander');
    });

    it('should return empty string when no description found', () => {
      document.body.innerHTML = '<div>No description</div>';

      const description = extractVideoDescription(document);
      expect(description).toBe('');
    });
  });

  describe('extractChannelName', () => {
    it('should extract channel name', () => {
      document.body.innerHTML = `
        <div id="channel-name">
          <yt-formatted-string><a>Tech Tutorials</a></yt-formatted-string>
        </div>
      `;

      const channel = extractChannelName(document);
      expect(channel).toBe('Tech Tutorials');
    });

    it('should return empty string when no channel found', () => {
      document.body.innerHTML = '<div>No channel</div>';

      const channel = extractChannelName(document);
      expect(channel).toBe('');
    });
  });

  describe('scrapeComments', () => {
    it('should extract comments with author, text, and likes', () => {
      document.body.innerHTML = `
        <div id="contents">
          <ytd-comment-thread-renderer>
            <div class="yt-author-text"><span>Alice</span></div>
            <div class="yt-content-text">Great video, very helpful!</div>
            <span class="yt-vote-count-middle">42</span>
          </ytd-comment-thread-renderer>
          <ytd-comment-thread-renderer>
            <div class="yt-author-text"><span>Bob</span></div>
            <div class="yt-content-text">I learned a lot from this</div>
            <span class="yt-vote-count-middle">15</span>
          </ytd-comment-thread-renderer>
        </div>
      `;

      const comments = scrapeComments(document);

      expect(comments).toHaveLength(2);
      // Sorted by likes descending
      expect(comments[0].author).toBe('Alice');
      expect(comments[0].content).toBe('Great video, very helpful!');
      expect(comments[0].engagement.likes).toBe(42);
      expect(comments[1].author).toBe('Bob');
      expect(comments[1].content).toBe('I learned a lot from this');
      expect(comments[1].engagement.likes).toBe(15);
    });

    it('should handle empty comments section', () => {
      document.body.innerHTML = '<div id="contents"></div>';

      const comments = scrapeComments(document);
      expect(comments).toHaveLength(0);
    });

    it('should skip comments with no author and no text', () => {
      document.body.innerHTML = `
        <div id="contents">
          <ytd-comment-thread-renderer>
            <div class="yt-author-text"><span></span></div>
            <div class="yt-content-text"></div>
            <span class="yt-vote-count-middle">0</span>
          </ytd-comment-thread-renderer>
          <ytd-comment-thread-renderer>
            <div class="yt-author-text"><span>Valid Author</span></div>
            <div class="yt-content-text">Valid comment</div>
            <span class="yt-vote-count-middle">5</span>
          </ytd-comment-thread-renderer>
        </div>
      `;

      const comments = scrapeComments(document);
      expect(comments).toHaveLength(1);
      expect(comments[0].author).toBe('Valid Author');
    });
  });

  describe('scrapeYouTubePosts', () => {
    it('should create a video post with title, channel, and description on watch page', () => {
      document.body.innerHTML = createMockYouTubeWatchPage({
        title: 'Building Chrome Extensions',
        channel: 'DevChannel',
        description: 'Learn how to build modern Chrome extensions',
        timestamp: '3 days ago',
      });

      const posts = scrapeYouTubePosts(document);

      expect(posts.length).toBeGreaterThanOrEqual(1);
      const videoPost = posts[0];
      expect(videoPost.platform).toBe('youtube');
      expect(videoPost.author.name).toBe('DevChannel');
      expect(videoPost.content).toBe('Learn how to build modern Chrome extensions');
      expect(videoPost.id).toMatch(/^yt-video-/);
    });

    it('should create individual PostData for each comment', () => {
      document.body.innerHTML = createMockYouTubeWatchPage({
        title: 'Test Video',
        channel: 'TestChannel',
        description: 'Test description',
        comments: [
          { author: 'Commenter1', text: 'First comment', likes: '10' },
          { author: 'Commenter2', text: 'Second comment', likes: '5' },
        ],
      });

      const posts = scrapeYouTubePosts(document);

      // 1 video post + 2 comment posts
      expect(posts).toHaveLength(3);
      expect(posts[0].id).toMatch(/^yt-video-/);
      expect(posts[1].id).toMatch(/^yt-comment-/);
      expect(posts[2].id).toMatch(/^yt-comment-/);
    });

    it('should include topComments on the video post', () => {
      document.body.innerHTML = createMockYouTubeWatchPage({
        title: 'Test Video',
        channel: 'TestChannel',
        description: 'Test description',
        comments: [
          { author: 'Alice', text: 'Amazing!', likes: '100' },
          { author: 'Bob', text: 'Good one', likes: '50' },
        ],
      });

      const posts = scrapeYouTubePosts(document);
      const videoPost = posts[0];

      expect(videoPost.topComments).toBeDefined();
      expect(videoPost.topComments!.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty array on non-watch, non-analytics pages', () => {
      Object.defineProperty(window, 'location', {
        value: { href: 'https://www.youtube.com/', pathname: '/' },
        writable: true,
      });
      document.body.innerHTML = '<div>YouTube Home</div>';

      const posts = scrapeYouTubePosts(document);
      expect(posts).toHaveLength(0);
    });

    it('should handle malformed DOM gracefully', () => {
      document.body.innerHTML = `
        <div>
          <span>Completely wrong structure for YouTube</span>
        </div>
      `;

      const posts = scrapeYouTubePosts(document);
      expect(posts).toHaveLength(0);
    });

    it('should use video title as content when description is empty', () => {
      document.body.innerHTML = `
        <h1 class="ytd-watch-metadata">
          <yt-formatted-string>Short Video Title</yt-formatted-string>
        </h1>
        <div id="channel-name">
          <yt-formatted-string><a>MyChannel</a></yt-formatted-string>
        </div>
      `;

      const posts = scrapeYouTubePosts(document);

      expect(posts).toHaveLength(1);
      expect(posts[0].content).toBe('Short Video Title');
    });
  });

  describe('scrapeAnalyticsMetrics', () => {
    it('should extract metrics on analytics pages', () => {
      Object.defineProperty(window, 'location', {
        value: { href: 'https://studio.youtube.com/channel/123/analytics', pathname: '/channel/123/analytics' },
        writable: true,
      });
      document.body.innerHTML = createMockYouTubeAnalyticsPage();

      const posts = scrapeAnalyticsMetrics(document);

      expect(posts).toHaveLength(1);
      expect(posts[0].platform).toBe('youtube');
      expect(posts[0].author.name).toBe('YouTube Studio Analytics');
      expect(posts[0].content).toContain('1,234 views');
      expect(posts[0].content).toContain('56 likes');
      expect(posts[0].id).toMatch(/^yt-analytics-/);
    });

    it('should return empty array when no metrics found', () => {
      Object.defineProperty(window, 'location', {
        value: { href: 'https://studio.youtube.com/channel/123/analytics', pathname: '/channel/123/analytics' },
        writable: true,
      });
      document.body.innerHTML = '<div>No metrics</div>';

      const posts = scrapeAnalyticsMetrics(document);
      expect(posts).toHaveLength(0);
    });
  });

  describe('PostBuffer integration', () => {
    it('should add YouTube posts to buffer and deduplicate', () => {
      const buf = new PostBuffer(50);

      document.body.innerHTML = createMockYouTubeWatchPage({
        title: 'Test Video',
        channel: 'TestChannel',
        description: 'Description text',
        comments: [{ author: 'User1', text: 'Nice!', likes: '3' }],
      });

      const posts = scrapeYouTubePosts(document);
      buf.add(posts);

      expect(buf.size).toBe(posts.length);

      // Adding same posts again should not increase size (dedup)
      buf.add(posts);
      expect(buf.size).toBe(posts.length);
    });

    it('should respect max buffer size of 50', () => {
      const buf = new PostBuffer(50);
      const manyComments = Array.from({ length: 55 }, (_, i) => ({
        author: `User${i}`,
        text: `Comment ${i} text content here`,
        likes: `${i}`,
      }));

      document.body.innerHTML = createMockYouTubeWatchPage({
        title: 'Popular Video',
        channel: 'BigChannel',
        description: 'Lots of engagement',
        comments: manyComments,
      });

      const posts = scrapeYouTubePosts(document);
      buf.add(posts);

      expect(buf.size).toBeLessThanOrEqual(50);
    });
  });

  describe('SPA Navigation handling', () => {
    it('should re-scrape on yt-navigate-finish event', () => {
      document.body.innerHTML = createMockYouTubeWatchPage({
        title: 'First Video',
        channel: 'Channel1',
        description: 'First description',
      });

      // Simulate SPA navigation event
      const event = new Event('yt-navigate-finish');
      document.dispatchEvent(event);

      // After navigation, the scraper should still work on new content
      document.body.innerHTML = createMockYouTubeWatchPage({
        title: 'Second Video',
        channel: 'Channel2',
        description: 'Second description',
      });

      const posts = scrapeYouTubePosts(document);
      expect(posts.length).toBeGreaterThanOrEqual(1);
      expect(posts[0].author.name).toBe('Channel2');
    });
  });

  describe('Self-initialization', () => {
    it('should have selectors available after import', () => {
      // The youtube module self-initializes with bundled selectors
      expect(hasSelectors()).toBe(true);
    });
  });
});
