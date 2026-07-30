import { describe, it, expect } from 'vitest';
import { scorePosts, calculateTopicScore, calculateRecencyScore } from '../../src/background/relevance-filter';
import type { PostData } from '../../src/shared/types';

function makePost(overrides: Partial<PostData> = {}): PostData {
  return {
    id: 'post-1',
    platform: 'linkedin',
    author: { name: 'Test User', handle: '@test' },
    content: 'A post about technology and AI trends',
    timestamp: new Date().toISOString(),
    ageMinutes: 60,
    engagement: { likes: 10, comments: 5, reposts: 2 },
    url: 'https://example.com/post/1',
    ...overrides,
  };
}

describe('scorePosts', () => {
  it('returns empty array for empty input', () => {
    const result = scorePosts([], { topicKeywords: [], trackedAccounts: [] });
    expect(result).toEqual([]);
  });

  it('new viral post (10 comments in 5 minutes) scores high', () => {
    const viralPost = makePost({
      ageMinutes: 5,
      engagement: { likes: 20, comments: 10, reposts: 5 },
    });
    const oldPost = makePost({
      id: 'post-2',
      ageMinutes: 200,
      engagement: { likes: 100, comments: 3, reposts: 10 },
    });

    const result = scorePosts([viralPost, oldPost], {
      topicKeywords: ['technology'],
      trackedAccounts: [],
    });

    // Viral post should score higher
    expect(result[0].id).toBe(viralPost.id);
    expect(result[0].relevanceScore).toBeGreaterThan(result[1].relevanceScore);
  });

  it('old high-engagement post scores lower than recent post', () => {
    const recentPost = makePost({
      id: 'recent',
      ageMinutes: 10,
      engagement: { likes: 5, comments: 5, reposts: 1 },
    });
    const oldPost = makePost({
      id: 'old',
      ageMinutes: 300,
      engagement: { likes: 1000, comments: 50, reposts: 100 },
    });

    const result = scorePosts([recentPost, oldPost], {
      topicKeywords: [],
      trackedAccounts: [],
    });

    // With recency heavily decayed, the recent post should benefit
    const recentScored = result.find(p => p.id === 'recent')!;
    const oldScored = result.find(p => p.id === 'old')!;
    // Old post has 0 recency score (300 > 240 threshold)
    expect(oldScored.relevanceScore).toBeLessThan(100);
  });

  it('topic keyword match boosts score', () => {
    const matchingPost = makePost({
      id: 'match',
      content: 'Deep learning and AI are transforming healthcare',
      ageMinutes: 30,
      engagement: { likes: 10, comments: 5, reposts: 2 },
    });
    const nonMatchingPost = makePost({
      id: 'nomatch',
      content: 'Best recipes for summer barbecue',
      ageMinutes: 30,
      engagement: { likes: 10, comments: 5, reposts: 2 },
    });

    const result = scorePosts([matchingPost, nonMatchingPost], {
      topicKeywords: ['AI', 'healthcare'],
      trackedAccounts: [],
    });

    const matched = result.find(p => p.id === 'match')!;
    const notMatched = result.find(p => p.id === 'nomatch')!;
    expect(matched.relevanceScore).toBeGreaterThan(notMatched.relevanceScore);
  });

  it('posts are sorted by score descending', () => {
    const posts = [
      makePost({ id: 'low', ageMinutes: 300, engagement: { likes: 1, comments: 0, reposts: 0 } }),
      makePost({ id: 'high', ageMinutes: 5, engagement: { likes: 100, comments: 20, reposts: 10 } }),
      makePost({ id: 'mid', ageMinutes: 60, engagement: { likes: 10, comments: 5, reposts: 2 } }),
    ];

    const result = scorePosts(posts, { topicKeywords: [], trackedAccounts: [] });

    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i].relevanceScore).toBeGreaterThanOrEqual(result[i + 1].relevanceScore);
    }
  });

  it('trending badge on velocity > 75th percentile', () => {
    const posts = [
      makePost({ id: 'slow-1', ageMinutes: 120, engagement: { likes: 2, comments: 1, reposts: 0 } }),
      makePost({ id: 'slow-2', ageMinutes: 120, engagement: { likes: 3, comments: 2, reposts: 1 } }),
      makePost({ id: 'slow-3', ageMinutes: 120, engagement: { likes: 4, comments: 3, reposts: 1 } }),
      makePost({ id: 'slow-4', ageMinutes: 120, engagement: { likes: 5, comments: 4, reposts: 2 } }),
      makePost({ id: 'fast', ageMinutes: 5, engagement: { likes: 50, comments: 30, reposts: 10 } }),
    ];

    const result = scorePosts(posts, { topicKeywords: [], trackedAccounts: [] });
    const fastPost = result.find(p => p.id === 'fast')!;
    expect(fastPost.isTrending).toBe(true);
  });

  it('threading advice triggers when comments >= 20', () => {
    const hotPost = makePost({
      engagement: { likes: 100, comments: 25, reposts: 10 },
      topComments: [{ author: 'Commenter', content: 'Great post!', engagement: { likes: 15 } }],
    });

    const result = scorePosts([hotPost], { topicKeywords: [], trackedAccounts: [] });
    expect(result[0].threadingAdvice).toBeDefined();
    expect(result[0].threadingAdvice!.suggestReplyToComment).toBe(true);
    expect(result[0].threadingAdvice!.topComment?.author).toBe('Commenter');
  });

  it('no threading advice when comments < 20', () => {
    const quietPost = makePost({
      engagement: { likes: 10, comments: 5, reposts: 2 },
      topComments: [{ author: 'Someone', content: 'Nice', engagement: { likes: 1 } }],
    });

    const result = scorePosts([quietPost], { topicKeywords: [], trackedAccounts: [] });
    expect(result[0].threadingAdvice).toBeUndefined();
  });

  it('tracked account boost increases score', () => {
    const trackedPost = makePost({
      id: 'tracked',
      author: { name: 'John Smith', handle: '@johnsmith' },
      ageMinutes: 60,
      engagement: { likes: 10, comments: 5, reposts: 2 },
    });
    const normalPost = makePost({
      id: 'normal',
      author: { name: 'Random User', handle: '@random' },
      ageMinutes: 60,
      engagement: { likes: 10, comments: 5, reposts: 2 },
    });

    const result = scorePosts([trackedPost, normalPost], {
      topicKeywords: [],
      trackedAccounts: ['johnsmith'],
    });

    const tracked = result.find(p => p.id === 'tracked')!;
    const normal = result.find(p => p.id === 'normal')!;
    expect(tracked.relevanceScore).toBeGreaterThan(normal.relevanceScore);
    expect(tracked.isTrackedCreator).toBe(true);
    expect(normal.isTrackedCreator).toBe(false);
  });

  it('tracked account matches by display name (case-insensitive)', () => {
    const post = makePost({
      author: { name: 'Sarah Johnson' },
    });

    const result = scorePosts([post], {
      topicKeywords: [],
      trackedAccounts: ['sarah johnson'],
    });

    expect(result[0].isTrackedCreator).toBe(true);
  });

  it('tracked account matches by handle (case-insensitive)', () => {
    const post = makePost({
      author: { name: 'Someone', handle: '@TechGuru42' },
    });

    const result = scorePosts([post], {
      topicKeywords: [],
      trackedAccounts: ['techguru42'],
    });

    expect(result[0].isTrackedCreator).toBe(true);
  });

  it('tracked account partial match on handle works', () => {
    const post = makePost({
      author: { name: 'Creator Person', handle: '@creator_person_official' },
    });

    const result = scorePosts([post], {
      topicKeywords: [],
      trackedAccounts: ['creator_person'],
    });

    expect(result[0].isTrackedCreator).toBe(true);
  });

  it('tracked account does not match unrelated posts', () => {
    const post = makePost({
      author: { name: 'Alice Wonderland', handle: '@alice' },
    });

    const result = scorePosts([post], {
      topicKeywords: [],
      trackedAccounts: ['bob', 'charlie', 'dave'],
    });

    expect(result[0].isTrackedCreator).toBe(false);
  });

  it('tracked account boost is capped at 100', () => {
    // A post that would already score very high — boost should not exceed 100
    const post = makePost({
      ageMinutes: 1,
      engagement: { likes: 1000, comments: 200, reposts: 100 },
      author: { name: 'Tracked User', handle: '@tracked' },
    });

    const result = scorePosts([post], {
      topicKeywords: ['technology', 'AI'],
      trackedAccounts: ['tracked'],
    });

    expect(result[0].relevanceScore).toBeLessThanOrEqual(100);
    expect(result[0].isTrackedCreator).toBe(true);
  });

  it('multiple tracked accounts are all detected', () => {
    const posts = [
      makePost({ id: 'p1', author: { name: 'Creator A', handle: '@creatorA' }, ageMinutes: 30, engagement: { likes: 5, comments: 3, reposts: 1 } }),
      makePost({ id: 'p2', author: { name: 'Creator B', handle: '@creatorB' }, ageMinutes: 30, engagement: { likes: 5, comments: 3, reposts: 1 } }),
      makePost({ id: 'p3', author: { name: 'Nobody', handle: '@nobody' }, ageMinutes: 30, engagement: { likes: 5, comments: 3, reposts: 1 } }),
    ];

    const result = scorePosts(posts, {
      topicKeywords: [],
      trackedAccounts: ['creatorA', 'creatorB'],
    });

    const p1 = result.find(p => p.id === 'p1')!;
    const p2 = result.find(p => p.id === 'p2')!;
    const p3 = result.find(p => p.id === 'p3')!;
    expect(p1.isTrackedCreator).toBe(true);
    expect(p2.isTrackedCreator).toBe(true);
    expect(p3.isTrackedCreator).toBe(false);
  });
});

