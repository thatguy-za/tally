import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { defaultExclude } from 'vitest/config';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  plugins: [sveltekit()],
  // bind both IPv4 and IPv6 loopback — left to Node's default, some setups
  // only end up listening on ::1 (IPv6), so a browser that resolves
  // "localhost" to 127.0.0.1 first can't connect even though the server is
  // actually running fine
  server: { port: 5173, host: true },
  define: {
    __APP_VERSION__: JSON.stringify(version)
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    // this one needs its own DATABASE_PATH set before the process starts
    // (see the test:migration script) to exercise db.js's upgrade-migration
    // path against a deliberately pre-migration database — running it
    // against the shared suite's db would corrupt that file
    exclude: [...defaultExclude, 'src/lib/server/db-migration.test.js'],
    globalSetup: ['./src/tests/global-setup.js'],
    // tests share one on-disk SQLite file (see src/lib/server/db.js) — keep
    // them from racing each other by running test files one at a time
    fileParallelism: false
  }
});
