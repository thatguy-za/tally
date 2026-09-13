import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  plugins: [sveltekit()],
  server: { port: 5173 },
  define: {
    __APP_VERSION__: JSON.stringify(version)
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    globalSetup: ['./src/tests/global-setup.js'],
    // tests share one on-disk SQLite file (see src/lib/server/db.js) — keep
    // them from racing each other by running test files one at a time
    fileParallelism: false
  }
});
