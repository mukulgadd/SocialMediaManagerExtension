export type Platform = 'linkedin' | 'x-twitter' | 'youtube' | 'substack' | 'unsupported';

export interface PostData {
  id: string;
  platform: Platform;
  author: {
    name: string;
    handle?: string;
    followerCount?: number;
  };
  content: string;
  timestamp: string;
  ageMinutes?: number;
  engagement: {
    likes: number;
    comments: number;
    reposts: number;
    views?: number;
  };
  topComments?: CommentData[];
  url: string;
}

export interface CommentData {
  author: string;
  content: string;
  engagement: { likes: number };
}

export interface ScrapeResult {
  success: boolean;
  posts: PostData[];
  error?: string;
}

export interface ScoredPost extends PostData {
  relevanceScore: number;
  scoreCategory: 'high' | 'medium' | 'low';
  isTrending: boolean;
  isTrackedCreator: boolean;
  threadingAdvice?: {
    suggestReplyToComment: boolean;
    topComment?: CommentData;
    reason: string;
  };
}

export interface ContentItem {
  id: string;
  title: string;
  url: string;
  topicKeywords: string[];
  description?: string;
}

export interface VoiceProfile {
  brandIdentity: string;
  toneStyle: string;
}

export interface LimiterState {
  lastActionTimestamp: number;
  dailyActionCount: number;
  dailyResetDate: string;
}

export interface LimiterConfig {
  cooldownSeconds: number;
  dailyCap: number;
}

export interface PlatformSelectors {
  feedPost: string;
  authorName: string;
  postText: string;
  engagementLikes: string;
  engagementComments: string;
  engagementReposts?: string;
  engagementViews?: string;
  timestamp: string;
  commentContainer?: string;
  commentAuthor?: string;
  commentText?: string;
  commentLikes?: string;
  authorHandle?: string;
  authorFollowers?: string;
  // Substack-specific
  subscriberCount?: string;
  noteContent?: string;
  noteAuthor?: string;
  noteLikes?: string;
}

export interface SelectorConfig {
  version: string;
  lastUpdated: string;
  platforms: Record<string, PlatformSelectors>;
}

export interface TrackedAccount {
  id: string;
  displayName: string;
  handle: string;
  platform: Platform;
  notes?: string;
}

export interface MonitoredPost {
  tabId: number;
  postUrl: string;
  startTime: number;
  lastCommentCount: number;
}

export interface QueueItem {
  id: string;
  content: string;
  platform: Platform;
  scheduledTime: number;
  status: 'draft' | 'posted';
}
