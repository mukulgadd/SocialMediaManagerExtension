import type { PostData, CommentData, ScoredPost, Platform, LimiterState, LimiterConfig, ScrapeResult, QueueItem } from './types';

// Side Panel → Service Worker
export type RequestMessage =
  | { type: 'SCRAPE_FEED' }
  | { type: 'GENERATE_REPLY'; postData: PostData; replyToComment?: CommentData }
  | { type: 'GENERATE_DRAFT'; topic: string; platform: Platform }
  | { type: 'GENERATE_SUMMARY'; analyticsData: string }
  | { type: 'COPY_REPLY'; text: string }
  | { type: 'START_MONITOR'; tabId: number; postUrl: string }
  | { type: 'STOP_MONITOR'; postUrl: string }
  | { type: 'GET_STATE' }
  | { type: 'QUEUE_ADD'; content: string; platform: Platform; scheduledTime: number }
  | { type: 'QUEUE_UPDATE'; id: string; updates: Partial<Pick<QueueItem, 'content' | 'platform' | 'scheduledTime'>> }
  | { type: 'QUEUE_REMOVE'; id: string }
  | { type: 'QUEUE_MARK_POSTED'; id: string }
  | { type: 'QUEUE_GET_ALL' }
  | { type: 'CHAT_MESSAGE'; message: string };

// Service Worker → Side Panel
export type ResponseMessage =
  | { type: 'PLATFORM_CHANGED'; platform: Platform }
  | { type: 'SCRAPE_RESULT'; result: ScrapeResult }
  | { type: 'SCORED_POSTS'; posts: ScoredPost[] }
  | { type: 'AI_STREAM_CHUNK'; chunk: StreamChunk; requestId: string }
  | { type: 'AI_STREAM_ERROR'; error: string; requestId: string }
  | { type: 'AI_STREAM_DONE'; requestId: string }
  | { type: 'LIMITER_STATE'; state: LimiterState; config: LimiterConfig }
  | { type: 'MONITOR_UPDATE'; postUrl: string; commentCount: number }
  | { type: 'STATE_UPDATE'; platform: Platform; limiterState: LimiterState; limiterConfig: LimiterConfig }
  | { type: 'QUEUE_ITEMS'; items: QueueItem[] }
  | { type: 'QUEUE_ITEM'; item: QueueItem };

// Service Worker → Content Script
export type ContentScriptMessage =
  | { type: 'SCRAPE_PAGE' }
  | { type: 'SCRAPE_POST_COMMENTS'; postUrl: string }
  | { type: 'INIT_SELECTORS'; selectors: Record<string, string> }
  | { type: 'FIND_POST'; postId: string; url: string };

export interface StreamChunk {
  delta: string;
  done: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
