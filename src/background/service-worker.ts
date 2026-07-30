// Service Worker — Message Router + Content Script Coordination
// Task 7: Full implementation

import { initPlatformDetector, getCurrentPlatform, getCurrentTabId, detectPlatform } from './platform-detector';
import { initSelectorConfigLoader, getSelectors } from './selector-config-loader';
import { initPostMonitor, startMonitoring, stopMonitoring } from './post-monitor';
import { scorePosts } from './relevance-filter';
import {
  getQueueItems, addQueueItem, updateQueueItem, removeQueueItem,
  markAsPosted, handleQueueAlarm, handleQueueNotificationClick, restoreQueueAlarms,
} from './content-queue';
import { forwardStreamToPort } from './ai-client';
import { buildReplyPrompt, buildDraftPrompt, buildSummaryPrompt } from './prompt-templates';
import { storage } from '../shared/storage';
import type { RequestMessage, ContentScriptMessage } from '../shared/messages';
import type { Platform, LimiterState } from '../shared/types';

// ─── State Recovery ──────────────────────────────────────────────────────────
// On service worker wake, recover platform state from storage
async function recoverState(): Promise<void> {
  // Attempt to detect current platform from the active tab
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      detectPlatform(tab.url);
    }
  } catch {
    // No active tab or permission issue — state will update on next tab event
  }
}

// ─── Initialization ──────────────────────────────────────────────────────────
async function initialize(): Promise<void> {
  console.log('Social Media Manager: Service Worker initializing...');

  // Initialize platform detector (registers tab update/activate listeners)
  initPlatformDetector();

  // Initialize selector config loader (fetches remote config, sets refresh alarm)
  await initSelectorConfigLoader();

  // Initialize post monitor (alarm + notification + tab-close listeners)
  initPostMonitor();

  // Restore content queue alarms for pending items
  await restoreQueueAlarms();

  // Recover state from storage on wake
  await recoverState();

  console.log('Social Media Manager: Service Worker initialized');
}

// ─── Send Selectors to Content Script ────────────────────────────────────────
async function sendSelectorsToTab(tabId: number, platform: Platform): Promise<void> {
  if (platform === 'unsupported') return;

  const selectors = getSelectors(platform);
  if (!selectors) return;

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'INIT_SELECTORS',
      selectors: selectors as unknown as Record<string, string>,
    } satisfies ContentScriptMessage);
  } catch {
    // Content script may not be ready yet — it will initialize with selectors on its own load
  }
}

// ─── Message Router ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener(
  (message: RequestMessage | { type: string; platform?: Platform }, _sender, sendResponse) => {
    // Internal platform-change messages from platform-detector
    if (message.type === 'PLATFORM_CHANGED') {
      const tabId = getCurrentTabId();
      if (tabId && (message as { platform: Platform }).platform !== 'unsupported') {
        sendSelectorsToTab(tabId, (message as { platform: Platform }).platform);
      }
      return false; // no async response needed
    }

    // Handle request messages from side panel
    handleRequest(message as RequestMessage)
      .then(sendResponse)
      .catch((error) => {
        console.error('Message handler error:', error);
        sendResponse({ error: error instanceof Error ? error.message : 'Unknown error' });
      });

    return true; // keep channel open for async response
  }
);

async function handleRequest(message: RequestMessage): Promise<unknown> {
  switch (message.type) {
    case 'SCRAPE_FEED':
      return handleScrapeFeed();

    case 'GENERATE_REPLY':
      return handleGenerateReply();

    case 'GENERATE_DRAFT':
      return handleGenerateDraft();

    case 'GENERATE_SUMMARY':
      return handleGenerateSummary();

    case 'COPY_REPLY':
      return handleCopyReply(message.text);

    case 'GET_STATE':
      return handleGetState();

    case 'START_MONITOR': {
      const success = await startMonitoring(message.tabId, message.postUrl);
      return { success };
    }

    case 'STOP_MONITOR': {
      await stopMonitoring(message.postUrl);
      return { success: true };
    }

    case 'QUEUE_ADD': {
      const item = await addQueueItem(message.content, message.platform, message.scheduledTime);
      return { type: 'QUEUE_ITEM', item };
    }

    case 'QUEUE_UPDATE': {
      const updated = await updateQueueItem(message.id, message.updates);
      return updated ? { type: 'QUEUE_ITEM', item: updated } : { error: 'Item not found' };
    }

    case 'QUEUE_REMOVE': {
      const removed = await removeQueueItem(message.id);
      return { success: removed };
    }

    case 'QUEUE_MARK_POSTED': {
      const posted = await markAsPosted(message.id);
      return posted ? { type: 'QUEUE_ITEM', item: posted } : { error: 'Item not found' };
    }

    case 'QUEUE_GET_ALL': {
      const items = await getQueueItems();
      return { type: 'QUEUE_ITEMS', items };
    }

    default:
      return { error: 'Unknown message type' };
  }
}

