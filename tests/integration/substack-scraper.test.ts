/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { setSelectors, hasSelectors } from '../../src/content-scripts/shared/selector-reader';
import { PostBuffer } from '../../src/content-scripts/shared/post-buffer';
import {
  extractPostTitle,
  extractPostContent,
  extractAuthorName,
  scrapeComments,
  scrapePostPage,
  scrapeFeedPosts,
  scrapeNotes,
  scrapeDashboardMetrics,
  scrapeSubstackPosts,
} from '../../src/content-scripts/platforms/substack';
import type { PlatformSelectors } from '../../src/shared/types';

const substackSelectors: PlatformSelectors = {
  feedPost: '.post-preview, article.post, .frontend-pencraft-Box-module__reset--VfQY8',
  authorName: '.pencraft.pc-display-flex .profile-hover-card-target span, .post-header .byline a, .author-name',
  postText: '.body.markup, .post-content, .available-content, article .body',
  engagementLikes: '.like-button-container .label, .post-ufi-button .label, button[aria-label*="like"] .label',
  engagementComments: '.post-ufi-comment-button .label, a[href*="comments"] .label, button[aria-label*="comment"] .label',
  engagementReposts: '.post-ufi-button[aria-label*="restack"] .label, button[aria-label*="restack"] .label',
  timestamp: 'time, .pencraft.pc-reset .date, .post-date',
  commentContainer: '.comment-list-item, .comment, div[class*="comment-item"]',
  commentAuthor: '.comment-meta .commenter-name, .comment-author-name, .profile-hover-card-target span',
  commentText: '.comment-body .body, .comment-content',
  commentLikes: '.comment-like-button .label, .like-button .label',
};

function createMockSubstackPostPage(options: {
  title: string;
  author: string;
  content: string;
  timestamp?: string;
  likes?: string;
  commentsCount?: string;
  restacks?: string;
  comments?: Array<{ author: string; text: string; likes: string }>;
}): string {
  const commentsHtml = (options.comments || []).map((c) => `
    <div class="comment-list-item">
      <div class="comment-meta"><span class="commenter-name">${c.author}</span></div>
      <div class="comment-body"><div class="body">${c.text}</div></div>
      <div class="comment-like-button"><span class="label">${c.likes}</span></div>
    </div>
  `).join('');

  return `
    <article>
      <h1 class="post-title">${options.title}</h1>
      <div class="post-header">
        <div class="byline"><a>${options.author}</a></div>
      </div>
      <time>${options.timestamp || 'Jan 15, 2025'}</time>
      <div class="body markup">${options.content}</div>
      <div class="post-ufi">
        <div class="like-button-container"><span class="label">${options.likes || '0'}</span></div>
        <div class="post-ufi-comment-button"><span class="label">${options.commentsCount || '0'}</span></div>
        <div class="post-ufi-button" aria-label="restack"><span class="label">${options.restacks || '0'}</span></div>
      </div>
      <div class="comments-section">
        ${commentsHtml}
      </div>
    </article>
  `;
}

function createMockSubstackFeedPage(posts: Array<{
  title: string;
  author: string;
  description: string;
  likes?: string;
  comments?: string;
  timestamp?: string;
}>): string {
  const postsHtml = posts.map((p) => `
    <div class="post-preview">
      <h2>${p.title}</h2>
      <div class="post-header"><div class="byline"><a>${p.author}</a></div></div>
      <p class="post-preview-description">${p.description}</p>
      <time>${p.timestamp || '2 days ago'}</time>
      <div class="like-button-container"><span class="label">${p.likes || '0'}</span></div>
      <div class="post-ufi-comment-button"><span class="label">${p.comments || '0'}</span></div>
      <a href="/p/test-post-slug">Read more</a>
    </div>
  `).join('');

  return `<div class="feed">${postsHtml}</div>`;
}

function createMockSubstackNotesPage(notes: Array<{
  author: string;
  content: string;
  likes?: string;
}>): string {
  const notesHtml = notes.map((n) => `
    <div class="feed-note">
      <div class="note-header">
        <span class="profile-hover-card-target"><span>${n.author}</span></span>
      </div>
      <div class="note-content">${n.content}</div>
      <div class="note-like-button"><span class="label">${n.likes || '0'}</span></div>
    </div>
  `).join('');

  return `<div class="notes-feed">${notesHtml}</div>`;
}

