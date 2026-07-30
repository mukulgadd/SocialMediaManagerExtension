/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { setSelectors } from '../../src/content-scripts/shared/selector-reader';
import { PostBuffer } from '../../src/content-scripts/shared/post-buffer';
import { scrapeXTwitterPosts, computeAgeMinutes } from '../../src/content-scripts/platforms/x-twitter';
import type { PlatformSelectors, PostData } from '../../src/shared/types';

const xTwitterSelectors: PlatformSelectors = {
  feedPost: "[data-testid='tweet']",
  authorName: "[data-testid='User-Name'] span:first-child",
  authorHandle: "[data-testid='User-Name'] a[tabindex='-1'] span",
  postText: "[data-testid='tweetText']",
  engagementLikes: "[data-testid='like'] span",
  engagementComments: "[data-testid='reply'] span",
  engagementReposts: "[data-testid='retweet'] span",
  engagementViews: "a[href$='/analytics'] span",
  timestamp: "time[datetime]",
};

function createMockTweet(opts: {
  author: string;
  handle: string;
  text: string;
  likes: string;
  replies: string;
  retweets: string;
  views?: string;
  datetime: string;
  displayTime?: string;
  statusUrl?: string;
}): string {
  return `
    <article data-testid="tweet">
      <div data-testid="User-Name">
        <span>${opts.author}</span>
        <a tabindex="-1" href="/${opts.handle.replace('@', '')}">
          <span>${opts.handle}</span>
        </a>
      </div>
      <div data-testid="tweetText">${opts.text}</div>
      <time datetime="${opts.datetime}">${opts.displayTime || ''}</time>
      <div data-testid="reply"><span>${opts.replies}</span></div>
      <div data-testid="retweet"><span>${opts.retweets}</span></div>
      <div data-testid="like"><span>${opts.likes}</span></div>
      ${opts.views ? `<a href="/user/status/123/analytics"><span>${opts.views}</span></a>` : ''}
      ${opts.statusUrl ? `<a href="${opts.statusUrl}">Link</a>` : '<a href="/user/status/12345">Link</a>'}
    </article>
  `;
}

function createMockXTimeline(tweets: Array<{
  author: string;
  handle: string;
  text: string;
  likes: string;
  replies: string;
  retweets: string;
  views?: string;
  datetime: string;
  displayTime?: string;
  statusUrl?: string;
}>): string {
  return tweets.map(t => createMockTweet(t)).join('');
}

