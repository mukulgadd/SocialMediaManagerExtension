import { describe, it, expect } from 'vitest';
import { buildReplyPrompt, buildDraftPrompt, buildSummaryPrompt } from '../../src/background/prompt-templates';
import type { PostData, VoiceProfile, ContentItem, Platform } from '../../src/shared/types';

const mockPost: PostData = {
  id: 'post-1',
  platform: 'linkedin',
  author: { name: 'Jane Doe', handle: '@janedoe', followerCount: 5000 },
  content: 'Excited to share my latest article on AI in healthcare!',
  timestamp: new Date().toISOString(),
  ageMinutes: 30,
  engagement: { likes: 50, comments: 10, reposts: 5 },
  url: 'https://linkedin.com/post/123',
};

const mockVoiceProfile: VoiceProfile = {
  brandIdentity: 'Senior developer specializing in distributed systems',
  toneStyle: 'Thoughtful and technical, but approachable',
};

const mockContentLibrary: ContentItem[] = [
  {
    id: 'item-1',
    title: 'Building Scalable Microservices',
    url: 'https://myblog.com/microservices',
    topicKeywords: ['microservices', 'architecture'],
  },
  {
    id: 'item-2',
    title: 'AI-Driven Testing',
    url: 'https://myblog.com/ai-testing',
    topicKeywords: ['ai', 'testing'],
  },
];

describe('buildReplyPrompt', () => {
  it('includes brand identity in system message', () => {
    const messages = buildReplyPrompt({
      post: mockPost,
      voiceProfile: mockVoiceProfile,
      topicKeywords: ['ai', 'distributed systems'],
      contentLibrary: [],
      platform: 'linkedin',
    });

    const system = messages.find(m => m.role === 'system');
    expect(system?.content).toContain('Senior developer specializing in distributed systems');
  });

  it('includes topic keywords in system message', () => {
    const messages = buildReplyPrompt({
      post: mockPost,
      voiceProfile: mockVoiceProfile,
      topicKeywords: ['ai', 'distributed systems'],
      contentLibrary: [],
      platform: 'linkedin',
    });

    const system = messages.find(m => m.role === 'system');
    expect(system?.content).toContain('ai, distributed systems');
  });

  it('includes tone style in system message', () => {
    const messages = buildReplyPrompt({
      post: mockPost,
      voiceProfile: mockVoiceProfile,
      topicKeywords: [],
      contentLibrary: [],
      platform: 'linkedin',
    });

    const system = messages.find(m => m.role === 'system');
    expect(system?.content).toContain('Thoughtful and technical, but approachable');
  });

  it('includes post content and author in user message', () => {
    const messages = buildReplyPrompt({
      post: mockPost,
      voiceProfile: mockVoiceProfile,
      topicKeywords: [],
      contentLibrary: [],
      platform: 'linkedin',
    });

    const user = messages.find(m => m.role === 'user');
    expect(user?.content).toContain('Jane Doe');
    expect(user?.content).toContain('@janedoe');
    expect(user?.content).toContain('Excited to share my latest article on AI in healthcare!');
  });

  it('adjusts prompt for threading mode when replyToComment is provided', () => {
    const messages = buildReplyPrompt({
      post: mockPost,
      voiceProfile: mockVoiceProfile,
      topicKeywords: [],
      contentLibrary: [],
      replyToComment: { author: 'Bob', content: 'Great insights!', engagement: { likes: 3 } },
      platform: 'linkedin',
    });

    const system = messages.find(m => m.role === 'system');
    const user = messages.find(m => m.role === 'user');
    expect(system?.content).toContain('replying to a comment');
    expect(user?.content).toContain('Replying to comment by Bob');
    expect(user?.content).toContain('Great insights!');
  });

  it('includes content library items in user message', () => {
    const messages = buildReplyPrompt({
      post: mockPost,
      voiceProfile: mockVoiceProfile,
      topicKeywords: [],
      contentLibrary: mockContentLibrary,
      platform: 'linkedin',
    });

    const user = messages.find(m => m.role === 'user');
    expect(user?.content).toContain('Building Scalable Microservices');
    expect(user?.content).toContain('https://myblog.com/microservices');
    expect(user?.content).toContain('microservices, architecture');
  });

  it('includes platform-specific rules', () => {
    const linkedinMessages = buildReplyPrompt({
      post: mockPost,
      voiceProfile: mockVoiceProfile,
      topicKeywords: [],
      contentLibrary: [],
      platform: 'linkedin',
    });

    const xMessages = buildReplyPrompt({
      post: { ...mockPost, platform: 'x-twitter' },
      voiceProfile: mockVoiceProfile,
      topicKeywords: [],
      contentLibrary: [],
      platform: 'x-twitter',
    });

    const linkedinSystem = linkedinMessages.find(m => m.role === 'system');
    const xSystem = xMessages.find(m => m.role === 'system');

    expect(linkedinSystem?.content).toContain('professional tone');
    expect(xSystem?.content).toContain('280 characters');
  });

  it('uses minimal prompt when voice profile is empty', () => {
    const emptyProfile: VoiceProfile = { brandIdentity: '', toneStyle: '' };

    const messages = buildReplyPrompt({
      post: mockPost,
      voiceProfile: emptyProfile,
      topicKeywords: [],
      contentLibrary: [],
      platform: 'linkedin',
    });

    const system = messages.find(m => m.role === 'system');
    // Should still have the base instructions
    expect(system?.content).toContain('social media engagement assistant');
    // Should not contain the "representing a content creator" preamble
    expect(system?.content).not.toContain('representing a content creator');
  });
});

