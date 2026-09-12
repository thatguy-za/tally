// Runs once before the whole test run, in a separate process from the test
// files themselves — so this is the only safe place to delete the test
// database file before anything might have opened a connection to it.
import { rmSync } from 'node:fs';

export default function setup() {
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(`.vitest-tmp/test.sqlite${suffix}`, { force: true });
  }
}
