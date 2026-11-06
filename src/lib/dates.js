const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "13 Oct" or "Oct 13" from a YYYY-MM-DD, in the day/month order the user chose
 * in Settings. Built from the string's own parts rather than a Date: parsing
 * "2026-10-13" as a Date gives midnight UTC, which is the 12th for anyone west
 * of Greenwich, and a locale-dependent format reads differently on the server
 * than in the browser, so the page would change as it loaded.
 * @param {string} iso
 * @param {'dmy'|'mdy'|'ymd'} [order]
 */
export function shortDate(iso, order = 'dmy') {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  const month = m && MONTHS[Number(m[2]) - 1];
  if (!m || !month) return String(iso ?? '');
  const day = Number(m[3]);
  return order === 'dmy' ? `${day} ${month}` : `${month} ${day}`;
}

/**
 * Whole days from `now` until an ISO timestamp, rounded up and never negative
 * ("expires in 7 days" for a code with 6.2 days left).
 * @param {string} iso
 * @param {number} [now]
 */
export function daysUntil(iso, now = Date.now()) {
  const ms = Date.parse(iso) - now;
  return Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 864e5)) : 0;
}
