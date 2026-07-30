import type {
  VoiceProfile,
  ContentItem,
  LimiterState,
  LimiterConfig,
  SelectorConfig,
  MonitoredPost,
  TrackedAccount,
  QueueItem,
} from './types';
import { CONFIG } from './constants';

// Storage keys and their types
export interface StorageSchema {
  voiceProfile: VoiceProfile;
  contentLibrary: ContentItem[];
  topicKeywords: string[];
  engagementLimiter: LimiterState;
  engagementConfig: LimiterConfig;
  onboardingComplete: boolean;
  selectorConfig: SelectorConfig;
  selectorConfigLastFetch: number;
  // Phase 1b
  monitoredPosts: MonitoredPost[];
  // Phase 2
  trackedAccounts: TrackedAccount[];
  contentQueue: QueueItem[];
}

// Default values returned on read failure or first access
const DEFAULTS: StorageSchema = {
  voiceProfile: { brandIdentity: '', toneStyle: '' },
  contentLibrary: [],
  topicKeywords: [],
  engagementLimiter: {
    lastActionTimestamp: 0,
    dailyActionCount: 0,
    dailyResetDate: new Date().toISOString().split('T')[0],
  },
  engagementConfig: {
    cooldownSeconds: CONFIG.DEFAULT_COOLDOWN_SECONDS,
    dailyCap: CONFIG.DEFAULT_DAILY_CAP,
  },
  onboardingComplete: false,
  selectorConfig: { version: '0.0.0', lastUpdated: '', platforms: {} },
  selectorConfigLastFetch: 0,
  monitoredPosts: [],
  trackedAccounts: [],
  contentQueue: [],
};

class StorageManager {
  async get<K extends keyof StorageSchema>(key: K): Promise<StorageSchema[K]> {
    try {
      const result = await chrome.storage.local.get(key);
      if (result[key] !== undefined) {
        return result[key] as StorageSchema[K];
      }
      return DEFAULTS[key];
    } catch (error) {
      console.error(`Storage read failed for key "${key}":`, error);
      return DEFAULTS[key];
    }
  }

  async set<K extends keyof StorageSchema>(key: K, value: StorageSchema[K]): Promise<void> {
    try {
      await chrome.storage.local.set({ [key]: value });
    } catch (error) {
      console.error(`Storage write failed for key "${key}":`, error);
    }
  }

  async remove<K extends keyof StorageSchema>(key: K): Promise<void> {
    try {
      await chrome.storage.local.remove(key);
    } catch (error) {
      console.error(`Storage remove failed for key "${key}":`, error);
    }
  }

  async clear(): Promise<void> {
    try {
      await chrome.storage.local.clear();
    } catch (error) {
      console.error('Storage clear failed:', error);
    }
  }
}

export const storage = new StorageManager();
export { DEFAULTS as STORAGE_DEFAULTS };
