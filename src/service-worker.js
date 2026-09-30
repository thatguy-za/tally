/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

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
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
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
