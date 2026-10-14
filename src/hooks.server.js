import { redirect } from '@sveltejs/kit';
import { getSessionUser, SESSION_COOKIE } from '$lib/server/auth.js';
import { listAccounts } from '$lib/server/queries.js';
import { ACCOUNT_COOKIE } from '$lib/server/account-cookie.js';

import { HIDE_COOKIE } from '$lib/privacy-cookie.js';

const PUBLIC_ROUTES = new Set(['/login', '/register']);
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF protection. SvelteKit's built-in check (disabled in svelte.config.js)
 * compares the Origin header against the app's origin *including scheme*, and
 * adapter-node assumes `https` unless ORIGIN is set — so a plain-http deploy on
 * an arbitrary hostname silently 403s every form submit with no visible error.
 *
 * This check accepts a state-changing request when the Origin's host matches the
 * host the app is actually being served on (from the forwarded/Host headers or
 * adapter-node's resolved origin), regardless of scheme. A cross-site attacker
 * still can't forge the Origin header, so protection is equivalent — without the
 * "set ORIGIN or nothing works" footgun. Requests with no Origin (curl,
 * server-to-server) pass, matching the framework default.
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 */
function crossSiteBlocked(event) {
  const { request } = event;
  if (!UNSAFE_METHODS.has(request.method)) return false;
  // the OS share sheet posts here with an Origin the browser chooses, not the
  // page's — and this route never reads the body, it only redirects, so there
  // is nothing a forged request could do with it
  if (event.url.pathname === '/share-target') return false;
  const origin = request.headers.get('origin');
  if (!origin) return false;

  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return true;
  }
  const allowed = new Set(
    [
      request.headers.get('x-forwarded-host'),
      request.headers.get('host'),
      event.url.host
    ].filter(Boolean)
  );
  return !allowed.has(originHost);
}

export async function handle({ event, resolve }) {
  if (crossSiteBlocked(event)) {
    return new Response('Cross-site request blocked.', { status: 403 });
  }

  const sessionId = event.cookies.get(SESSION_COOKIE);
  event.locals.user = getSessionUser(sessionId);

  // The single account every page's data is scoped to — never a combined
  // "all accounts" view, so switching accounts can never mix figures from
  // two of a user's own accounts together. Falls back to the first account
  // (the auto-seeded checking one) if nothing — or an account that no
  // longer exists — is selected.
  if (event.locals.user) {
    const accounts = listAccounts(event.locals.user.id);
    const requested = event.cookies.get(ACCOUNT_COOKIE);
    const active = accounts.find((a) => String(a.id) === requested) || accounts[0] || null;
    event.locals.accounts = accounts;
    event.locals.accountId = active?.id ?? null;
  }

  const path = event.url.pathname;
  const isPublic = PUBLIC_ROUTES.has(path);

  if (!event.locals.user && !isPublic) {
    throw redirect(303, '/login');
  }
  if (event.locals.user && isPublic) {
    throw redirect(303, '/insights');
  }

  // "Hide numbers" lives in a cookie (not only localStorage) so the server
  // can render the page already masked — otherwise every load would show the
  // real amounts for a moment, until the browser finished starting the app
  const hideNumbers = event.cookies.get(HIDE_COOKIE) === '1';
  event.locals.hideNumbers = hideNumbers;

  const response = await resolve(event, {
    transformPageChunk: ({ html }) => (hideNumbers ? html.replace('<html ', '<html data-hide-numbers ') : html)
  });

  // browsers should not guess content types, frame this app inside another
  // site, or tell other sites which page (and so which account) a request came
  // from — merchant logos are fetched from a third party, and the default
  // referrer policy would send them this app's address
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'same-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  return response;
}
