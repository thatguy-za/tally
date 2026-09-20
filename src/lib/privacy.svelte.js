import { formatMoney as formatMoneyReal } from './currency.js';

// A purely client-side "hide my numbers" preference — someone showing the
// app to someone else can blank every amount without logging out or losing
// their place. Mirrors theme.svelte.js's localStorage pattern: mutated only
// from client event handlers/effects, so it never touches SSR output (every
// render starts from the same `false` default until initPrivacy() runs).
export const privacy = $state({ hideNumbers: false });

export function initPrivacy() {
  try {
    privacy.hideNumbers = localStorage.getItem('hideNumbers') === '1';
  } catch (e) {
    /* ignore */
  }
}

export function setHideNumbers(v) {
  privacy.hideNumbers = v;
  try {
    if (v) localStorage.setItem('hideNumbers', '1');
    else localStorage.removeItem('hideNumbers');
  } catch (e) {
    /* ignore */
  }
}

export function toggleHideNumbers() {
  setHideNumbers(!privacy.hideNumbers);
}

/**
 * Drop-in replacement for currency.js's formatMoney — same signature, so
 * every call site just switches its import source to mask under the
 * "hide numbers" preference. Never import this on the server: it's a client
 * preference with no meaning for a request that isn't rendering to a screen.
 * @param {number} amount @param {string} currency
 */
export function formatMoney(amount, currency) {
  return privacy.hideNumbers ? '••••' : formatMoneyReal(amount, currency);
}
