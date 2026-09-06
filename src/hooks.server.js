import { redirect } from '@sveltejs/kit';
import { getSessionUser, SESSION_COOKIE } from '$lib/server/auth.js';

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

  const path = event.url.pathname;
  const isPublic = PUBLIC_ROUTES.has(path);

  if (!event.locals.user && !isPublic) {
    throw redirect(303, '/login');
  }
  if (event.locals.user && isPublic) {
    throw redirect(303, '/dashboard');
  }

  return resolve(event);
}
