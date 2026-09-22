import { json, error } from '@sveltejs/kit';
import { listAccounts } from '$lib/server/queries.js';
import { ACCOUNT_COOKIE } from '$lib/server/account-cookie.js';
import { servedOverHttps } from '$lib/server/auth.js';

/** Sets which of the user's own accounts every page is scoped to. */
export async function POST(event) {
  const { request, cookies, locals } = event;
  if (!locals.user) throw error(401);

  let body;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Bad request body.');
  }

  const id = String(body?.accountId || '');
  const accounts = listAccounts(locals.user.id);
  if (!accounts.some((a) => String(a.id) === id)) throw error(400, 'Unknown account.');

  cookies.set(ACCOUNT_COOKIE, id, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    // A Secure cookie is silently dropped by the browser over plain HTTP,
    // which is how many self-hosted deploys run — see setSessionCookie.
    secure: servedOverHttps(event),
    maxAge: 60 * 60 * 24 * 365
  });
  return json({ ok: true });
}