// ─── SCRAPE_FEED Handler ────────────────────────────────────────────────────
async function handleScrapeFeed(): Promise<unknown> {
  let tabId = getCurrentTabId();
  let platform = getCurrentPlatform();

  // Fresh detection from active tab
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id && tab.url) {
      tabId = tab.id;
      const detected = detectPlatform(tab.url);
      if (detected !== 'unsupported') {
        platform = detected;
      }
    }
  } catch {
    // Use stale state
  }

  if (!tabId) {
    return { type: 'SCRAPE_RESULT', result: { success: false, posts: [], error: 'No active tab' } };
  }

  // Even if platform is 'unsupported', try to scrape — the content script might be loaded
  // Send selectors if we know the platform
  if (platform !== 'unsupported') {
    await sendSelectorsToTab(tabId, platform);
  }

  try {
    const result = await chrome.tabs.sendMessage(tabId, { type: 'SCRAPE_PAGE' } satisfies ContentScriptMessage);
    if (result && result.success) {
      // Load filter config from storage
      const [topicKeywords, trackedAccounts] = await Promise.all([
        storage.get('topicKeywords'),
        storage.get('trackedAccounts'),
      ]);

      // Convert TrackedAccount[] to string[] of handles/names for the filter
      const trackedHandles = trackedAccounts.map(a => a.handle);

      const scoredPosts = scorePosts(result.posts, {
        topicKeywords,
        trackedAccounts: trackedHandles,
      });

      return { type: 'SCORED_POSTS', posts: scoredPosts };
    }
    return { type: 'SCRAPE_RESULT', result };
  } catch {
    return {
      type: 'SCRAPE_RESULT',
      result: { success: false, posts: [], error: 'Failed to communicate with content script. Try refreshing the page.' },
    };
  }
}

// ─── GENERATE_REPLY Handler ─────────────────────────────────────────────────
async function handleGenerateReply(): Promise<unknown> {
  // Reply generation is handled through the streaming port (ai-stream).
  // If called via sendMessage (non-streaming), return an instruction.
  return { type: 'AI_STREAM_ERROR', error: 'Use the streaming port for reply generation', requestId: 'non-stream' };
}

// ─── GENERATE_DRAFT Handler ─────────────────────────────────────────────────
async function handleGenerateDraft(): Promise<unknown> {
  // Draft generation is handled through the streaming port (ai-stream).
  return { type: 'AI_STREAM_ERROR', error: 'Use the streaming port for draft generation', requestId: 'non-stream' };
}

// ─── GENERATE_SUMMARY Handler ───────────────────────────────────────────────
async function handleGenerateSummary(): Promise<unknown> {
  // Summary generation is handled through the streaming port (ai-stream).
  return { type: 'AI_STREAM_ERROR', error: 'Use the streaming port for summary generation', requestId: 'non-stream' };
}

// ─── COPY_REPLY Handler (Placeholder — Task 11: Engagement Limiter) ─────────
async function handleCopyReply(_text: string): Promise<unknown> {
  // Task 11 will wire up actual engagement limiting logic.
  // For now, just return current limiter state from storage.
  const limiterState = await storage.get('engagementLimiter');
  const limiterConfig = await storage.get('engagementConfig');
  return { type: 'LIMITER_STATE', state: limiterState, config: limiterConfig };
}

