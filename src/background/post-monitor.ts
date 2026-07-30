// Post Monitor — First 60 Minutes Alerts
// Monitors up to 3 posts simultaneously for new comments and sends notifications.

import type { MonitoredPost } from '../shared/types';
import { storage } from '../shared/storage';
import { CONFIG } from '../shared/constants';

const ALARM_PREFIX = 'post-monitor-';

export async function startMonitoring(tabId: number, postUrl: string): Promise<boolean> {
  const monitored = await storage.get('monitoredPosts');

  if (monitored.length >= CONFIG.MAX_MONITORED_POSTS) {
    return false; // max 3 simultaneous monitors
  }

  // Check if already monitoring this URL
  if (monitored.some(p => p.postUrl === postUrl)) {
    return false;
  }

  const newMonitor: MonitoredPost = {
    tabId,
    postUrl,
    startTime: Date.now(),
    lastCommentCount: 0,
  };

  await storage.set('monitoredPosts', [...monitored, newMonitor]);

  // Create alarm for periodic checking
  const alarmName = `${ALARM_PREFIX}${tabId}`;
  chrome.alarms.create(alarmName, {
    periodInMinutes: CONFIG.MONITOR_INTERVAL_MINUTES,
  });

  return true;
}

export async function stopMonitoring(postUrl: string): Promise<void> {
  const monitored = await storage.get('monitoredPosts');
  const post = monitored.find(p => p.postUrl === postUrl);

  if (post) {
    // Clear the alarm
    const alarmName = `${ALARM_PREFIX}${post.tabId}`;
    chrome.alarms.clear(alarmName);

    // Remove from storage
    await storage.set('monitoredPosts', monitored.filter(p => p.postUrl !== postUrl));
  }
}

export async function stopMonitoringByTab(tabId: number): Promise<void> {
  const monitored = await storage.get('monitoredPosts');
  const post = monitored.find(p => p.tabId === tabId);

  if (post) {
    const alarmName = `${ALARM_PREFIX}${tabId}`;
    chrome.alarms.clear(alarmName);
    await storage.set('monitoredPosts', monitored.filter(p => p.tabId !== tabId));
  }
}

export async function handleMonitorAlarm(alarmName: string): Promise<void> {
  if (!alarmName.startsWith(ALARM_PREFIX)) return;

  const tabId = parseInt(alarmName.replace(ALARM_PREFIX, ''), 10);
  const monitored = await storage.get('monitoredPosts');
  const post = monitored.find(p => p.tabId === tabId);

  if (!post) {
    chrome.alarms.clear(alarmName);
    return;
  }

  // Check if monitoring duration has expired (60 minutes)
  const elapsed = (Date.now() - post.startTime) / 60000;
  if (elapsed >= CONFIG.MONITOR_DURATION_MINUTES) {
    await stopMonitoring(post.postUrl);
    return;
  }

  // Try to scrape comment count from the tab
  try {
    const result = await chrome.tabs.sendMessage(tabId, { type: 'SCRAPE_PAGE' });
    if (result && result.success && result.posts.length > 0) {
      const currentComments = result.posts[0].engagement.comments;

      if (currentComments > post.lastCommentCount && post.lastCommentCount > 0) {
        const newComments = currentComments - post.lastCommentCount;

        // Show notification
        chrome.notifications.create(`monitor-${tabId}`, {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('assets/icons/icon-128.png'),
          title: 'New comments on your post!',
          message: `Your post has ${newComments} new comment${newComments > 1 ? 's' : ''} — reply now for algo boost`,
        });
      }

      // Update last known count
      const updated = monitored.map(p =>
        p.tabId === tabId ? { ...p, lastCommentCount: currentComments } : p
      );
      await storage.set('monitoredPosts', updated);
    }
  } catch {
    // Tab might be closed — stop monitoring
    await stopMonitoringByTab(tabId);
  }
}

export async function getMonitoredPosts(): Promise<MonitoredPost[]> {
  return storage.get('monitoredPosts');
}

export function initPostMonitor(): void {
  // Handle alarm events
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name.startsWith(ALARM_PREFIX)) {
      handleMonitorAlarm(alarm.name);
    }
  });

  // Handle notification clicks — focus the monitored tab
  chrome.notifications.onClicked.addListener((notificationId) => {
    if (notificationId.startsWith('monitor-')) {
      const tabId = parseInt(notificationId.replace('monitor-', ''), 10);
      chrome.tabs.update(tabId, { active: true });
      chrome.notifications.clear(notificationId);
    }
  });

  // Handle tab removal — stop monitoring closed tabs
  chrome.tabs.onRemoved.addListener((tabId) => {
    stopMonitoringByTab(tabId);
  });
}
