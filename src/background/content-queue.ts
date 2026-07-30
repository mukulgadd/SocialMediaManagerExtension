import { storage } from '../shared/storage';
import type { QueueItem, Platform } from '../shared/types';

const ALARM_PREFIX = 'queue-';

/**
 * Get all queue items, sorted by scheduled time ascending.
 */
export async function getQueueItems(): Promise<QueueItem[]> {
  const items = await storage.get('contentQueue');
  return [...items].sort((a, b) => a.scheduledTime - b.scheduledTime);
}

/**
 * Add a new item to the content queue and schedule its alarm.
 */
export async function addQueueItem(
  content: string,
  platform: Platform,
  scheduledTime: number
): Promise<QueueItem> {
  const item: QueueItem = {
    id: crypto.randomUUID(),
    content,
    platform,
    scheduledTime,
    status: 'draft',
  };

  const items = await storage.get('contentQueue');
  items.push(item);
  await storage.set('contentQueue', items);

  // Schedule alarm if the time is in the future
  if (scheduledTime > Date.now()) {
    await chrome.alarms.create(`${ALARM_PREFIX}${item.id}`, {
      when: scheduledTime,
    });
  }

  return item;
}

/**
 * Update an existing queue item's content, platform, or scheduled time.
 */
export async function updateQueueItem(
  id: string,
  updates: Partial<Pick<QueueItem, 'content' | 'platform' | 'scheduledTime'>>
): Promise<QueueItem | null> {
  const items = await storage.get('contentQueue');
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return null;

  const updated = { ...items[index], ...updates };
  items[index] = updated;
  await storage.set('contentQueue', items);

  // Reschedule alarm if scheduledTime changed
  if (updates.scheduledTime !== undefined) {
    await chrome.alarms.clear(`${ALARM_PREFIX}${id}`);
    if (updates.scheduledTime > Date.now()) {
      await chrome.alarms.create(`${ALARM_PREFIX}${id}`, {
        when: updates.scheduledTime,
      });
    }
  }

  return updated;
}

/**
 * Remove a queue item and cancel its alarm.
 */
export async function removeQueueItem(id: string): Promise<boolean> {
  const items = await storage.get('contentQueue');
  const filtered = items.filter((item) => item.id !== id);
  if (filtered.length === items.length) return false;

  await storage.set('contentQueue', filtered);
  await chrome.alarms.clear(`${ALARM_PREFIX}${id}`);
  return true;
}

/**
 * Mark a queue item as posted.
 */
export async function markAsPosted(id: string): Promise<QueueItem | null> {
  const items = await storage.get('contentQueue');
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return null;

  items[index] = { ...items[index], status: 'posted' };
  await storage.set('contentQueue', items);
  await chrome.alarms.clear(`${ALARM_PREFIX}${id}`);
  return items[index];
}

/**
 * Handle a queue alarm firing — show a notification to remind the user to post.
 */
export async function handleQueueAlarm(alarmName: string): Promise<void> {
  if (!alarmName.startsWith(ALARM_PREFIX)) return;

  const id = alarmName.slice(ALARM_PREFIX.length);
  const items = await storage.get('contentQueue');
  const item = items.find((i) => i.id === id);

  if (!item || item.status === 'posted') return;

  const platformLabels: Record<Platform, string> = {
    'linkedin': 'LinkedIn',
    'x-twitter': 'X',
    'youtube': 'YouTube',
    'substack': 'Substack',
    'unsupported': '',
  };

  const contentPreview = item.content.length > 80
    ? item.content.slice(0, 80) + '…'
    : item.content;

  await chrome.notifications.create(`queue-notify-${id}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('assets/icons/icon-128.png'),
    title: `Time to post on ${platformLabels[item.platform] || item.platform}`,
    message: contentPreview,
    priority: 2,
  });
}

/**
 * Handle notification click — open the relevant platform page.
 */
export function handleQueueNotificationClick(notificationId: string): void {
  if (!notificationId.startsWith('queue-notify-')) return;

  const platformUrls: Record<Platform, string> = {
    'linkedin': 'https://www.linkedin.com/feed/',
    'x-twitter': 'https://x.com/compose/tweet',
    'youtube': 'https://studio.youtube.com/',
    'substack': 'https://substack.com/notes',
    'unsupported': '',
  };

  // Extract item ID and look up the platform
  const id = notificationId.slice('queue-notify-'.length);
  storage.get('contentQueue').then((items) => {
    const item = items.find((i) => i.id === id);
    const url = item ? platformUrls[item.platform] : '';
    if (url) {
      chrome.tabs.create({ url });
    }
  });

  chrome.notifications.clear(notificationId);
}

/**
 * Re-schedule alarms for all pending queue items (called on service worker startup).
 */
export async function restoreQueueAlarms(): Promise<void> {
  const items = await storage.get('contentQueue');
  const now = Date.now();

  for (const item of items) {
    if (item.status === 'draft' && item.scheduledTime > now) {
      await chrome.alarms.create(`${ALARM_PREFIX}${item.id}`, {
        when: item.scheduledTime,
      });
    }
  }
}
