import { redirect } from '@sveltejs/kit';
import { deleteSession, clearSessionCookie, SESSION_COOKIE } from '$lib/server/auth.js';

export function POST({ cookies }) {
  deleteSession(cookies.get(SESSION_COOKIE));
  clearSessionCookie(cookies);
  throw redirect(303, '/login');
}
