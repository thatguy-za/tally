import { redirect } from '@sveltejs/kit';
import { getSessionUser, SESSION_COOKIE } from '$lib/server/auth.js';

const PUBLIC_ROUTES = new Set(['/login', '/register']);

export async function handle({ event, resolve }) {
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
