import { redirect } from '@sveltejs/kit';

/**
 * The manifest's share_target posts here. Normally the service worker catches
 * that POST first (see src/service-worker.js) and never lets it reach the
 * server — the file stays on the device until the user picks an account. This
 * is only reached when the worker isn't in control yet, e.g. the very first
 * launch after an install or update. The body is deliberately ignored: the
 * best this can do is drop the user on the normal import screen, where they
 * can pick the file themselves.
 */
export function POST() {
  throw redirect(303, '/transactions?new');
}
