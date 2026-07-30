import { useEffect } from 'react';
import { useAppContext } from './AppContext';
import type { LimiterState, LimiterConfig } from '../../shared/types';

/**
 * Listens to chrome.storage.onChanged and syncs relevant keys into AppContext.
 */
export function StorageSync() {
  const { setLimiterState, setLimiterConfig } = useAppContext();

  useEffect(() => {
    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'local') return;

      if (changes.engagementLimiter?.newValue) {
        setLimiterState(changes.engagementLimiter.newValue as LimiterState);
      }
      if (changes.engagementConfig?.newValue) {
        setLimiterConfig(changes.engagementConfig.newValue as LimiterConfig);
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [setLimiterState, setLimiterConfig]);

  return null;
}
