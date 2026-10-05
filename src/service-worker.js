/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';
import { SHARE_PATH, SHARE_CACHE, stashFiles } from './lib/share-stash.js';

/**
 * This is a multi-user, self-hosted app — several people can share one
 * browser/device. That rules out the usual "cache pages, serve stale on
 * offline" PWA pattern: a cached copy of /insights could belong to whoever
 * was last online, and serving it to someone else who then opens the app
 * offline would show them another person's data. So this cache is
 * deliberately narrow: only the build's own static assets (JS/CSS/icons/
 * fonts-of-our-own, never a server-rendered page or an API response) are
 * ever stored. Pages and data always go to the network; offline gets a
 * generic, dataless fallback page instead of a stale, possibly-wrong one.
 */
const CACHE = `tally-${version}`;
const ASSETS = new Set([...build, ...files]);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([...ASSETS]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      // the share stash is a separate, short-lived bucket (see share-stash.js)
      // — an update mid-share must not throw away the file being imported
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== SHARE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/**
 * A statement shared to Tally from another app (the manifest's share_target)
 * arrives as a POST. The file can't survive a redirect, so it is parked in
 * the share stash and the user is sent to /share, which picks it up. Doing
 * this here rather than on the server means the file never leaves the device
 * until the user has chosen an account and starts the normal import.
 */
async function receiveShare(request) {
  try {
    const form = await request.formData();
    const shared = form.getAll('files').filter((f) => f instanceof File && f.size > 0);
    if (!shared.length) return Response.redirect('/transactions?new', 303);
    await stashFiles(shared);
    return Response.redirect('/share', 303);
  } catch {
    return Response.redirect('/transactions?new', 303);
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method === 'POST' && url.origin === self.location.origin && url.pathname === SHARE_PATH) {
    event.respondWith(receiveShare(event.request));
    return;
  }

  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // our own precached build output and static files: cache-first, since
  // these are content-hashed or explicitly versioned and never carry
  // per-user data
  if (ASSETS.has(url.pathname)) {
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
    return;
  }

  // everything else — pages, /insights, /transactions, every API call — is
  // never cached; only its failure (no network) is handled, by falling back
  // to the dataless offline page for a navigation, never to a stale response
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/offline.html').then((r) => r || Response.error()))
    );
  }
});
