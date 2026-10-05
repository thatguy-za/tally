/**
 * A statement shared to Tally from another Android app arrives as a POST the
 * service worker intercepts (see src/service-worker.js). The file can't ride
 * along on a redirect, so it waits here — in its own Cache Storage bucket, not
 * the asset cache — until the page the user lands on picks it up. Used from
 * both the service worker and the page, so it sticks to APIs both have.
 *
 * This is the user's financial data sitting in browser storage, so it is kept
 * deliberately short-lived: replaced by the next share, cleared the moment it
 * is consumed, and ignored (then deleted) once it is older than SHARE_TTL_MS.
 */
export const SHARE_PATH = '/share-target';
export const SHARE_CACHE = 'tally-share';
export const SHARE_TTL_MS = 10 * 60 * 1000;

const keyFor = (i) => `/_share/${i}`;
const indexOf = (request) => Number(new URL(request.url).pathname.split('/').pop());

/** Replace whatever is stashed with `files`. */
export async function stashFiles(files, now = Date.now()) {
  await caches.delete(SHARE_CACHE);
  const cache = await caches.open(SHARE_CACHE);
  await Promise.all(
    files.map((file, i) =>
      cache.put(
        keyFor(i),
        new Response(file, {
          headers: {
            'content-type': file.type || 'text/csv',
            'x-file-name': encodeURIComponent(file.name),
            'x-file-size': String(file.size),
            'x-stashed-at': String(now)
          }
        })
      )
    )
  );
}

/** Live (unexpired) entries, oldest-index first; expired ones are deleted on the way past. */
async function liveEntries(cache, now) {
  const requests = (await cache.keys()).sort((a, b) => indexOf(a) - indexOf(b));
  const live = [];
  for (const request of requests) {
    const response = await cache.match(request);
    const at = Number(response?.headers.get('x-stashed-at'));
    if (!response || !Number.isFinite(at) || now - at > SHARE_TTL_MS) {
      await cache.delete(request);
      continue;
    }
    live.push(response);
  }
  return live;
}

/** Name and size of each stashed file, without reading the files themselves. */
export async function peekStash(now = Date.now()) {
  const cache = await caches.open(SHARE_CACHE);
  return (await liveEntries(cache, now)).map((r) => ({
    name: decodeURIComponent(r.headers.get('x-file-name') || 'statement.csv'),
    size: Number(r.headers.get('x-file-size')) || 0
  }));
}

/**
 * The stashed files, as File objects ready to hand to the import form. Their
 * contents are copied into memory, so the stash can be cleared straight away
 * without pulling the data out from under them.
 */
export async function readStash(now = Date.now()) {
  const cache = await caches.open(SHARE_CACHE);
  const entries = await liveEntries(cache, now);
  return Promise.all(
    entries.map(async (r) => {
      const name = decodeURIComponent(r.headers.get('x-file-name') || 'statement.csv');
      return new File([await r.arrayBuffer()], name, { type: r.headers.get('content-type') || 'text/csv' });
    })
  );
}

export async function clearStash() {
  await caches.delete(SHARE_CACHE);
}
