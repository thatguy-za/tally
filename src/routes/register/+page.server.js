import { fail, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createUser, getUserByUsername, createSession, setSessionCookie } from '$lib/server/auth.js';

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
    const username = String(form.get('username') || '').trim();
    const password = String(form.get('password') || '');
    const confirm = String(form.get('confirm') || '');

    if (!username || username.length > 64 || /\s/.test(username))
      return fail(400, { error: 'Choose a username with no spaces (up to 64 characters).', username });
    if (password.length < 8)
      return fail(400, { error: 'Password must be at least 8 characters.', username });
    if (password !== confirm) return fail(400, { error: 'Passwords do not match.', username });
    if (getUserByUsername(username))
      return fail(400, { error: 'That username is already taken.', username });

    const user = createUser(username, password);
    setSessionCookie(event, createSession(user.id));
    throw redirect(303, '/insights');
  }
};
