import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// A separate config for db-migration.test.js only: it needs its own
// DATABASE_PATH, set before this process starts (see the test:migration
// script), pointed at a database it seeds with a deliberately pre-migration
// schema — running it under the main config would both get excluded (see
// vite.config.js) and, if it weren't, corrupt the shared suite's db file.
export default defineConfig({
  plugins: [sveltekit()],
  test: {
    environment: 'node',
    include: ['src/lib/server/db-migration.test.js']
  }
});