describe('X/Twitter Scraper Integration', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    setSelectors(xTwitterSelectors);
  });

  describe('scrapeXTwitterPosts — Timeline', () => {
    it('should extract author handle, display name, tweet text, and engagement', () => {
      document.body.innerHTML = createMockXTimeline([{
        author: 'Elon Musk',
        handle: '@elonmusk',
        text: 'Exciting times ahead for AI!',
        likes: '45K',
        replies: '2,300',
        retweets: '8K',
        views: '1.2M',
        datetime: '2024-07-14T10:30:00.000Z',
        displayTime: 'Jul 14',
      }]);

      const posts = scrapeXTwitterPosts(document);

      expect(posts).toHaveLength(1);
      expect(posts[0].platform).toBe('x-twitter');
      expect(posts[0].author.name).toBe('Elon Musk');
      expect(posts[0].author.handle).toBe('@elonmusk');
      expect(posts[0].content).toBe('Exciting times ahead for AI!');
      expect(posts[0].engagement.likes).toBe(45000);
      expect(posts[0].engagement.comments).toBe(2300);
      expect(posts[0].engagement.reposts).toBe(8000);
      expect(posts[0].engagement.views).toBe(1200000);
    });

    it('should scrape multiple tweets from timeline', () => {
      document.body.innerHTML = createMockXTimeline([
        { author: 'User A', handle: '@usera', text: 'First tweet', likes: '10', replies: '1', retweets: '0', datetime: '2024-07-14T09:00:00.000Z' },
        { author: 'User B', handle: '@userb', text: 'Second tweet', likes: '20', replies: '2', retweets: '1', datetime: '2024-07-14T08:00:00.000Z' },
        { author: 'User C', handle: '@userc', text: 'Third tweet', likes: '30', replies: '3', retweets: '2', datetime: '2024-07-14T07:00:00.000Z' },
      ]);

      const posts = scrapeXTwitterPosts(document);

      expect(posts).toHaveLength(3);
      expect(posts[0].author.name).toBe('User A');
      expect(posts[1].author.name).toBe('User B');
      expect(posts[2].author.name).toBe('User C');
    });

    it('should handle missing views gracefully (views is optional)', () => {
      document.body.innerHTML = createMockXTimeline([{
        author: 'Test User',
        handle: '@testuser',
        text: 'A tweet without views count',
        likes: '5',
        replies: '0',
        retweets: '1',
        datetime: '2024-07-14T10:00:00.000Z',
      }]);

      const posts = scrapeXTwitterPosts(document);

      expect(posts).toHaveLength(1);
      expect(posts[0].engagement.views).toBeUndefined();
    });
  });

  describe('scrapeXTwitterPosts — Thread/Conversation', () => {
    it('should extract root tweet and visible replies with engagement', () => {
      // Thread/conversation: root tweet + replies all appear as [data-testid="tweet"]
      document.body.innerHTML = createMockXTimeline([
        { author: 'Thread Author', handle: '@threadauthor', text: 'Root tweet of the thread', likes: '500', replies: '50', retweets: '100', views: '10K', datetime: '2024-07-14T08:00:00.000Z' },
        { author: 'Reply User 1', handle: '@replyuser1', text: 'Great thread!', likes: '20', replies: '2', retweets: '0', datetime: '2024-07-14T08:30:00.000Z' },
        { author: 'Reply User 2', handle: '@replyuser2', text: 'I agree with this take', likes: '10', replies: '1', retweets: '1', datetime: '2024-07-14T09:00:00.000Z' },
      ]);

      const posts = scrapeXTwitterPosts(document);

      expect(posts).toHaveLength(3);
      // Root tweet
      expect(posts[0].author.name).toBe('Thread Author');
      expect(posts[0].content).toBe('Root tweet of the thread');
      expect(posts[0].engagement.likes).toBe(500);
      expect(posts[0].engagement.views).toBe(10000);
      // Replies
      expect(posts[1].author.name).toBe('Reply User 1');
      expect(posts[1].content).toBe('Great thread!');
      expect(posts[2].author.name).toBe('Reply User 2');
      expect(posts[2].content).toBe('I agree with this take');
    });
  });

  describe('Timestamp & ageMinutes', () => {
    it('should extract timestamp from time[datetime] and compute ageMinutes', () => {
      const now = Date.now();
      const thirtyMinutesAgo = new Date(now - 30 * 60 * 1000).toISOString();

      document.body.innerHTML = createMockXTimeline([{
        author: 'Recent User',
        handle: '@recent',
        text: 'Just posted',
        likes: '3',
        replies: '0',
        retweets: '0',
        datetime: thirtyMinutesAgo,
        displayTime: '30m',
      }]);

      const posts = scrapeXTwitterPosts(document);

      expect(posts[0].timestamp).toBe(thirtyMinutesAgo);
      // Allow 1 minute tolerance for test execution time
      expect(posts[0].ageMinutes).toBeGreaterThanOrEqual(29);
      expect(posts[0].ageMinutes).toBeLessThanOrEqual(31);
    });

    it('should store ISO datetime as timestamp (not display text)', () => {
      document.body.innerHTML = createMockXTimeline([{
        author: 'Date User',
        handle: '@dateuser',
        text: 'Testing datetime',
        likes: '1',
        replies: '0',
        retweets: '0',
        datetime: '2024-07-14T10:30:00.000Z',
        displayTime: 'Jul 14',
      }]);

      const posts = scrapeXTwitterPosts(document);

      expect(posts[0].timestamp).toBe('2024-07-14T10:30:00.000Z');
    });
  });

  describe('computeAgeMinutes', () => {
    it('should compute minutes from ISO datetime', () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const age = computeAgeMinutes(fiveMinutesAgo);
      expect(age).toBeGreaterThanOrEqual(4);
      expect(age).toBeLessThanOrEqual(6);
    });

    it('should return undefined for empty string', () => {
      expect(computeAgeMinutes('')).toBeUndefined();
    });

    it('should return undefined for invalid datetime', () => {
      expect(computeAgeMinutes('not-a-date')).toBeUndefined();
    });

    it('should return 0 for future dates', () => {
      const futureDate = new Date(Date.now() + 60000).toISOString();
      expect(computeAgeMinutes(futureDate)).toBe(0);
    });
  });

  describe('data-testid selectors', () => {
    it('should use data-testid attributes as primary selectors', () => {
      // Verify the selectors config uses data-testid
      expect(xTwitterSelectors.feedPost).toBe("[data-testid='tweet']");
      expect(xTwitterSelectors.authorName).toContain('data-testid');
      expect(xTwitterSelectors.postText).toContain('data-testid');
      expect(xTwitterSelectors.engagementLikes).toContain('data-testid');
      expect(xTwitterSelectors.engagementComments).toContain('data-testid');
      expect(xTwitterSelectors.engagementReposts).toContain('data-testid');
    });

    it('should scrape correctly using data-testid selectors', () => {
      document.body.innerHTML = `
        <article data-testid="tweet">
          <div data-testid="User-Name">
            <span>Test Author</span>
            <a tabindex="-1" href="/testhandle"><span>@testhandle</span></a>
          </div>
          <div data-testid="tweetText">Hello from X!</div>
          <time datetime="2024-07-14T12:00:00.000Z">2h</time>
          <div data-testid="reply"><span>5</span></div>
          <div data-testid="retweet"><span>3</span></div>
          <div data-testid="like"><span>42</span></div>
          <a href="/testhandle/status/999">Link</a>
        </article>
      `;

      const posts = scrapeXTwitterPosts(document);

      expect(posts).toHaveLength(1);
      expect(posts[0].author.name).toBe('Test Author');
      expect(posts[0].author.handle).toBe('@testhandle');
      expect(posts[0].content).toBe('Hello from X!');
      expect(posts[0].engagement.likes).toBe(42);
      expect(posts[0].engagement.comments).toBe(5);
      expect(posts[0].engagement.reposts).toBe(3);
    });
  });

  describe('PostData normalization', () => {
    it('should normalize into PostData interface with platform x-twitter', () => {
      document.body.innerHTML = createMockXTimeline([{
        author: 'Normalizer',
        handle: '@normalizer',
        text: 'Checking normalization',
        likes: '100',
        replies: '10',
        retweets: '5',
        views: '1K',
        datetime: '2024-07-14T10:00:00.000Z',
        statusUrl: '/normalizer/status/456',
      }]);

      const posts = scrapeXTwitterPosts(document);
      const post = posts[0];

      // Validate PostData shape
      expect(post.id).toMatch(/^xt-/);
      expect(post.platform).toBe('x-twitter');
      expect(post.author).toHaveProperty('name');
      expect(post.author).toHaveProperty('handle');
      expect(post.content).toBeDefined();
      expect(post.timestamp).toBeDefined();
      expect(post.engagement).toHaveProperty('likes');
      expect(post.engagement).toHaveProperty('comments');
      expect(post.engagement).toHaveProperty('reposts');
      expect(post.engagement).toHaveProperty('views');
      expect(post.url).toContain('/status/');
    });

    it('should generate unique IDs with xt- prefix', () => {
      document.body.innerHTML = createMockXTimeline([
        { author: 'A', handle: '@a', text: 'Tweet 1', likes: '1', replies: '0', retweets: '0', datetime: '2024-07-14T10:00:00.000Z' },
        { author: 'B', handle: '@b', text: 'Tweet 2', likes: '2', replies: '0', retweets: '0', datetime: '2024-07-14T11:00:00.000Z' },
      ]);

      const posts = scrapeXTwitterPosts(document);

      expect(posts[0].id).toMatch(/^xt-/);
      expect(posts[1].id).toMatch(/^xt-/);
      expect(posts[0].id).not.toBe(posts[1].id);
    });

    it('should extract URL from link containing /status/', () => {
      document.body.innerHTML = `
        <article data-testid="tweet">
          <div data-testid="User-Name"><span>URL User</span><a tabindex="-1" href="/urluser"><span>@urluser</span></a></div>
          <div data-testid="tweetText">Check the link</div>
          <time datetime="2024-07-14T10:00:00.000Z">1h</time>
          <div data-testid="reply"><span>0</span></div>
          <div data-testid="retweet"><span>0</span></div>
          <div data-testid="like"><span>0</span></div>
          <a href="https://x.com/urluser/status/1234567890">Permalink</a>
        </article>
      `;

      const posts = scrapeXTwitterPosts(document);

      expect(posts[0].url).toBe('https://x.com/urluser/status/1234567890');
    });
  });

  describe('Graceful failure handling', () => {
    it('should skip tweets with no author and no content', () => {
      document.body.innerHTML = `
        <article data-testid="tweet">
          <div data-testid="User-Name"><span></span></div>
          <div data-testid="tweetText"></div>
          <time datetime="2024-07-14T10:00:00.000Z"></time>
        </article>
        <article data-testid="tweet">
          <div data-testid="User-Name"><span>Valid User</span><a tabindex="-1" href="/valid"><span>@valid</span></a></div>
          <div data-testid="tweetText">Valid content</div>
          <time datetime="2024-07-14T10:00:00.000Z">1h</time>
          <div data-testid="reply"><span>1</span></div>
          <div data-testid="retweet"><span>0</span></div>
          <div data-testid="like"><span>5</span></div>
        </article>
      `;

      const posts = scrapeXTwitterPosts(document);

      expect(posts).toHaveLength(1);
      expect(posts[0].author.name).toBe('Valid User');
    });

    it('should handle completely malformed DOM without crashing', () => {
      document.body.innerHTML = `
        <article data-testid="tweet">
          <div>Completely wrong structure with no expected elements</div>
        </article>
      `;

      const posts = scrapeXTwitterPosts(document);
      expect(posts).toHaveLength(0);
    });

    it('should return empty array when no selectors configured', () => {
      setSelectors({ feedPost: '' } as PlatformSelectors);

      document.body.innerHTML = createMockXTimeline([{
        author: 'Test', handle: '@test', text: 'Content', likes: '1', replies: '0', retweets: '0', datetime: '2024-07-14T10:00:00.000Z',
      }]);

      const posts = scrapeXTwitterPosts(document);
      expect(posts).toHaveLength(0);
    });

    it('should handle missing engagement elements gracefully', () => {
      document.body.innerHTML = `
        <article data-testid="tweet">
          <div data-testid="User-Name"><span>Partial User</span><a tabindex="-1" href="/partial"><span>@partial</span></a></div>
          <div data-testid="tweetText">Tweet with missing engagement</div>
          <time datetime="2024-07-14T10:00:00.000Z">1h</time>
        </article>
      `;

      const posts = scrapeXTwitterPosts(document);

      expect(posts).toHaveLength(1);
      expect(posts[0].engagement.likes).toBe(0);
      expect(posts[0].engagement.comments).toBe(0);
      expect(posts[0].engagement.reposts).toBe(0);
      expect(posts[0].engagement.views).toBeUndefined();
    });

    it('should handle missing timestamp gracefully', () => {
      document.body.innerHTML = `
        <article data-testid="tweet">
          <div data-testid="User-Name"><span>No Time User</span><a tabindex="-1" href="/notime"><span>@notime</span></a></div>
          <div data-testid="tweetText">No timestamp here</div>
          <div data-testid="reply"><span>0</span></div>
          <div data-testid="retweet"><span>0</span></div>
          <div data-testid="like"><span>1</span></div>
        </article>
      `;

      const posts = scrapeXTwitterPosts(document);

      expect(posts).toHaveLength(1);
      expect(posts[0].ageMinutes).toBeUndefined();
    });
  });

  describe('PostBuffer integration', () => {
    it('should work with PostBuffer (max 50)', () => {
      const buf = new PostBuffer(50);
      const tweets = Array.from({ length: 60 }, (_, i) => ({
        author: `User ${i}`,
        handle: `@user${i}`,
        text: `Tweet number ${i}`,
        likes: `${i}`,
        replies: '0',
        retweets: '0',
        datetime: '2024-07-14T10:00:00.000Z',
      }));

      document.body.innerHTML = createMockXTimeline(tweets);
      const posts = scrapeXTwitterPosts(document);
      buf.add(posts);

      expect(buf.size).toBe(50);
    });

    it('should deduplicate tweets in buffer by ID', () => {
      const buf = new PostBuffer(50);

      document.body.innerHTML = createMockXTimeline([{
        author: 'Same Author',
        handle: '@same',
        text: 'Same tweet',
        likes: '10',
        replies: '1',
        retweets: '0',
        datetime: '2024-07-14T10:00:00.000Z',
      }]);

      const posts = scrapeXTwitterPosts(document);
      buf.add(posts);
      buf.add(posts); // Add same posts again

      expect(buf.size).toBe(1);
    });
  });
});
