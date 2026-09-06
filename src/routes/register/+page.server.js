import { fail, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createUser, getUserByEmail, createSession, setSessionCookie } from '$lib/server/auth.js';

function registrationOpen() {
  return env.ALLOW_REGISTRATION !== 'false';
}

export function load() {
  if (!registrationOpen()) throw redirect(303, '/login');
  return {};
}

export const actions = {
  default: async (event) => {
    if (!registrationOpen()) return fail(403, { error: 'Registration is disabled.' });
    const form = await event.request.formData();
    const email = String(form.get('email') || '').trim();
    const password = String(form.get('password') || '');
    const confirm = String(form.get('confirm') || '');

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return fail(400, { error: 'Enter a valid email address.', email });
    if (password.length < 8)
      return fail(400, { error: 'Password must be at least 8 characters.', email });
    if (password !== confirm) return fail(400, { error: 'Passwords do not match.', email });
    if (getUserByEmail(email)) return fail(400, { error: 'That email is already registered.', email });

    const user = createUser(email, password);
    setSessionCookie(event, createSession(user.id));
    throw redirect(303, '/dashboard');
  }
};