describe('buildDraftPrompt', () => {
  it('returns system and user messages with correct structure', () => {
    const messages = buildDraftPrompt({
      topic: 'the future of serverless computing',
      voiceProfile: mockVoiceProfile,
      topicKeywords: ['serverless', 'cloud'],
      platform: 'linkedin',
    });

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
  });

  it('includes brand identity and tone in system message', () => {
    const messages = buildDraftPrompt({
      topic: 'testing',
      voiceProfile: mockVoiceProfile,
      topicKeywords: [],
      platform: 'linkedin',
    });

    const system = messages[0];
    expect(system.content).toContain('Senior developer specializing in distributed systems');
    expect(system.content).toContain('Thoughtful and technical, but approachable');
  });

  it('includes topic in user message', () => {
    const messages = buildDraftPrompt({
      topic: 'the future of serverless computing',
      voiceProfile: mockVoiceProfile,
      topicKeywords: [],
      platform: 'linkedin',
    });

    const user = messages[1];
    expect(user.content).toContain('the future of serverless computing');
  });

  it('includes platform-specific rules for X/Twitter', () => {
    const messages = buildDraftPrompt({
      topic: 'hot take on microservices',
      voiceProfile: mockVoiceProfile,
      topicKeywords: [],
      platform: 'x-twitter',
    });

    const system = messages[0];
    expect(system.content).toContain('280 characters');
  });
});

describe('buildSummaryPrompt', () => {
  it('returns system and user messages with correct structure', () => {
    const messages = buildSummaryPrompt({
      analyticsData: 'Impressions: 5000, Engagement rate: 3.2%',
      platform: 'linkedin',
    });

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
  });

  it('includes platform name in prompt', () => {
    const messages = buildSummaryPrompt({
      analyticsData: 'Followers: 1200',
      platform: 'x-twitter',
    });

    const system = messages[0];
    const user = messages[1];
    expect(system.content).toContain('x-twitter');
    expect(user.content).toContain('x-twitter');
  });

  it('includes analytics data in user message', () => {
    const analytics = 'Impressions: 5000\nEngagement rate: 3.2%\nNew followers: 45';
    const messages = buildSummaryPrompt({
      analyticsData: analytics,
      platform: 'linkedin',
    });

    const user = messages[1];
    expect(user.content).toContain(analytics);
  });
});
