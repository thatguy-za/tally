import { fail, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import {
  getUserByUsername,
  verifyPassword,
  createSession,
  setSessionCookie
} from '$lib/server/auth.js';
import { checkLogin, recordLoginFailure, recordLoginSuccess } from '$lib/server/login-throttle.js';

export function load() {
  return { allowRegistration: env.ALLOW_REGISTRATION !== 'false' };
}

function safeAddress(event) {
  try {
    return event.getClientAddress();
  } catch {
    return 'unknown';
  }
}

export const actions = {
  default: async (event) => {
    const form = await event.request.formData();
    const username = String(form.get('username') || '');
    const password = String(form.get('password') || '');
    if (!username || !password) return fail(400, { error: 'Enter your username and password.' });

    // checked before the password is, and whether or not the username exists,
    // so it can't be used to learn which usernames are real
    const address = safeAddress(event);
    const gate = checkLogin(address, username);
    if (!gate.allowed)
      return fail(429, { error: `Too many attempts. Try again in ${gate.retryAfterSec} second${gate.retryAfterSec === 1 ? '' : 's'}.`, username });

    const user = getUserByUsername(username);
    if (!user || !verifyPassword(password, user.password_hash)) {
      recordLoginFailure(address, username);
      return fail(400, { error: 'Invalid username or password.', username });
    }
    recordLoginSuccess(address, username);
    setSessionCookie(event, createSession(user.id));
    throw redirect(303, '/insights');
  }
};
