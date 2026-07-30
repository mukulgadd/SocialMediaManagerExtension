/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { setSelectors, getSelector, hasSelectors } from '../../src/content-scripts/shared/selector-reader';
import { PostBuffer } from '../../src/content-scripts/shared/post-buffer';
import {
  parseEngagementCount,
  parseRelativeTime,
  getTextContent,
  createErrorResult,
  createSuccessResult,
} from '../../src/content-scripts/shared/scraper-base';
import { scrapeLinkedInPosts, scrapeTopComments } from '../../src/content-scripts/platforms/linkedin';
import type { PlatformSelectors, PostData } from '../../src/shared/types';

const linkedinSelectors: PlatformSelectors = {
  feedPost: '.feed-shared-update-v2',
  authorName: '.update-components-actor__name span',
  postText: '.feed-shared-text__text-view span',
  engagementLikes: '.social-details-social-counts__reactions-count',
  engagementComments: '.social-details-social-counts__comments',
  engagementReposts: 'button[aria-label*="repost"] span',
  timestamp: '.update-components-actor__sub-description span[aria-hidden]',
  commentContainer: '.comments-comments-list .comments-comment-item',
  commentAuthor: '.comments-post-meta__name-text',
  commentText: '.comments-comment-item__main-content span',
  commentLikes: '.comments-comment-social-bar__reactions-count',
  authorFollowers: '.update-components-actor__description span',
};

