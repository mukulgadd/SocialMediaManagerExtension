/// Chrome API mock for tests that import content scripts
/// This setup file runs before each test file, ensuring `chrome` is globally available

if (typeof globalThis.chrome === 'undefined') {
  (globalThis as any).chrome = {
    runtime: {
      onMessage: {
        addListener: () => {},
        removeListener: () => {},
        hasListeners: () => false,
      },
      sendMessage: () => {},
      getURL: (path: string) => `chrome-extension://mock-id/${path}`,
    },
    storage: {
      local: {
        get: () => Promise.resolve({}),
        set: () => Promise.resolve(),
      },
      sync: {
        get: () => Promise.resolve({}),
        set: () => Promise.resolve(),
      },
    },
    tabs: {
      query: () => Promise.resolve([]),
      sendMessage: () => Promise.resolve(),
    },
  };
}
