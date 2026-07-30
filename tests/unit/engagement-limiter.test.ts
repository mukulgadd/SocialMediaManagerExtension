import { describe, it, expect, beforeEach, vi } from 'vitest';
import { canPerformAction, recordAction, getLimiterState } from '../../src/background/engagement-limiter';
import type { LimiterState, LimiterConfig } from '../../src/shared/types';

// Mock chrome.storage.local with in-memory store
function createMockStorage() {
  const store = new Map<string, unknown>();

  return {
    store,
    get: vi.fn(async (key: string) => {
      if (store.has(key)) {
        return { [key]: store.get(key) };
      }
      return {};
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(items)) {
        store.set(k, v);
      }
    }),
    remove: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(async () => {
      store.clear();
    }),
  };
}

let mockStorage: ReturnType<typeof createMockStorage>;

const today = new Date().toISOString().split('T')[0];

const defaultState: LimiterState = {
  lastActionTimestamp: 0,
  dailyActionCount: 0,
  dailyResetDate: today,
};

const defaultConfig: LimiterConfig = {
  cooldownSeconds: 30,
  dailyCap: 50,
};

beforeEach(() => {
  mockStorage = createMockStorage();

  // Set default state and config
  mockStorage.store.set('engagementLimiter', defaultState);
  mockStorage.store.set('engagementConfig', defaultConfig);

  // @ts-expect-error - mocking chrome global
  globalThis.chrome = {
    storage: {
      local: mockStorage,
    },
  };
});

describe('canPerformAction', () => {
  it('returns allowed when no recent action', async () => {
    const result = await canPerformAction();

    expect(result.allowed).toBe(true);
    expect(result.dailyRemaining).toBe(50);
  });

  it('returns not allowed with waitSeconds within cooldown', async () => {
    const recentTimestamp = Date.now() - 10_000; // 10 seconds ago
    mockStorage.store.set('engagementLimiter', {
      lastActionTimestamp: recentTimestamp,
      dailyActionCount: 5,
      dailyResetDate: today,
    });

    const result = await canPerformAction();

    expect(result.allowed).toBe(false);
    expect(result.waitSeconds).toBeGreaterThan(0);
    expect(result.waitSeconds).toBeLessThanOrEqual(20);
    expect(result.dailyRemaining).toBe(45);
  });

  it('returns not allowed when daily cap reached', async () => {
    mockStorage.store.set('engagementLimiter', {
      lastActionTimestamp: Date.now() - 60_000,
      dailyActionCount: 50,
      dailyResetDate: today,
    });

    const result = await canPerformAction();

    expect(result.allowed).toBe(false);
    expect(result.waitSeconds).toBeUndefined();
    expect(result.dailyRemaining).toBe(0);
  });

  it('resets daily count on new day', async () => {
    const yesterday = '2024-01-01';
    mockStorage.store.set('engagementLimiter', {
      lastActionTimestamp: Date.now() - 100_000,
      dailyActionCount: 50,
      dailyResetDate: yesterday,
    });

    const result = await canPerformAction();

    expect(result.allowed).toBe(true);
    expect(result.dailyRemaining).toBe(50);

    // Verify storage was updated
    expect(mockStorage.set).toHaveBeenCalledWith(
      expect.objectContaining({
        engagementLimiter: expect.objectContaining({
          dailyActionCount: 0,
          dailyResetDate: today,
        }),
      })
    );
  });
});

describe('recordAction', () => {
  it('increments count and updates timestamp', async () => {
    const beforeTime = Date.now();
    const result = await recordAction();

    expect(result.dailyActionCount).toBe(1);
    expect(result.lastActionTimestamp).toBeGreaterThanOrEqual(beforeTime);
    expect(result.dailyResetDate).toBe(today);
  });

  it('increments from existing count on same day', async () => {
    mockStorage.store.set('engagementLimiter', {
      lastActionTimestamp: Date.now() - 60_000,
      dailyActionCount: 10,
      dailyResetDate: today,
    });

    const result = await recordAction();
    expect(result.dailyActionCount).toBe(11);
  });

  it('resets count when recording on a new day', async () => {
    mockStorage.store.set('engagementLimiter', {
      lastActionTimestamp: Date.now() - 100_000,
      dailyActionCount: 30,
      dailyResetDate: '2024-01-01',
    });

    const result = await recordAction();
    expect(result.dailyActionCount).toBe(1);
    expect(result.dailyResetDate).toBe(today);
  });
});

describe('getLimiterState', () => {
  it('returns current state and config', async () => {
    const result = await getLimiterState();

    expect(result.state).toEqual(defaultState);
    expect(result.config).toEqual(defaultConfig);
  });
});