function createMockSubstackDashboard(options: {
  subscriberCount?: string;
  metrics?: string[];
  recentPosts?: string[];
}): string {
  const metricsHtml = (options.metrics || []).map(m => `<div class="metric-value">${m}</div>`).join('');
  const postsHtml = (options.recentPosts || []).map(t => `<div class="post-list-item"><span class="post-title">${t}</span></div>`).join('');

  return `
    <div class="dashboard">
      <div class="pencraft pc-display-flex">
        <div class="pub-stats"><span>${options.subscriberCount || ''}</span></div>
      </div>
      ${metricsHtml}
      ${postsHtml}
    </div>
  `;
}

describe('Substack Scraper Integration', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    setSelectors(substackSelectors);
    // Default to a post page
    Object.defineProperty(window, 'location', {
      value: {
        href: 'https://example.substack.com/p/my-post',
        pathname: '/p/my-post',
        hostname: 'example.substack.com',
      },
      writable: true,
    });
  });

  describe('extractPostTitle', () => {
    it('should extract post title from h1.post-title', () => {
      document.body.innerHTML = '<h1 class="post-title">My Amazing Newsletter Post</h1>';

      const title = extractPostTitle(document);
      expect(title).toBe('My Amazing Newsletter Post');
    });

    it('should fall back to article h1', () => {
      document.body.innerHTML = '<article><h1>Fallback Title</h1></article>';

      const title = extractPostTitle(document);
      expect(title).toBe('Fallback Title');
    });

    it('should return empty string when no title found', () => {
      document.body.innerHTML = '<div>No title element</div>';

      const title = extractPostTitle(document);
      expect(title).toBe('');
    });
  });

  describe('extractPostContent', () => {
    it('should extract content from .body.markup', () => {
      document.body.innerHTML = `
        <div class="body markup">
          This is a long newsletter post about technology and its impact on society.
        </div>
      `;

      const content = extractPostContent(document);
      expect(content).toContain('newsletter post about technology');
    });

    it('should fall back to .post-content', () => {
      document.body.innerHTML = `
        <div class="post-content">
          Fallback content from post-content class element here.
        </div>
      `;

      const content = extractPostContent(document);
      expect(content).toContain('Fallback content from post-content');
    });

    it('should return empty string for short/missing content', () => {
      document.body.innerHTML = '<div>Short</div>';

      const content = extractPostContent(document);
      expect(content).toBe('');
    });
  });

  describe('extractAuthorName', () => {
    it('should extract author from .byline a', () => {
      document.body.innerHTML = `
        <div class="post-header">
          <div class="byline"><a>Jane Writer</a></div>
        </div>
      `;

      const author = extractAuthorName(document);
      expect(author).toBe('Jane Writer');
    });

    it('should extract author from .author-name', () => {
      document.body.innerHTML = '<span class="author-name">John Author</span>';

      const author = extractAuthorName(document);
      expect(author).toBe('John Author');
    });

    it('should return empty string when no author found', () => {
      document.body.innerHTML = '<div>No author here</div>';

      const author = extractAuthorName(document);
      expect(author).toBe('');
    });
  });

  describe('scrapeComments', () => {
    it('should extract comments with author, text, and likes', () => {
      document.body.innerHTML = `
        <div class="comments-section">
          <div class="comment-list-item">
            <div class="comment-meta"><span class="commenter-name">Alice</span></div>
            <div class="comment-body"><div class="body">Great insights!</div></div>
            <div class="comment-like-button"><span class="label">12</span></div>
          </div>
          <div class="comment-list-item">
            <div class="comment-meta"><span class="commenter-name">Bob</span></div>
            <div class="comment-body"><div class="body">I disagree with point 3</div></div>
            <div class="comment-like-button"><span class="label">5</span></div>
          </div>
        </div>
      `;

      const comments = scrapeComments(document);

      expect(comments).toHaveLength(2);
      // Sorted by likes descending
      expect(comments[0].author).toBe('Alice');
      expect(comments[0].content).toBe('Great insights!');
      expect(comments[0].engagement.likes).toBe(12);
      expect(comments[1].author).toBe('Bob');
      expect(comments[1].content).toBe('I disagree with point 3');
      expect(comments[1].engagement.likes).toBe(5);
    });

    it('should handle empty comments section', () => {
      document.body.innerHTML = '<div>No comments</div>';

      const comments = scrapeComments(document);
      expect(comments).toHaveLength(0);
    });

    it('should skip comments with no author and no text', () => {
      document.body.innerHTML = `
        <div class="comment-list-item">
          <div class="comment-meta"><span class="commenter-name"></span></div>
          <div class="comment-body"><div class="body"></div></div>
          <div class="comment-like-button"><span class="label">0</span></div>
        </div>
        <div class="comment-list-item">
          <div class="comment-meta"><span class="commenter-name">Valid User</span></div>
          <div class="comment-body"><div class="body">Valid comment</div></div>
          <div class="comment-like-button"><span class="label">3</span></div>
        </div>
      `;

      const comments = scrapeComments(document);
      expect(comments).toHaveLength(1);
      expect(comments[0].author).toBe('Valid User');
    });
  });

  describe('scrapePostPage', () => {
    it('should extract article as PostData plus individual comments', () => {
      document.body.innerHTML = createMockSubstackPostPage({
        title: 'The Future of AI',
        author: 'Sarah Tech',
        content: 'Artificial intelligence is transforming every industry in ways we never imagined.',
        likes: '145',
        commentsCount: '23',
        restacks: '12',
        timestamp: '3 days ago',
        comments: [
          { author: 'Reader1', text: 'Fascinating analysis', likes: '8' },
          { author: 'Reader2', text: 'Would love a follow-up', likes: '4' },
        ],
      });

      const posts = scrapePostPage(document);

      // 1 article post + 2 comment posts
      expect(posts).toHaveLength(3);

      const articlePost = posts[0];
      expect(articlePost.id).toMatch(/^substack-post-/);
      expect(articlePost.platform).toBe('substack');
      expect(articlePost.author.name).toBe('Sarah Tech');
      expect(articlePost.content).toContain('Artificial intelligence');
      expect(articlePost.engagement.likes).toBe(145);
      expect(articlePost.engagement.comments).toBe(23);
      expect(articlePost.engagement.reposts).toBe(12);
      expect(articlePost.topComments).toHaveLength(2);

      // Comment posts
      expect(posts[1].id).toMatch(/^substack-comment-/);
      expect(posts[1].author.name).toBe('Reader1');
      expect(posts[1].content).toBe('Fascinating analysis');
      expect(posts[2].author.name).toBe('Reader2');
    });

    it('should handle post page with no comments', () => {
      document.body.innerHTML = createMockSubstackPostPage({
        title: 'Solo Post',
        author: 'Writer',
        content: 'A post with no engagement yet, but still valuable content here.',
        likes: '0',
        commentsCount: '0',
      });

      const posts = scrapePostPage(document);
      expect(posts).toHaveLength(1);
      expect(posts[0].topComments).toHaveLength(0);
    });

    it('should return empty array when no title or content found', () => {
      document.body.innerHTML = '<div>Empty page</div>';

      const posts = scrapePostPage(document);
      expect(posts).toHaveLength(0);
    });
  });

  describe('scrapeFeedPosts', () => {
    it('should extract multiple post previews from homepage', () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://example.substack.com/',
          pathname: '/',
          hostname: 'example.substack.com',
        },
        writable: true,
      });

      document.body.innerHTML = createMockSubstackFeedPage([
        { title: 'First Post', author: 'Author A', description: 'Preview of first post', likes: '50', comments: '12' },
        { title: 'Second Post', author: 'Author B', description: 'Preview of second post', likes: '30', comments: '8' },
        { title: 'Third Post', author: 'Author C', description: 'Preview of third post', likes: '15', comments: '3' },
      ]);

      const posts = scrapeFeedPosts(document);

      expect(posts).toHaveLength(3);
      expect(posts[0].id).toMatch(/^substack-feed-/);
      expect(posts[0].platform).toBe('substack');
      expect(posts[0].content).toContain('First Post');
      expect(posts[0].content).toContain('Preview of first post');
      expect(posts[0].author.name).toBe('Author A');
      expect(posts[0].engagement.likes).toBe(50);
      expect(posts[0].engagement.comments).toBe(12);
    });

    it('should skip posts with no title and no content', () => {
      document.body.innerHTML = `
        <div class="post-preview">
          <div>Empty preview</div>
        </div>
        <div class="post-preview">
          <h2>Valid Post</h2>
          <p class="post-preview-description">This has content</p>
        </div>
      `;

      const posts = scrapeFeedPosts(document);
      expect(posts).toHaveLength(1);
      expect(posts[0].content).toContain('Valid Post');
    });

    it('should return empty array when no post previews found', () => {
      document.body.innerHTML = '<div>No posts here</div>';

      const posts = scrapeFeedPosts(document);
      expect(posts).toHaveLength(0);
    });
  });

  describe('scrapeNotes', () => {
    it('should extract Substack Notes with content and engagement', () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://substack.com/notes',
          pathname: '/notes',
          hostname: 'substack.com',
        },
        writable: true,
      });

      document.body.innerHTML = createMockSubstackNotesPage([
        { author: 'NoteWriter1', content: 'Quick thought on the market today', likes: '25' },
        { author: 'NoteWriter2', content: 'Just published a new deep dive', likes: '40' },
      ]);

      const posts = scrapeNotes(document);

      expect(posts).toHaveLength(2);
      expect(posts[0].id).toMatch(/^substack-note-/);
      expect(posts[0].platform).toBe('substack');
      expect(posts[0].author.name).toBe('NoteWriter1');
      expect(posts[0].content).toBe('Quick thought on the market today');
      expect(posts[0].engagement.likes).toBe(25);
      expect(posts[1].author.name).toBe('NoteWriter2');
      expect(posts[1].engagement.likes).toBe(40);
    });

    it('should skip notes with no author and no content', () => {
      document.body.innerHTML = `
        <div class="feed-note">
          <div class="note-header"><span class="profile-hover-card-target"><span></span></span></div>
          <div class="note-content"></div>
        </div>
        <div class="feed-note">
          <div class="note-header"><span class="profile-hover-card-target"><span>ValidUser</span></span></div>
          <div class="note-content">Valid note content</div>
          <div class="note-like-button"><span class="label">7</span></div>
        </div>
      `;

      const posts = scrapeNotes(document);
      expect(posts).toHaveLength(1);
      expect(posts[0].author.name).toBe('ValidUser');
    });

    it('should return empty array when no notes found', () => {
      document.body.innerHTML = '<div>No notes</div>';

      const posts = scrapeNotes(document);
      expect(posts).toHaveLength(0);
    });
  });

  describe('scrapeDashboardMetrics', () => {
    it('should extract subscriber count and metrics from dashboard', () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://example.substack.com/publish',
          pathname: '/publish',
          hostname: 'example.substack.com',
        },
        writable: true,
      });

      document.body.innerHTML = createMockSubstackDashboard({
        subscriberCount: '2,450',
        recentPosts: ['Latest Post Title', 'Previous Post Title'],
      });

      const posts = scrapeDashboardMetrics(document);

      expect(posts).toHaveLength(1);
      expect(posts[0].id).toMatch(/^substack-dashboard-/);
      expect(posts[0].platform).toBe('substack');
      expect(posts[0].author.name).toBe('Substack Dashboard');
      expect(posts[0].content).toContain('Subscribers: 2,450');
      expect(posts[0].content).toContain('Latest Post Title');
    });

    it('should return empty array when no metrics found', () => {
      document.body.innerHTML = '<div>Empty dashboard</div>';

      const posts = scrapeDashboardMetrics(document);
      expect(posts).toHaveLength(0);
    });
  });

  describe('scrapeSubstackPosts (main dispatcher)', () => {
    it('should route to scrapePostPage on /p/ paths', () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://example.substack.com/p/great-article',
          pathname: '/p/great-article',
          hostname: 'example.substack.com',
        },
        writable: true,
      });

      document.body.innerHTML = createMockSubstackPostPage({
        title: 'Great Article',
        author: 'Author Name',
        content: 'Article content that is longer than twenty characters for validation.',
        likes: '10',
        commentsCount: '2',
      });

      const posts = scrapeSubstackPosts(document);
      expect(posts.length).toBeGreaterThanOrEqual(1);
      expect(posts[0].id).toMatch(/^substack-post-/);
    });

    it('should route to scrapeDashboardMetrics on /publish paths', () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://example.substack.com/publish',
          pathname: '/publish',
          hostname: 'example.substack.com',
        },
        writable: true,
      });

      document.body.innerHTML = createMockSubstackDashboard({
        subscriberCount: '500',
      });

      const posts = scrapeSubstackPosts(document);
      expect(posts.length).toBeGreaterThanOrEqual(1);
      expect(posts[0].id).toMatch(/^substack-dashboard-/);
    });

    it('should route to scrapeNotes on /notes paths', () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://substack.com/notes',
          pathname: '/notes',
          hostname: 'substack.com',
        },
        writable: true,
      });

      document.body.innerHTML = createMockSubstackNotesPage([
        { author: 'Writer', content: 'A quick note about something', likes: '5' },
      ]);

      const posts = scrapeSubstackPosts(document);
      expect(posts.length).toBeGreaterThanOrEqual(1);
      expect(posts[0].id).toMatch(/^substack-note-/);
    });

    it('should route to scrapeFeedPosts on homepage', () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://example.substack.com/',
          pathname: '/',
          hostname: 'example.substack.com',
        },
        writable: true,
      });

      document.body.innerHTML = createMockSubstackFeedPage([
        { title: 'Homepage Post', author: 'Writer', description: 'Preview text for the homepage post' },
      ]);

      const posts = scrapeSubstackPosts(document);
      expect(posts.length).toBeGreaterThanOrEqual(1);
      expect(posts[0].id).toMatch(/^substack-feed-/);
    });
  });

  describe('PostBuffer integration', () => {
    it('should add Substack posts to buffer and deduplicate', () => {
      const buf = new PostBuffer(50);

      document.body.innerHTML = createMockSubstackPostPage({
        title: 'Dedup Test',
        author: 'Writer',
        content: 'Content for testing deduplication in the buffer system here.',
        comments: [{ author: 'Reader', text: 'Nice post', likes: '2' }],
      });

      const posts = scrapePostPage(document);
      buf.add(posts);

      expect(buf.size).toBe(posts.length);

      // Adding same posts again should not increase size (dedup by id)
      buf.add(posts);
      expect(buf.size).toBe(posts.length);
    });

    it('should respect max buffer size of 50', () => {
      const buf = new PostBuffer(50);

      // Create many feed posts
      const manyPosts = Array.from({ length: 60 }, (_, i) => ({
        title: `Post ${i}`,
        author: `Author ${i}`,
        description: `Description for post ${i} with enough content`,
      }));

      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://example.substack.com/',
          pathname: '/',
          hostname: 'example.substack.com',
        },
        writable: true,
      });

      document.body.innerHTML = createMockSubstackFeedPage(manyPosts);

      const posts = scrapeFeedPosts(document);
      buf.add(posts);

      expect(buf.size).toBeLessThanOrEqual(50);
    });
  });

  describe('Error handling', () => {
    it('should handle malformed DOM gracefully without throwing', () => {
      document.body.innerHTML = `
        <div>
          <span>Completely wrong structure for Substack</span>
        </div>
      `;

      expect(() => scrapePostPage(document)).not.toThrow();
      expect(() => scrapeFeedPosts(document)).not.toThrow();
      expect(() => scrapeComments(document)).not.toThrow();
    });

    it('should return empty arrays for malformed content', () => {
      document.body.innerHTML = '<div>Not a Substack page</div>';

      const postPageResult = scrapePostPage(document);
      const feedResult = scrapeFeedPosts(document);
      const commentsResult = scrapeComments(document);

      expect(postPageResult).toHaveLength(0);
      expect(feedResult).toHaveLength(0);
      expect(commentsResult).toHaveLength(0);
    });
  });

  describe('Self-initialization', () => {
    it('should have selectors available after import', () => {
      expect(hasSelectors()).toBe(true);
    });
  });
});
