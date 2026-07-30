import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getQueueItems,
  addQueueItem,
  updateQueueItem,
  removeQueueItem,
  markAsPosted,
  handleQueueAlarm,
  restoreQueueAlarms,
} from '../../src/background/content-queue';
import type { QueueItem } from '../../src/shared/types';

// Mock chrome APIs
const mockStorage: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn((key: string) => {
        return Promise.resolve({ [key]: mockStorage[key] });
      }),
      set: vi.fn((obj: Record<string, unknown>) => {
        Object.assign(mockStorage, obj);
        return Promise.resolve();
      }),
    },
  },
  alarms: {
    create: vi.fn(() => Promise.resolve()),
    clear: vi.fn(() => Promise.resolve(true)),
  },
  notifications: {
    create: vi.fn(() => Promise.resolve('')),
    clear: vi.fn(() => Promise.resolve(true)),
  },
  runtime: {
    getURL: vi.fn((path: string) => `chrome-extension://abc/${path}`),
  },
  tabs: {
    create: vi.fn(() => Promise.resolve()),
  },
});

// Mock crypto.randomUUID
let uuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: () => `uuid-${++uuidCounter}`,
});

describe('Content Queue', () => {
  beforeEach(() => {
    // Reset storage
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    mockStorage.contentQueue = [];
    uuidCounter = 0;
    vi.clearAllMocks();
  });

  describe('getQueueItems', () => {
    it('returns empty array when no items exist', async () => {
      const items = await getQueueItems();
      expect(items).toEqual([]);
    });

    it('returns items sorted by scheduledTime ascending', async () => {
      const items: QueueItem[] = [
        { id: '3', content: 'Third', platform: 'linkedin', scheduledTime: 3000, status: 'draft' },
        { id: '1', content: 'First', platform: 'linkedin', scheduledTime: 1000, status: 'draft' },
        { id: '2', content: 'Second', platform: 'x-twitter', scheduledTime: 2000, status: 'draft' },
      ];
      mockStorage.contentQueue = items;

      const result = await getQueueItems();
      expect(result[0].id).toBe('1');
      expect(result[1].id).toBe('2');
      expect(result[2].id).toBe('3');
    });
  });

  describe('addQueueItem', () => {
    it('creates a new item with generated ID and draft status', async () => {
      const futureTime = Date.now() + 60000;
      const item = await addQueueItem('Post about AI', 'linkedin', futureTime);

      expect(item.id).toBe('uuid-1');
      expect(item.content).toBe('Post about AI');
      expect(item.platform).toBe('linkedin');
      expect(item.scheduledTime).toBe(futureTime);
      expect(item.status).toBe('draft');
    });

    it('persists item to storage', async () => {
      const futureTime = Date.now() + 60000;
      await addQueueItem('Test content', 'x-twitter', futureTime);

      const stored = mockStorage.contentQueue as QueueItem[];
      expect(stored).toHaveLength(1);
      expect(stored[0].content).toBe('Test content');
    });

    it('schedules an alarm for future items', async () => {
      const futureTime = Date.now() + 60000;
      await addQueueItem('Future post', 'linkedin', futureTime);

      expect(chrome.alarms.create).toHaveBeenCalledWith('queue-uuid-1', { when: futureTime });
    });

    it('does not schedule alarm for past items', async () => {
      const pastTime = Date.now() - 60000;
      await addQueueItem('Past post', 'linkedin', pastTime);

      expect(chrome.alarms.create).not.toHaveBeenCalled();
    });

    it('appends to existing items without overwriting', async () => {
      mockStorage.contentQueue = [
        { id: 'existing', content: 'Existing', platform: 'linkedin', scheduledTime: 1000, status: 'draft' },
      ];

      await addQueueItem('New post', 'x-twitter', Date.now() + 60000);

      const stored = mockStorage.contentQueue as QueueItem[];
      expect(stored).toHaveLength(2);
      expect(stored[0].id).toBe('existing');
      expect(stored[1].id).toBe('uuid-1');
    });
  });

  describe('updateQueueItem', () => {
    it('updates content and platform of an existing item', async () => {
      mockStorage.contentQueue = [
        { id: 'item-1', content: 'Original', platform: 'linkedin', scheduledTime: 5000, status: 'draft' },
      ];

      const updated = await updateQueueItem('item-1', { content: 'Updated', platform: 'x-twitter' });

      expect(updated).not.toBeNull();
      expect(updated!.content).toBe('Updated');
      expect(updated!.platform).toBe('x-twitter');
      expect(updated!.scheduledTime).toBe(5000); // unchanged
    });

    it('reschedules alarm when scheduledTime changes', async () => {
      const newTime = Date.now() + 120000;
      mockStorage.contentQueue = [
        { id: 'item-1', content: 'Test', platform: 'linkedin', scheduledTime: Date.now() + 60000, status: 'draft' },
      ];

      await updateQueueItem('item-1', { scheduledTime: newTime });

      expect(chrome.alarms.clear).toHaveBeenCalledWith('queue-item-1');
      expect(chrome.alarms.create).toHaveBeenCalledWith('queue-item-1', { when: newTime });
    });

    it('returns null for non-existent item', async () => {
      mockStorage.contentQueue = [];

      const result = await updateQueueItem('non-existent', { content: 'Test' });
      expect(result).toBeNull();
    });
  });

  describe('removeQueueItem', () => {
    it('removes item from storage and clears alarm', async () => {
      mockStorage.contentQueue = [
        { id: 'item-1', content: 'Test', platform: 'linkedin', scheduledTime: 5000, status: 'draft' },
        { id: 'item-2', content: 'Keep', platform: 'x-twitter', scheduledTime: 6000, status: 'draft' },
      ];

      const result = await removeQueueItem('item-1');

      expect(result).toBe(true);
      const stored = mockStorage.contentQueue as QueueItem[];
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe('item-2');
      expect(chrome.alarms.clear).toHaveBeenCalledWith('queue-item-1');
    });

    it('returns false for non-existent item', async () => {
      mockStorage.contentQueue = [];

      const result = await removeQueueItem('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('markAsPosted', () => {
    it('sets status to posted and clears alarm', async () => {
      mockStorage.contentQueue = [
        { id: 'item-1', content: 'Test', platform: 'linkedin', scheduledTime: 5000, status: 'draft' },
      ];

      const result = await markAsPosted('item-1');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('posted');
      expect(chrome.alarms.clear).toHaveBeenCalledWith('queue-item-1');

      const stored = mockStorage.contentQueue as QueueItem[];
      expect(stored[0].status).toBe('posted');
    });

    it('returns null for non-existent item', async () => {
      mockStorage.contentQueue = [];

      const result = await markAsPosted('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('handleQueueAlarm', () => {
    it('shows notification for a pending draft item', async () => {
      mockStorage.contentQueue = [
        { id: 'item-1', content: 'Time to post this content about AI and technology', platform: 'linkedin', scheduledTime: Date.now(), status: 'draft' },
      ];

      await handleQueueAlarm('queue-item-1');

      expect(chrome.notifications.create).toHaveBeenCalledWith(
        'queue-notify-item-1',
        expect.objectContaining({
          type: 'basic',
          title: 'Time to post on LinkedIn',
          message: expect.stringContaining('Time to post this content'),
        })
      );
    });

    it('does not show notification for already-posted item', async () => {
      mockStorage.contentQueue = [
        { id: 'item-1', content: 'Already posted', platform: 'linkedin', scheduledTime: 1000, status: 'posted' },
      ];

      await handleQueueAlarm('queue-item-1');

      expect(chrome.notifications.create).not.toHaveBeenCalled();
    });

    it('does not show notification for non-queue alarms', async () => {
      await handleQueueAlarm('selector-config-refresh');
      expect(chrome.notifications.create).not.toHaveBeenCalled();
    });

    it('does not show notification for non-existent item', async () => {
      mockStorage.contentQueue = [];

      await handleQueueAlarm('queue-missing-item');

      expect(chrome.notifications.create).not.toHaveBeenCalled();
    });

    it('truncates long content in notification message', async () => {
      const longContent = 'A'.repeat(200);
      mockStorage.contentQueue = [
        { id: 'item-1', content: longContent, platform: 'x-twitter', scheduledTime: Date.now(), status: 'draft' },
      ];

      await handleQueueAlarm('queue-item-1');

      expect(chrome.notifications.create).toHaveBeenCalledWith(
        'queue-notify-item-1',
        expect.objectContaining({
          message: expect.any(String),
        })
      );

      const callArgs = (chrome.notifications.create as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].message.length).toBeLessThanOrEqual(81); // 80 chars + ellipsis
    });
  });

  describe('restoreQueueAlarms', () => {
    it('reschedules alarms for all future draft items', async () => {
      const futureTime1 = Date.now() + 60000;
      const futureTime2 = Date.now() + 120000;
      mockStorage.contentQueue = [
        { id: 'item-1', content: 'Future 1', platform: 'linkedin', scheduledTime: futureTime1, status: 'draft' },
        { id: 'item-2', content: 'Future 2', platform: 'x-twitter', scheduledTime: futureTime2, status: 'draft' },
      ];

      await restoreQueueAlarms();

      expect(chrome.alarms.create).toHaveBeenCalledTimes(2);
      expect(chrome.alarms.create).toHaveBeenCalledWith('queue-item-1', { when: futureTime1 });
      expect(chrome.alarms.create).toHaveBeenCalledWith('queue-item-2', { when: futureTime2 });
    });

    it('does not schedule alarms for past items', async () => {
      mockStorage.contentQueue = [
        { id: 'item-1', content: 'Past', platform: 'linkedin', scheduledTime: Date.now() - 60000, status: 'draft' },
      ];

      await restoreQueueAlarms();

      expect(chrome.alarms.create).not.toHaveBeenCalled();
    });

    it('does not schedule alarms for posted items', async () => {
      mockStorage.contentQueue = [
        { id: 'item-1', content: 'Posted', platform: 'linkedin', scheduledTime: Date.now() + 60000, status: 'posted' },
      ];

      await restoreQueueAlarms();

      expect(chrome.alarms.create).not.toHaveBeenCalled();
    });
  });
});
