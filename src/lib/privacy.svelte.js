import { formatMoney as formatMoneyReal } from './currency.js';
import { HIDE_COOKIE } from './privacy-cookie.js';

// A "hide my numbers" preference — someone showing the app to someone else can
// blank every amount without logging out or losing their place. It is kept in
// a cookie as well as localStorage: the cookie is what lets the server render
// the page already masked, so real amounts are never on screen even briefly.
export const privacy = $state({ hideNumbers: false });

const ONE_YEAR = 60 * 60 * 24 * 365;

function persist(v) {
  try {
    if (v) localStorage.setItem('hideNumbers', '1');
    else localStorage.removeItem('hideNumbers');
  } catch (e) {
    /* ignore */
  }
  try {
    document.cookie = `${HIDE_COOKIE}=${v ? '1' : ''}; Path=/; Max-Age=${v ? ONE_YEAR : 0}; SameSite=Lax`;
    document.documentElement.toggleAttribute('data-hide-numbers', v);
  } catch (e) {
    /* ignore */
  }
}

/**
 * Called as the layout starts (on the server too, so the first render is
 * already right). `fromServer` is what the cookie said. A browser that set
 * the preference before it was kept in a cookie has it in localStorage only,
 * so that is adopted once and written to the cookie.
 * @param {boolean} fromServer
 */
export function initPrivacy(fromServer = false) {
  privacy.hideNumbers = fromServer;
  if (fromServer || typeof localStorage === 'undefined') return;
  try {
    if (localStorage.getItem('hideNumbers') === '1') {
      privacy.hideNumbers = true;
      persist(true);
    }
  } catch (e) {
    /* ignore */
  }
}

export function setHideNumbers(v) {
  privacy.hideNumbers = v;
  persist(v);
}

export function toggleHideNumbers() {
  setHideNumbers(!privacy.hideNumbers);
}

/**
 * Drop-in replacement for currency.js's formatMoney — same signature, so
 * every call site just switches its import source to mask under the
 * "hide numbers" preference.
 * @param {number} amount @param {string} currency
 */
export function formatMoney(amount, currency) {
  return privacy.hideNumbers ? '••••' : formatMoneyReal(amount, currency);
}
