import { redirect } from '@sveltejs/kit';
import { deleteSession, clearSessionCookie, SESSION_COOKIE } from '$lib/server/auth.js';

export function POST(event) {
  deleteSession(event.cookies.get(SESSION_COOKIE));
  clearSessionCookie(event);
  throw redirect(303, '/login');
}
