import type { Platform } from '../shared/types';

const PLATFORM_PATTERNS: Record<Exclude<Platform, 'unsupported'>, RegExp[]> = {
  'linkedin': [/^https:\/\/(www\.)?linkedin\.com/],
  'x-twitter': [/^https:\/\/(www\.)?(x|twitter)\.com/],
  'youtube': [/^https:\/\/(www\.)?youtube\.com/],
  'substack': [/^https:\/\/[^/]*\.substack\.com/, /^https:\/\/(www\.)?substack\.com/],
};

let currentPlatform: Platform = 'unsupported';
let currentTabId: number | null = null;

export function detectPlatform(url: string): Platform {
  for (const [platform, patterns] of Object.entries(PLATFORM_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(url)) {
        return platform as Platform;
      }
    }
  }
  return 'unsupported';
}

export function getCurrentPlatform(): Platform {
  return currentPlatform;
}

export function getCurrentTabId(): number | null {
  return currentTabId;
}

function notifyPlatformChange(platform: Platform): void {
  chrome.runtime.sendMessage({ type: 'PLATFORM_CHANGED', platform }).catch(() => {
    // Side panel might not be open yet — ignore
  });
}

function handleUrlChange(tabId: number, url: string): void {
  const detected = detectPlatform(url);
  if (detected !== currentPlatform || tabId !== currentTabId) {
    currentPlatform = detected;
    currentTabId = tabId;
    notifyPlatformChange(detected);
  }
}

export function initPlatformDetector(): void {
  // Listen for URL changes in tabs
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, _tab) => {
    if (changeInfo.url) {
      handleUrlChange(tabId, changeInfo.url);
    }
  });

  // Listen for tab switches
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      if (tab.url) {
        handleUrlChange(activeInfo.tabId, tab.url);
      }
    } catch {
      // Tab might not exist anymore
    }
  });
}
