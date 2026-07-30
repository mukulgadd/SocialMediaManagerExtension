import type { Platform, PlatformSelectors, SelectorConfig } from '../shared/types';
import { CONFIG } from '../shared/constants';
import { storage } from '../shared/storage';
import bundledSelectors from '../config/selectors.json';

const ALARM_NAME = 'selector-config-refresh';

let cachedConfig: SelectorConfig | null = null;

export async function initSelectorConfigLoader(): Promise<void> {
  // Try to load from cache first
  cachedConfig = await storage.get('selectorConfig');

  // Fetch fresh config
  await fetchAndCacheConfig();

  // Set up periodic refresh alarm (every 6 hours)
  chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: CONFIG.SELECTOR_REFRESH_HOURS * 60,
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
      fetchAndCacheConfig();
    }
  });
}

async function fetchAndCacheConfig(): Promise<void> {
  try {
    const response = await fetch(CONFIG.SELECTOR_CONFIG_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const config: SelectorConfig = await response.json();
    cachedConfig = config;
    await storage.set('selectorConfig', config);
    await storage.set('selectorConfigLastFetch', Date.now());
    console.log(`Selector config updated: v${config.version}`);
  } catch (error) {
    console.warn('Failed to fetch remote selector config, using fallback:', error);
    // If we have no cached config at all, use bundled
    if (!cachedConfig || !cachedConfig.version || cachedConfig.version === '0.0.0') {
      cachedConfig = bundledSelectors as SelectorConfig;
    }
  }
}

export function getSelectors(platform: Platform): PlatformSelectors | null {
  const config = cachedConfig || (bundledSelectors as SelectorConfig);
  return config.platforms[platform] || null;
}

export function getSelectorConfig(): SelectorConfig {
  return cachedConfig || (bundledSelectors as SelectorConfig);
}
