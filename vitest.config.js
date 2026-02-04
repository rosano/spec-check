import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(() => ({
  test: {
    hideSkippedTests: true,
    env: loadEnv(process.env.NODE_ENV, process.cwd(), ''),
  },
}));
