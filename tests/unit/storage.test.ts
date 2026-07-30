import { describe, it, expect, beforeEach, vi } from 'vitest';
import { storage, STORAGE_DEFAULTS } from '../../src/shared/storage';

// Mock chrome.storage.local with an in-memory Map
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

beforeEach(() => {
  mockStorage = createMockStorage();

  // @ts-expect-error - mocking chrome global
  globalThis.chrome = {
    storage: {
      local: mockStorage,
    },
  };
});

describe('StorageManager', () => {
  describe('get()', () => {
    it('returns stored value when key exists', async () => {
      mockStorage.store.set('topicKeywords', ['ai', 'ml']);

      const result = await storage.get('topicKeywords');
      expect(result).toEqual(['ai', 'ml']);
      expect(mockStorage.get).toHaveBeenCalledWith('topicKeywords');
    });

    it('returns default when key is not set', async () => {
      const result = await storage.get('contentLibrary');
      expect(result).toEqual(STORAGE_DEFAULTS.contentLibrary);
    });

    it('returns default on error', async () => {
      mockStorage.get.mockRejectedValueOnce(new Error('storage unavailable'));

      const result = await storage.get('onboardingComplete');
      expect(result).toBe(STORAGE_DEFAULTS.onboardingComplete);
    });

    it('logs error to console on failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockStorage.get.mockRejectedValueOnce(new Error('read error'));

      await storage.get('topicKeywords');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Storage read failed for key "topicKeywords":',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });

    it('returns default for complex objects when key not set', async () => {
      const result = await storage.get('voiceProfile');
      expect(result).toEqual({ brandIdentity: '', toneStyle: '' });
    });
  });

  describe('set()', () => {
    it('persists value to storage', async () => {
      await storage.set('topicKeywords', ['react', 'typescript']);

      expect(mockStorage.set).toHaveBeenCalledWith({ topicKeywords: ['react', 'typescript'] });
      expect(mockStorage.store.get('topicKeywords')).toEqual(['react', 'typescript']);
    });

    it('persists complex objects', async () => {
      const profile = { brandIdentity: 'Tech blogger', toneStyle: 'Professional' };
      await storage.set('voiceProfile', profile);

      expect(mockStorage.set).toHaveBeenCalledWith({ voiceProfile: profile });
      expect(mockStorage.store.get('voiceProfile')).toEqual(profile);
    });

    it('logs error on failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockStorage.set.mockRejectedValueOnce(new Error('quota exceeded'));

      await storage.set('topicKeywords', ['test']);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Storage write failed for key "topicKeywords":',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });
  });

  describe('remove()', () => {
    it('deletes key from storage', async () => {
      mockStorage.store.set('onboardingComplete', true);

      await storage.remove('onboardingComplete');

      expect(mockStorage.remove).toHaveBeenCalledWith('onboardingComplete');
      expect(mockStorage.store.has('onboardingComplete')).toBe(false);
    });

    it('logs error on failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockStorage.remove.mockRejectedValueOnce(new Error('remove error'));

      await storage.remove('topicKeywords');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Storage remove failed for key "topicKeywords":',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });
  });

  describe('clear()', () => {
    it('removes everything from storage', async () => {
      mockStorage.store.set('topicKeywords', ['a']);
      mockStorage.store.set('onboardingComplete', true);

      await storage.clear();

      expect(mockStorage.clear).toHaveBeenCalled();
      expect(mockStorage.store.size).toBe(0);
    });

    it('logs error on failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockStorage.clear.mockRejectedValueOnce(new Error('clear error'));

      await storage.clear();

      expect(consoleSpy).toHaveBeenCalledWith('Storage clear failed:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });
});
