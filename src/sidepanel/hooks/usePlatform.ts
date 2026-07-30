import { useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import type { ResponseMessage } from '../../shared/messages';
import type { Platform } from '../../shared/types';

/**
 * Listens for PLATFORM_CHANGED messages from the service worker.
 * On mount, sends GET_STATE to get the current platform.
 */
export function usePlatform(): Platform {
  const { platform, setPlatform, setLimiterState, setLimiterConfig } = useAppContext();

  useEffect(() => {
    // Request current state on mount
    chrome.runtime.sendMessage({ type: 'GET_STATE' }).then((response: ResponseMessage | undefined) => {
      if (response && response.type === 'STATE_UPDATE') {
        setPlatform(response.platform);
        setLimiterState(response.limiterState);
        setLimiterConfig(response.limiterConfig);
      }
    }).catch(() => {
      // Service worker may not be ready yet
    });

    // Listen for platform changes
    const listener = (message: ResponseMessage) => {
      if (message.type === 'PLATFORM_CHANGED') {
        setPlatform(message.platform);
      } else if (message.type === 'STATE_UPDATE') {
        setPlatform(message.platform);
        setLimiterState(message.limiterState);
        setLimiterConfig(message.limiterConfig);
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [setPlatform, setLimiterState, setLimiterConfig]);

  return platform;
}
