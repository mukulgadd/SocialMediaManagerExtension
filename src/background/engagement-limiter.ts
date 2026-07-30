import type { LimiterState, LimiterConfig } from '../shared/types';
import { storage } from '../shared/storage';

export interface ActionResult {
  allowed: boolean;
  waitSeconds?: number;
  dailyRemaining?: number;
}

export async function canPerformAction(): Promise<ActionResult> {
  const state = await storage.get('engagementLimiter');
  const config = await storage.get('engagementConfig');

  // Check if we need to reset (new day)
  const today = new Date().toISOString().split('T')[0];
  if (state.dailyResetDate !== today) {
    // Reset for new day
    const newState: LimiterState = {
      lastActionTimestamp: state.lastActionTimestamp,
      dailyActionCount: 0,
      dailyResetDate: today,
    };
    await storage.set('engagementLimiter', newState);
    return { allowed: true, dailyRemaining: config.dailyCap };
  }

  // Check daily cap
  if (state.dailyActionCount >= config.dailyCap) {
    return { allowed: false, waitSeconds: undefined, dailyRemaining: 0 };
  }

  // Check cooldown
  const elapsed = (Date.now() - state.lastActionTimestamp) / 1000;
  if (elapsed < config.cooldownSeconds) {
    const waitSeconds = Math.ceil(config.cooldownSeconds - elapsed);
    return { allowed: false, waitSeconds, dailyRemaining: config.dailyCap - state.dailyActionCount };
  }

  return { allowed: true, dailyRemaining: config.dailyCap - state.dailyActionCount };
}

export async function recordAction(): Promise<LimiterState> {
  const state = await storage.get('engagementLimiter');
  const today = new Date().toISOString().split('T')[0];

  const newState: LimiterState = {
    lastActionTimestamp: Date.now(),
    dailyActionCount: (state.dailyResetDate === today ? state.dailyActionCount : 0) + 1,
    dailyResetDate: today,
  };

  await storage.set('engagementLimiter', newState);
  return newState;
}

export async function getLimiterState(): Promise<{ state: LimiterState; config: LimiterConfig }> {
  const state = await storage.get('engagementLimiter');
  const config = await storage.get('engagementConfig');
  return { state, config };
}
