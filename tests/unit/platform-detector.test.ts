import { describe, it, expect, beforeEach, vi } from 'vitest';
import { detectPlatform, getCurrentPlatform, getCurrentTabId, initPlatformDetector } from '../../src/background/platform-detector';

describe('detectPlatform', () => {
  describe('LinkedIn URLs', () => {
    it('detects linkedin.com with www prefix', () => {
      expect(detectPlatform('https://www.linkedin.com/feed')).toBe('linkedin');
    });

    it('detects linkedin.com without www prefix', () => {
      expect(detectPlatform('https://linkedin.com/in/someone')).toBe('linkedin');
    });

    it('detects linkedin.com with deep paths', () => {
      expect(detectPlatform('https://www.linkedin.com/posts/something')).toBe('linkedin');
    });
  });

  describe('X/Twitter URLs', () => {
    it('detects x.com', () => {
      expect(detectPlatform('https://x.com/home')).toBe('x-twitter');
    });

    it('detects x.com with www prefix', () => {
      expect(detectPlatform('https://www.x.com/user/status/123')).toBe('x-twitter');
    });

    it('detects twitter.com', () => {
      expect(detectPlatform('https://twitter.com/someone')).toBe('x-twitter');
    });

    it('detects twitter.com with www prefix', () => {
      expect(detectPlatform('https://www.twitter.com/home')).toBe('x-twitter');
    });
  });

  describe('YouTube URLs', () => {
    it('detects youtube.com with www prefix', () => {
      expect(detectPlatform('https://www.youtube.com/watch?v=123')).toBe('youtube');
    });

    it('detects youtube.com without www prefix', () => {
      expect(detectPlatform('https://youtube.com/studio')).toBe('youtube');
    });
  });

  describe('Substack URLs', () => {
    it('detects subdomain.substack.com', () => {
      expect(detectPlatform('https://newsletter.substack.com/p/post-title')).toBe('substack');
    });

    it('detects any substack subdomain', () => {
      expect(detectPlatform('https://someone.substack.com')).toBe('substack');
    });
  });

  describe('Unsupported URLs', () => {
    it('returns unsupported for google.com', () => {
      expect(detectPlatform('https://www.google.com')).toBe('unsupported');
    });

    it('returns unsupported for facebook.com', () => {
      expect(detectPlatform('https://facebook.com')).toBe('unsupported');
    });

    it('returns unsupported for localhost', () => {
      expect(detectPlatform('http://localhost:3000')).toBe('unsupported');
    });

    it('returns unsupported for empty string', () => {
      expect(detectPlatform('')).toBe('unsupported');
    });
  });

  describe('Edge cases', () => {
    it('handles URLs with query params', () => {
      expect(detectPlatform('https://www.linkedin.com/feed?filter=recent&page=2')).toBe('linkedin');
    });

    it('handles URLs with fragments', () => {
      expect(detectPlatform('https://x.com/user/status/123#section')).toBe('x-twitter');
    });

    it('handles URLs with complex paths', () => {
      expect(detectPlatform('https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf')).toBe('youtube');
    });

    it('does not match http:// for linkedin (only https)', () => {
      expect(detectPlatform('http://www.linkedin.com/feed')).toBe('unsupported');
    });

    it('does not match partial domain names', () => {
      expect(detectPlatform('https://notlinkedin.com')).toBe('unsupported');
    });
  });
});

describe('initPlatformDetector', () => {
  let onUpdatedListener: (tabId: number, changeInfo: { url?: string }, tab: unknown) => void;
  let onActivatedListener: (activeInfo: { tabId: number }) => Promise<void>;
  let sendMessageMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendMessageMock = vi.fn().mockResolvedValue(undefined);

    // @ts-expect-error - mocking chrome global
    globalThis.chrome = {
      tabs: {
        onUpdated: {
          addListener: vi.fn((cb) => { onUpdatedListener = cb; }),
        },
        onActivated: {
          addListener: vi.fn((cb) => { onActivatedListener = cb; }),
        },
        get: vi.fn().mockResolvedValue({ url: 'https://www.linkedin.com/feed' }),
      },
      runtime: {
        sendMessage: sendMessageMock,
      },
    };

    initPlatformDetector();
  });

  it('registers onUpdated listener', () => {
    expect(chrome.tabs.onUpdated.addListener).toHaveBeenCalled();
  });

  it('registers onActivated listener', () => {
    expect(chrome.tabs.onActivated.addListener).toHaveBeenCalled();
  });

  it('sends PLATFORM_CHANGED message on URL change', () => {
    onUpdatedListener(1, { url: 'https://x.com/home' }, {});

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: 'PLATFORM_CHANGED',
      platform: 'x-twitter',
    });
  });

  it('does not trigger when changeInfo has no url', () => {
    onUpdatedListener(1, {}, {});

    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('sends PLATFORM_CHANGED on tab activation', async () => {
    await onActivatedListener({ tabId: 2 });

    expect(chrome.tabs.get).toHaveBeenCalledWith(2);
    expect(sendMessageMock).toHaveBeenCalledWith({
      type: 'PLATFORM_CHANGED',
      platform: 'linkedin',
    });
  });

  it('does not send duplicate messages for same platform and tab', () => {
    onUpdatedListener(1, { url: 'https://x.com/home' }, {});
    sendMessageMock.mockClear();

    // Same tab, same platform
    onUpdatedListener(1, { url: 'https://x.com/other' }, {});

    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('sends message when platform stays same but tab changes', () => {
    onUpdatedListener(1, { url: 'https://x.com/home' }, {});
    sendMessageMock.mockClear();

    onUpdatedListener(2, { url: 'https://x.com/other' }, {});

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: 'PLATFORM_CHANGED',
      platform: 'x-twitter',
    });
  });
});
