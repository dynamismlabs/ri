import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'scripts/*.test.ts'],
    environment: 'node',
    setupFiles: ['src/test/setup-env.ts'],
    // A file's first test loads its module graph cold, the database layer and executor included,
    // which takes several seconds on the slowest CI runner (macos-15-intel) with every worker busy.
    // The 5 second default timed out tests there that assert nothing about time. A test that
    // depends on time moves the clock itself (vi.useFakeTimers) or sets its own limit.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
