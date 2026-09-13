/**
 * Best-effort merchant domain guessing from messy bank-export description
 * text (e.g. "SQ *SPAR CAPE TOWN", "NETFLIX.COM", "PAYPAL *SPOTIFY AB").
 * There is no reliable way to do this perfectly from text alone — this is a
 * heuristic for finding a favicon to show next to a transaction, not an
 * authoritative merchant match, and a wrong or missing guess is expected and
 * harmless (the UI just falls back to a plain dot).
 */

// Card-network / payment-processor noise that precedes the actual merchant
// name in a lot of bank exports. Applied repeatedly, since these often stack
// (e.g. "POS PURCHASE WOOLWORTHS").
const NOISE_PREFIX = /^(POS|PURCHASE|DEBIT|CREDIT|CARD PAYMENT TO|PAYMENT TO|SQ|SP|TST|PP|PAYPAL|IZ|WWW)[\s*.-]+/i;

// Leading stuff that's never part of a merchant name: reference numbers,
// dates, stray punctuation.
const LEADING_JUNK = /^[\d\s.*#-]+/;

// A description that is (or starts with) one of these isn't naming a
// merchant at all — bail out entirely rather than guess from a later word,
// since whatever follows is usually a person, a note, or another bank term.
const GENERIC_TERMS = new Set([
  'atm',
  'transfer',
  'fee',
  'fees',
  'interest',
  'salary',
  'payroll',
  'cash',
  'withdrawal',
  'deposit',
  'unknown',
  'refund',
  'reversal',
  'adjustment',
  'charge',
  'payment',
  'direct',
  'standing',
  'order',
  'paid'
]);

// Grammatical filler and generic business-type nouns that can appear next to
// a real merchant name in either order (e.g. "BOOTS PHARMACY" and "PHARMACY
// BOOTS" should both find "boots") — skipped over rather than treated as a
// reason to give up, or worse, mistaken for the merchant itself.
const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'to',
  'of',
  'from',
  'inc',
  'llc',
  'ltd',
  'co',
  'group',
  'store',
  'shop',
  'supermarket',
  'market',
  'mart',
  'pharmacy',
  'restaurant',
  'cafe',
  'bar',
  'grill',
  'pub',
  'hotel',
  'motel',
  'salon',
  'spa',
  'gym',
  'clinic',
  'hospital',
  'dental',
  'garage',
  'cinema',
  'bakery',
  'laundry',
  'cleaners',
  'grocery',
  'groceries',
  'wholesale',
  'retail',
  'outlet',
  'boutique',
  'express',
  'service',
  'services',
  'station',
  'centre',
  'center'
]);

const DOMAIN_RE = /\b([a-z0-9-]+\.(?:com|net|org|io|app|shop|store|co\.[a-z]{2}|[a-z]{2,3}))\b/i;

/**
 * @param {string} description
 * @returns {string|null} a lowercase domain guess, or null if none is worth trying
 */
export function guessDomain(description) {
  const desc = String(description || '').trim();
  if (!desc) return null;

  // an actual domain already sitting in the text is the most reliable signal
  const domainMatch = desc.match(DOMAIN_RE);
  if (domainMatch) {
    const domain = domainMatch[1].toLowerCase().replace(/^www\./, '');
    if (!GENERIC_TERMS.has(domain.split('.')[0])) return domain;
  }

  let rest = desc;
  for (let i = 0; i < 4 && NOISE_PREFIX.test(rest); i++) rest = rest.replace(NOISE_PREFIX, '');
  rest = rest.replace(LEADING_JUNK, '').trim();

  let sawWord = false;
  for (const word of rest.split(/\s+/)) {
    const name = word.toLowerCase().replace(/[^a-z]/g, '');
    if (!name) continue;
    // the FIRST real word deciding this isn't a merchant at all ends the guess
    if (!sawWord && GENERIC_TERMS.has(name)) return null;
    sawWord = true;
    if (name.length < 3 || STOPWORDS.has(name)) continue;
    return `${name}.com`;
  }
  return null;
}

/** Normalised cache key — same merchant text should reuse the same guess. */
export function logoKey(description) {
  return String(description || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
