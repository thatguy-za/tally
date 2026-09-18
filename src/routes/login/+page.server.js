import { fail, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import {
  getUserByUsername,
  verifyPassword,
  createSession,
  setSessionCookie
} from '$lib/server/auth.js';

export function load() {
  return { allowRegistration: env.ALLOW_REGISTRATION !== 'false' };
}

export const actions = {
  default: async (event) => {
    const form = await event.request.formData();
    const username = String(form.get('username') || '');
    const password = String(form.get('password') || '');
    if (!username || !password) return fail(400, { error: 'Enter your username and password.' });

    const user = getUserByUsername(username);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return fail(400, { error: 'Invalid username or password.', username });
    }
    setSessionCookie(event, createSession(user.id));
    throw redirect(303, '/insights');
  }
};
