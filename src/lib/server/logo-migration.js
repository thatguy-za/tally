import { legacyGuessDomain } from '$lib/logo.js';

/**
 * Logos were once looked up for nearly any description, from its first word
 * plus ".com", and the guess was cached for good. This drops the cached
 * guesses the old rule made (see legacyGuessDomain), so only clear merchants
 * keep a logo; a domain someone chose by hand differs from the old guess and is
 * kept. Run once, guarded by a flag in app_settings.
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {number} how many cached guesses were dropped
 */
export function dropLegacyLogoGuesses(db) {
  const cached = db.prepare('SELECT key, domain FROM merchant_logos WHERE domain IS NOT NULL').all();
  const drop = db.prepare('DELETE FROM merchant_logos WHERE key = ?');
  let dropped = 0;
  for (const r of cached) {
    if (legacyGuessDomain(r.key) === r.domain) {
      drop.run(r.key);
      dropped++;
    }
  }
  return dropped;
}
