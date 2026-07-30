import type { PostData, ScoredPost } from '../shared/types';

export interface FilterConfig {
  topicKeywords: string[];
  trackedAccounts: string[];
}

const WEIGHTS = {
  velocity: 0.35,
  topic: 0.25,
  recency: 0.25,
  influence: 0.15,
};

const TRACKED_BOOST = 25;

export function scorePosts(posts: PostData[], config: FilterConfig): ScoredPost[] {
  if (posts.length === 0) return [];

  // Calculate raw velocity scores for normalization
  const velocities = posts.map(p => calculateRawVelocity(p));
  const maxVelocity = Math.max(...velocities, 1);

  // Calculate raw influence scores for normalization
  const influences = posts.map(p => p.engagement.likes + p.engagement.reposts);
  const maxInfluence = Math.max(...influences, 1);

  const scored = posts.map((post, i) => {
    const velocityScore = velocities[i] / maxVelocity;
    const topicScore = calculateTopicScore(post.content, config.topicKeywords);
    const recencyScore = calculateRecencyScore(post.ageMinutes);
    const influenceScore = influences[i] / maxInfluence;

    // Check tracked accounts
    const isTracked = config.trackedAccounts.some(account =>
      post.author.name.toLowerCase().includes(account.toLowerCase()) ||
      (post.author.handle?.toLowerCase().includes(account.toLowerCase()) ?? false)
    );
    const trackedBoost = isTracked ? TRACKED_BOOST : 0;

    const rawScore = (
      WEIGHTS.velocity * velocityScore +
      WEIGHTS.topic * topicScore +
      WEIGHTS.recency * recencyScore +
      WEIGHTS.influence * influenceScore
    ) * 100 + trackedBoost;

    const relevanceScore = Math.min(100, Math.max(0, Math.round(rawScore)));

    return {
      ...post,
      relevanceScore,
      scoreCategory: categorize(relevanceScore),
      isTrending: false as boolean,
      isTrackedCreator: isTracked,
      threadingAdvice: getThreadingAdvice(post),
    } satisfies ScoredPost;
  });

  // Determine trending (velocity above 75th percentile)
  const sortedVelocities = [...velocities].sort((a, b) => a - b);
  const p75Index = Math.floor(sortedVelocities.length * 0.75);
  const p75Threshold = sortedVelocities[p75Index] || 0;

  for (let i = 0; i < scored.length; i++) {
    if (velocities[i] > p75Threshold && p75Threshold > 0) {
      scored[i].isTrending = true;
    }
  }

  // Sort by score descending
  return scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

function calculateRawVelocity(post: PostData): number {
  const ageMinutes = post.ageMinutes || 240;
  if (ageMinutes <= 0) return post.engagement.comments;

  let velocity = post.engagement.comments / ageMinutes;

  // Normalize by follower count if available
  if (post.author.followerCount && post.author.followerCount > 0) {
    const expectedComments = post.author.followerCount * 0.001;
    velocity = velocity / Math.max(expectedComments / ageMinutes, 0.01);
  }

  return velocity;
}

export function calculateTopicScore(content: string, keywords: string[]): number {
  if (keywords.length === 0) return 0.5;
  const lower = content.toLowerCase();
  const matches = keywords.filter(kw => lower.includes(kw.toLowerCase()));
  return matches.length / keywords.length;
}

export function calculateRecencyScore(ageMinutes?: number): number {
  if (ageMinutes === undefined) return 0.5;
  return Math.max(0, 1 - (ageMinutes / 240));
}

function categorize(score: number): 'high' | 'medium' | 'low' {
  if (score >= 67) return 'high';
  if (score >= 34) return 'medium';
  return 'low';
}

function getThreadingAdvice(post: PostData): ScoredPost['threadingAdvice'] | undefined {
  if (post.engagement.comments >= 20 && post.topComments && post.topComments.length > 0) {
    return {
      suggestReplyToComment: true,
      topComment: post.topComments[0],
      reason: `This post has ${post.engagement.comments} comments. Replying to the top comment gets more visibility than being comment #${post.engagement.comments + 1}.`,
    };
  }
  return undefined;
}