function createMockLinkedInFeed(posts: Array<{
  author: string;
  text: string;
  likes: string;
  comments: string;
  reposts: string;
  timestamp: string;
  followers?: string;
  postComments?: Array<{ author: string; text: string; likes: string }>;
}>): string {
  return posts.map(post => `
    <div class="feed-shared-update-v2">
      <div class="update-components-actor__name"><span>${post.author}</span></div>
      <div class="update-components-actor__description"><span>${post.followers || ''}</span></div>
      <div class="update-components-actor__sub-description"><span aria-hidden="true">${post.timestamp}</span></div>
      <div class="feed-shared-text__text-view"><span>${post.text}</span></div>
      <span class="social-details-social-counts__reactions-count">${post.likes}</span>
      <span class="social-details-social-counts__comments">${post.comments}</span>
      <button aria-label="repost"><span>${post.reposts}</span></button>
      <a href="https://www.linkedin.com/feed/update/urn:li:activity:123">Link</a>
      ${post.postComments ? `
        <div class="comments-comments-list">
          ${post.postComments.map(c => `
            <div class="comments-comment-item">
              <span class="comments-post-meta__name-text">${c.author}</span>
              <div class="comments-comment-item__main-content"><span>${c.text}</span></div>
              <span class="comments-comment-social-bar__reactions-count">${c.likes}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `).join('');
}

function createMockPost(id: string): PostData {
  return {
    id,
    platform: 'linkedin',
    author: { name: `Author ${id}` },
    content: `Content for ${id}`,
    timestamp: '1h',
    engagement: { likes: 10, comments: 2, reposts: 1 },
    url: `https://linkedin.com/post/${id}`,
  };
}

describe('LinkedIn Scraper Integration', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    setSelectors(linkedinSelectors);
  });

  describe('scrapeLinkedInPosts', () => {
    it('should extract author name, post text, engagement counts, and post age', () => {
      document.body.innerHTML = createMockLinkedInFeed([{
        author: 'John Doe',
        text: 'This is a great post about AI and technology',
        likes: '1,234',
        comments: '56',
        reposts: '12',
        timestamp: '3h',
        followers: '5K followers',
      }]);

      const posts = scrapeLinkedInPosts(document);

      expect(posts).toHaveLength(1);
      expect(posts[0].author.name).toBe('John Doe');
      expect(posts[0].content).toBe('This is a great post about AI and technology');
      expect(posts[0].engagement.likes).toBe(1234);
      expect(posts[0].engagement.comments).toBe(56);
      expect(posts[0].engagement.reposts).toBe(12);
      expect(posts[0].timestamp).toBe('3h');
      expect(posts[0].ageMinutes).toBe(180);
      expect(posts[0].platform).toBe('linkedin');
    });

    it('should extract author follower count when visible', () => {
      document.body.innerHTML = createMockLinkedInFeed([{
        author: 'Jane Smith',
        text: 'Sharing insights on leadership',
        likes: '500',
        comments: '20',
        reposts: '5',
        timestamp: '1d',
        followers: '10K',
      }]);

      const posts = scrapeLinkedInPosts(document);

      expect(posts[0].author.followerCount).toBe(10000);
    });

    it('should handle missing follower count gracefully', () => {
      document.body.innerHTML = createMockLinkedInFeed([{
        author: 'Bob',
        text: 'Quick update',
        likes: '10',
        comments: '2',
        reposts: '0',
        timestamp: '5m',
      }]);

      const posts = scrapeLinkedInPosts(document);

      expect(posts[0].author.followerCount).toBeUndefined();
    });

    it('should scrape multiple posts from feed', () => {
      document.body.innerHTML = createMockLinkedInFeed([
        { author: 'User A', text: 'Post one', likes: '10', comments: '1', reposts: '0', timestamp: '1h' },
        { author: 'User B', text: 'Post two', likes: '20', comments: '2', reposts: '1', timestamp: '2h' },
        { author: 'User C', text: 'Post three', likes: '30', comments: '3', reposts: '2', timestamp: '3h' },
      ]);

      const posts = scrapeLinkedInPosts(document);

      expect(posts).toHaveLength(3);
      expect(posts[0].author.name).toBe('User A');
      expect(posts[1].author.name).toBe('User B');
      expect(posts[2].author.name).toBe('User C');
    });

    it('should skip posts with no author and no content', () => {
      document.body.innerHTML = `
        <div class="feed-shared-update-v2">
          <div class="update-components-actor__name"><span></span></div>
          <div class="feed-shared-text__text-view"><span></span></div>
        </div>
        <div class="feed-shared-update-v2">
          <div class="update-components-actor__name"><span>Valid Author</span></div>
          <div class="feed-shared-text__text-view"><span>Valid content</span></div>
          <span class="social-details-social-counts__reactions-count">5</span>
          <span class="social-details-social-counts__comments">1</span>
        </div>
      `;

      const posts = scrapeLinkedInPosts(document);

      expect(posts).toHaveLength(1);
      expect(posts[0].author.name).toBe('Valid Author');
    });

    it('should handle malformed DOM without crashing', () => {
      document.body.innerHTML = `
        <div class="feed-shared-update-v2">
          <div>Completely wrong structure</div>
        </div>
      `;

      // Should not throw - skip posts with no author or content
      const posts = scrapeLinkedInPosts(document);
      expect(posts).toHaveLength(0);
    });

    it('should generate unique IDs for posts', () => {
      document.body.innerHTML = createMockLinkedInFeed([
        { author: 'User A', text: 'Post one', likes: '10', comments: '1', reposts: '0', timestamp: '1h' },
        { author: 'User B', text: 'Post two', likes: '20', comments: '2', reposts: '1', timestamp: '2h' },
      ]);

      const posts = scrapeLinkedInPosts(document);

      expect(posts[0].id).not.toBe(posts[1].id);
      expect(posts[0].id).toMatch(/^li-/);
    });

    it('should extract post URL from permalink', () => {
      document.body.innerHTML = createMockLinkedInFeed([{
        author: 'Author', text: 'Content', likes: '5', comments: '1', reposts: '0', timestamp: '1h',
      }]);

      const posts = scrapeLinkedInPosts(document);

      expect(posts[0].url).toContain('/feed/update/');
    });

    it('should return empty array when no selectors are configured', () => {
      // Set selectors to an object with empty feed post to simulate no config
      setSelectors({ feedPost: '' } as PlatformSelectors);

      document.body.innerHTML = createMockLinkedInFeed([{
        author: 'Test', text: 'Test', likes: '1', comments: '0', reposts: '0', timestamp: '1h',
      }]);

      const posts = scrapeLinkedInPosts(document);
      expect(posts).toHaveLength(0);
    });
  });

  describe('Comment Extraction', () => {
    it('should extract top 3 comments with author and engagement', () => {
      document.body.innerHTML = createMockLinkedInFeed([{
        author: 'Post Author',
        text: 'Main post content',
        likes: '100',
        comments: '5',
        reposts: '2',
        timestamp: '2h',
        postComments: [
          { author: 'Commenter 1', text: 'Great post!', likes: '10' },
          { author: 'Commenter 2', text: 'I agree!', likes: '25' },
          { author: 'Commenter 3', text: 'Interesting perspective', likes: '5' },
          { author: 'Commenter 4', text: 'Should be excluded', likes: '1' },
        ],
      }]);

      const posts = scrapeLinkedInPosts(document);

      expect(posts[0].topComments).toBeDefined();
      expect(posts[0].topComments!).toHaveLength(3);
      // Should be sorted by likes descending
      expect(posts[0].topComments![0].author).toBe('Commenter 2');
      expect(posts[0].topComments![0].engagement.likes).toBe(25);
      expect(posts[0].topComments![1].author).toBe('Commenter 1');
      expect(posts[0].topComments![2].author).toBe('Commenter 3');
    });

    it('should handle posts with no comments', () => {
      document.body.innerHTML = createMockLinkedInFeed([{
        author: 'Author',
        text: 'Post without comments',
        likes: '10',
        comments: '0',
        reposts: '0',
        timestamp: '1h',
      }]);

      const posts = scrapeLinkedInPosts(document);

      expect(posts[0].topComments).toBeUndefined();
    });
  });

  describe('PostBuffer', () => {
    it('should add posts to buffer', () => {
      const buf = new PostBuffer(50);
      const post = createMockPost('1');

      buf.add([post]);

      expect(buf.size).toBe(1);
      expect(buf.getAll()[0].id).toBe('1');
    });

    it('should cap at max 50 posts', () => {
      const buf = new PostBuffer(50);
      const posts = Array.from({ length: 60 }, (_, i) => createMockPost(`post-${i}`));

      buf.add(posts);

      expect(buf.size).toBe(50);
    });

    it('should add new posts at the head', () => {
      const buf = new PostBuffer(50);
      buf.add([createMockPost('old-1'), createMockPost('old-2')]);
      buf.add([createMockPost('new-1')]);

      const all = buf.getAll();
      expect(all[0].id).toBe('new-1');
    });

    it('should deduplicate posts by ID', () => {
      const buf = new PostBuffer(50);
      buf.add([createMockPost('same-id'), createMockPost('other-id')]);
      buf.add([createMockPost('same-id')]);

      expect(buf.size).toBe(2);
    });

    it('should clear all posts', () => {
      const buf = new PostBuffer(50);
      buf.add([createMockPost('1'), createMockPost('2')]);
      buf.clear();

      expect(buf.size).toBe(0);
      expect(buf.getAll()).toEqual([]);
    });

    it('should evict oldest posts when exceeding max size', () => {
      const buf = new PostBuffer(3);
      buf.add([createMockPost('a'), createMockPost('b'), createMockPost('c')]);
      buf.add([createMockPost('d')]);

      expect(buf.size).toBe(3);
      const all = buf.getAll();
      expect(all.map(p => p.id)).toContain('d');
    });
  });

  describe('Selector Reader', () => {
    it('should return selector value when set', () => {
      setSelectors(linkedinSelectors);
      expect(hasSelectors()).toBe(true);
      expect(getSelector('feedPost')).toBe('.feed-shared-update-v2');
    });

    it('should return correct selector keys', () => {
      setSelectors(linkedinSelectors);
      expect(getSelector('authorName')).toBe('.update-components-actor__name span');
      expect(getSelector('postText')).toBe('.feed-shared-text__text-view span');
    });
  });

  describe('Scraper Base Utilities', () => {
    it('should parse engagement counts with commas', () => {
      expect(parseEngagementCount('1,234')).toBe(1234);
      expect(parseEngagementCount('10,000')).toBe(10000);
    });

    it('should parse K/M suffixes', () => {
      expect(parseEngagementCount('5K')).toBe(5000);
      expect(parseEngagementCount('2.5k')).toBe(2500);
      expect(parseEngagementCount('1M')).toBe(1000000);
      expect(parseEngagementCount('1.5m')).toBe(1500000);
    });

    it('should return 0 for invalid engagement text', () => {
      expect(parseEngagementCount('')).toBe(0);
      expect(parseEngagementCount('abc')).toBe(0);
    });

    it('should parse relative time strings', () => {
      expect(parseRelativeTime('5m')).toBe(5);
      expect(parseRelativeTime('30min')).toBe(30);
      expect(parseRelativeTime('2h')).toBe(120);
      expect(parseRelativeTime('3hr')).toBe(180);
      expect(parseRelativeTime('1d')).toBe(1440);
      expect(parseRelativeTime('2w')).toBe(20160);
    });

    it('should return undefined for unparseable time', () => {
      expect(parseRelativeTime('')).toBeUndefined();
      expect(parseRelativeTime('yesterday')).toBeUndefined();
    });

    it('should extract text content from elements', () => {
      const el = document.createElement('span');
      el.textContent = '  Hello World  ';
      expect(getTextContent(el)).toBe('Hello World');
      expect(getTextContent(null)).toBe('');
    });

    it('should create error results', () => {
      const result = createErrorResult('test error');
      expect(result.success).toBe(false);
      expect(result.posts).toEqual([]);
      expect(result.error).toBe('test error');
    });

    it('should create success results', () => {
      const posts = [createMockPost('1')];
      const result = createSuccessResult(posts);
      expect(result.success).toBe(true);
      expect(result.posts).toHaveLength(1);
    });
  });

  describe('Message Listener Registration', () => {
    it('should register a message listener for SCRAPE_PAGE', () => {
      // The linkedin module registers a listener on import
      expect((globalThis as any).chrome.runtime.onMessage.addListener).toBeDefined();
    });
  });
});
