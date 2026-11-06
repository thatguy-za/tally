import { json, error } from '@sveltejs/kit';
import { listAccounts } from '$lib/server/queries.js';
import { ACCOUNT_COOKIE, VIEW_COOKIE } from '$lib/server/account-cookie.js';
import { servedOverHttps } from '$lib/server/auth.js';

/**
 * Sets which of the user's own accounts every page is scoped to, or — with
 * `{ view: 'household' }` — switches to the household's combined view.
 */
export async function POST(event) {
  const { request, cookies, locals } = event;
  if (!locals.user) throw error(401);

  let body;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Bad request body.');
  }

  // A Secure cookie is silently dropped by the browser over plain HTTP,
  // which is how many self-hosted deploys run — see setSessionCookie.
  const cookie = { path: '/', httpOnly: true, sameSite: 'lax', secure: servedOverHttps(event), maxAge: 60 * 60 * 24 * 365 };

  if (body?.view === 'household') {
    if (!locals.household) throw error(400, 'You are not in a household.');
    cookies.set(VIEW_COOKIE, 'household', cookie);
    return json({ ok: true });
  }

  const id = String(body?.accountId || '');
  const accounts = listAccounts(locals.user.id);
  if (!accounts.some((a) => String(a.id) === id)) throw error(400, 'Unknown account.');

  cookies.set(ACCOUNT_COOKIE, id, cookie);
  // picking an account leaves the household view
  cookies.delete(VIEW_COOKIE, { path: '/' });
  return json({ ok: true });
}
