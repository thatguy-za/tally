import { describe, it, expect, beforeEach } from 'vitest';
import { stashFiles, readStash, peekStash, clearStash, SHARE_TTL_MS } from './share-stash.js';

// just enough of Cache Storage to exercise the stash — keyed by URL path, as
// the real one is once a relative key has been resolved against the origin
function installFakeCaches() {
  const store = new Map();
  const pathOf = (r) => new URL(typeof r === 'string' ? r : r.url, 'http://localhost').pathname;
  globalThis.caches = {
    open: async (name) => {
      if (!store.has(name)) store.set(name, new Map());
      const entries = store.get(name);
      return {
        put: async (req, res) => void entries.set(pathOf(req), res),
        match: async (req) => entries.get(pathOf(req))?.clone(),
        keys: async () => [...entries.keys()].map((p) => new Request(`http://localhost${p}`)),
        delete: async (req) => entries.delete(pathOf(req))
      };
    },
    delete: async (name) => store.delete(name),
    store
  };
}

const csv = (name, body) => new File([body], name, { type: 'text/csv' });

describe('share stash', () => {
  beforeEach(installFakeCaches);

  it('hands back what was shared — name, type and contents, in order', async () => {
    await stashFiles([csv('june.csv', 'a,b\n1,2'), csv('july.csv', 'a,b\n3,4')]);
    const files = await readStash();
    expect(files.map((f) => f.name)).toEqual(['june.csv', 'july.csv']);
    expect(files[0].type).toBe('text/csv');
    expect(await files[1].text()).toBe('a,b\n3,4');
  });

  it('can list the files without reading them', async () => {
    await stashFiles([csv('statement.csv', 'x,y\n1,2')]);
    expect(await peekStash()).toEqual([{ name: 'statement.csv', size: 7 }]);
  });

  it('keeps a filename with spaces and accents intact', async () => {
    await stashFiles([csv('Relevé de compte (juin).csv', 'a\n1')]);
    expect((await readStash())[0].name).toBe('Relevé de compte (juin).csv');
  });

  it('is replaced, not added to, by the next share', async () => {
    await stashFiles([csv('old.csv', 'a'), csv('older.csv', 'b')]);
    await stashFiles([csv('new.csv', 'c')]);
    expect((await readStash()).map((f) => f.name)).toEqual(['new.csv']);
  });

  it('ignores — and deletes — a share nobody picked up in time', async () => {
    const shared = Date.now();
    await stashFiles([csv('stale.csv', 'a')], shared);
    const later = shared + SHARE_TTL_MS + 1;
    expect(await readStash(later)).toEqual([]);
    const cache = await caches.open('tally-share');
    expect(await cache.keys()).toHaveLength(0);
  });

  it('still hands over a share that is just inside the window', async () => {
    const shared = Date.now();
    await stashFiles([csv('fresh.csv', 'a')], shared);
    expect(await readStash(shared + SHARE_TTL_MS - 1)).toHaveLength(1);
  });

  it('is empty once cleared', async () => {
    await stashFiles([csv('gone.csv', 'a')]);
    await clearStash();
    expect(await readStash()).toEqual([]);
    expect(await peekStash()).toEqual([]);
  });
});
