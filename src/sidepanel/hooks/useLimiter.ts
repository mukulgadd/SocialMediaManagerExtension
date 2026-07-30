import { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import type { LimiterState, LimiterConfig } from '../../shared/types';

interface LimiterInfo {
  isAllowed: boolean;
  cooldownRemaining: number;
  dailyRemaining: number;
  dailyCap: number;
  isDailyLimitReached: boolean;
  recordCopy: (text: string) => Promise<void>;
}

/**
 * Tracks limiter state and provides countdown timer for cooldown.
 */
export function useLimiter(): LimiterInfo {
  const { limiterState, limiterConfig, setLimiterState } = useAppContext();
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  const computeCooldown = useCallback(
    (state: LimiterState, config: LimiterConfig) => {
      const elapsed = (Date.now() - state.lastActionTimestamp) / 1000;
      if (elapsed < config.cooldownSeconds) {
        return Math.ceil(config.cooldownSeconds - elapsed);
      }
      return 0;
    },
    []
  );

  // Update countdown timer every second
  useEffect(() => {
    setCooldownRemaining(computeCooldown(limiterState, limiterConfig));

    const interval = setInterval(() => {
      const remaining = computeCooldown(limiterState, limiterConfig);
      setCooldownRemaining(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [limiterState, limiterConfig, computeCooldown]);

  const today = new Date().toISOString().split('T')[0];
  const dailyCount = limiterState.dailyResetDate === today ? limiterState.dailyActionCount : 0;
  const dailyRemaining = limiterConfig.dailyCap - dailyCount;
  const isDailyLimitReached = dailyRemaining <= 0;
  const isAllowed = !isDailyLimitReached && cooldownRemaining <= 0;

  const recordCopy = useCallback(
    async (text: string) => {
      try {
        const response = await chrome.runtime.sendMessage({ type: 'COPY_REPLY', text });
        if (response?.type === 'LIMITER_STATE') {
          setLimiterState(response.state);
        }
      } catch {
        // Service worker not available
      }
    },
    [setLimiterState]
  );

  return {
    isAllowed,
    cooldownRemaining,
    dailyRemaining: Math.max(0, dailyRemaining),
    dailyCap: limiterConfig.dailyCap,
    isDailyLimitReached,
    recordCopy,
  };
}