// ─── GET_STATE Handler ──────────────────────────────────────────────────────
async function handleGetState(): Promise<unknown> {
  // Detect platform fresh from the active tab
  let platform = getCurrentPlatform();
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.url) {
      const detected = detectPlatform(tab.url);
      if (detected !== 'unsupported') {
        platform = detected;
      }
    }
  } catch {
    // Use whatever getCurrentPlatform returned
  }

  const limiterState: LimiterState = await storage.get('engagementLimiter');
  const limiterConfig = await storage.get('engagementConfig');
  return { type: 'STATE_UPDATE', platform, limiterState, limiterConfig };
}

// ─── Streaming Port (ai-stream) ─────────────────────────────────────────────
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'ai-stream') return;

  port.onMessage.addListener(async (message: RequestMessage) => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
      const [voiceProfile, topicKeywords, contentLibrary] = await Promise.all([
        storage.get('voiceProfile'),
        storage.get('topicKeywords'),
        storage.get('contentLibrary'),
      ]);
      const platform = getCurrentPlatform();

      let messages;

      switch (message.type) {
        case 'GENERATE_REPLY': {
          messages = buildReplyPrompt({
            post: message.postData,
            voiceProfile,
            topicKeywords,
            contentLibrary,
            replyToComment: message.replyToComment,
            platform: platform !== 'unsupported' ? platform : 'linkedin',
          });
          break;
        }

        case 'GENERATE_DRAFT': {
          messages = buildDraftPrompt({
            topic: message.topic,
            voiceProfile,
            topicKeywords,
            platform: message.platform !== 'unsupported' ? message.platform : 'linkedin',
          });
          break;
        }

        case 'GENERATE_SUMMARY': {
          messages = buildSummaryPrompt({
            analyticsData: message.analyticsData,
            platform: platform !== 'unsupported' ? platform : 'linkedin',
          });
          break;
        }

        case 'CHAT_MESSAGE': {
          // Freeform chat — inject voice context as system prompt
          let systemContent = 'You are a helpful social media assistant.\n';
          if (voiceProfile.brandIdentity) {
            systemContent += `The user's brand: ${voiceProfile.brandIdentity}\n`;
          }
          if (voiceProfile.toneStyle) {
            systemContent += `Their preferred tone: ${voiceProfile.toneStyle}\n`;
          }
          if (topicKeywords.length > 0) {
            systemContent += `Their niche topics: ${topicKeywords.join(', ')}\n`;
          }
          const currentPlatform = platform !== 'unsupported' ? platform : 'linkedin';
          systemContent += `Current platform: ${currentPlatform}. Keep responses concise and actionable.`;

          messages = [
            { role: 'system' as const, content: systemContent },
            { role: 'user' as const, content: message.message },
          ];
          break;
        }

        default:
          port.postMessage({ type: 'AI_STREAM_ERROR', error: 'Unknown stream request type', requestId });
          return;
      }

      await forwardStreamToPort(port, messages, requestId);
    } catch (error) {
      port.postMessage({
        type: 'AI_STREAM_ERROR',
        error: error instanceof Error ? error.message : 'Stream failed',
        requestId,
      });
    }
  });

  port.onDisconnect.addListener(() => {
    // Cleanup if needed when side panel disconnects
  });
});

// ─── Tab Cleanup ─────────────────────────────────────────────────────────────
chrome.tabs.onRemoved.addListener((_tabId) => {
  // Future: clean up per-tab state if needed
});

// ─── On Install: Open Onboarding ─────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const onboardingComplete = await storage.get('onboardingComplete');
    if (!onboardingComplete) {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/onboarding/index.html') });
    }
  }
});

// ─── Side Panel Behavior ─────────────────────────────────────────────────────
// Open side panel on action click
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// ─── Content Queue Alarm + Notification Handlers ─────────────────────────────
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith('queue-')) {
    handleQueueAlarm(alarm.name);
  }
});

chrome.notifications.onClicked.addListener((notificationId) => {
  handleQueueNotificationClick(notificationId);
});

// ─── Start ───────────────────────────────────────────────────────────────────
initialize();
