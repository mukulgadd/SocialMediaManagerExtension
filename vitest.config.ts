import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    environmentMatchGlobs: [
      ['tests/integration/**/*.test.ts', 'jsdom'],
    ],
    setupFiles: ['tests/setup-chrome-mock.ts'],
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@background': path.resolve(__dirname, 'src/background'),
      '@content-scripts': path.resolve(__dirname, 'src/content-scripts'),
      '@sidepanel': path.resolve(__dirname, 'src/sidepanel'),
    },
  },
});
