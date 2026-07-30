import { useState, useEffect } from 'react';
import type { StorageSchema } from '../../shared/storage';

/**
 * Generic hook to read a value from chrome.storage.local and stay synced.
 */
export function useStorage<K extends keyof StorageSchema>(key: K, defaultValue: StorageSchema[K]) {
  const [value, setValue] = useState<StorageSchema[K]>(defaultValue);

  useEffect(() => {
    // Initial read
    chrome.storage.local.get(key).then((result) => {
      if (result[key] !== undefined) {
        setValue(result[key] as StorageSchema[K]);
      }
    }).catch(() => {
      // Storage not available
    });

    // Listen for changes
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === 'local' && changes[key]?.newValue !== undefined) {
        setValue(changes[key].newValue as StorageSchema[K]);
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [key]);

  return value;
}
