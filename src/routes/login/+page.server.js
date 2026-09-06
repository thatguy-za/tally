import { fail, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import {
  getUserByEmail,
  verifyPassword,
  createSession,
  setSessionCookie
} from '$lib/server/auth.js';

export function load() {
  return { allowRegistration: env.ALLOW_REGISTRATION !== 'false' };
}

export const actions = {
  default: async ({ request, cookies }) => {
    const form = await request.formData();
    const email = String(form.get('email') || '');
    const password = String(form.get('password') || '');
    if (!email || !password) return fail(400, { error: 'Enter your email and password.' });

    const user = getUserByEmail(email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return fail(400, { error: 'Invalid email or password.', email });
    }
    setSessionCookie(cookies, createSession(user.id));
    throw redirect(303, '/dashboard');
  }
};