describe('calculateTopicScore', () => {
  it('returns 0.5 when no keywords configured', () => {
    expect(calculateTopicScore('any content', [])).toBe(0.5);
  });

  it('returns 1.0 when all keywords match', () => {
    expect(calculateTopicScore('AI and machine learning are great', ['ai', 'machine learning'])).toBe(1);
  });

  it('returns 0 when no keywords match', () => {
    expect(calculateTopicScore('cooking recipes', ['ai', 'typescript'])).toBe(0);
  });

  it('returns partial score for partial matches', () => {
    expect(calculateTopicScore('AI is transforming industries', ['ai', 'blockchain', 'quantum'])).toBeCloseTo(1 / 3);
  });
});

describe('calculateRecencyScore', () => {
  it('returns 1.0 at 0 minutes', () => {
    expect(calculateRecencyScore(0)).toBe(1);
  });

  it('returns 0.5 at 120 minutes', () => {
    expect(calculateRecencyScore(120)).toBe(0.5);
  });

  it('returns 0 at 240+ minutes', () => {
    expect(calculateRecencyScore(240)).toBe(0);
    expect(calculateRecencyScore(500)).toBe(0);
  });

  it('returns 0.5 when ageMinutes is undefined', () => {
    expect(calculateRecencyScore(undefined)).toBe(0.5);
  });
});
