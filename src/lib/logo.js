/**
 * Finding a merchant's logo from a messy bank description (e.g. "SQ *SPAR
 * CAPE TOWN", "NETFLIX.COM", "PAYPAL *SPOTIFY AB"). Each lookup sends the
 * merchant's domain to a favicon service, and a wrong logo is worse than none,
 * so a logo is only looked up when the merchant is clear:
 *   - the description contains a web address ("NETFLIX.COM"), or
 *   - it starts with a merchant on the known list (merchants.js).
 * Anything else — "Future dated rent", "Unknown card payment", a person's
 * name — gets no lookup and the UI shows a plain dot.
 */
import { MERCHANTS } from './merchants.js';

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
 * The old guess: the first real word of any description plus ".com". It found
 * a "merchant" in nearly everything ("Future dated rent" became futur…), so it
 * is no longer used to look anything up. Kept only so the one-time clean-up in
 * db.js can recognise cached rows that this produced and drop them.
 * @param {string} description
 * @returns {string|null}
 */
export function legacyGuessDomain(description) {
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

// A web address written in the text. Only well-known endings count, so
// "J.Smith" or "INV.2024" aren't read as one; the label must be 3+ letters.
const TLDS = 'com|net|org|io|app|shop|store|co\\.uk|co\\.za|co\\.nz|com\\.au|com\\.br|co\\.in|uk|nl|de|fr|es|it|ie|be|ch|at|se|no|dk|fi|pl|cz|pt|ca|au|nz|za|in|jp|us|eu|tv|me|ai|dev|so';
const WEB_ADDRESS = new RegExp(`(^|[^a-z0-9@.-])((?:[a-z0-9-]+\\.)*[a-z0-9-]{3,}\\.(?:${TLDS}))(?![a-z0-9-])`, 'i');
// mailbox providers say nothing about the merchant
const MAILBOX_PROVIDERS = new Set(['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'live.com', 'me.com', 'proton.me', 'protonmail.com']);

/** The registrable part of a host: "help.uber.com" -> "uber.com", "shop.amazon.co.uk" -> "amazon.co.uk". */
function registrable(host) {
  const parts = host.split('.');
  const two = parts.slice(-2).join('.');
  if (/^(co|com)\.[a-z]{2}$/.test(two) && parts.length >= 3) return parts.slice(-3).join('.');
  return two;
}

/**
 * @param {string} description
 * @returns {string|null} the merchant's domain when it is clear from the text, otherwise null
 */
export function guessDomain(description) {
  const desc = String(description || '').trim();
  if (!desc) return null;

  const found = desc.match(WEB_ADDRESS);
  if (found) {
    const domain = registrable(found[2].toLowerCase().replace(/^www\./, ''));
    if (!MAILBOX_PROVIDERS.has(domain) && !GENERIC_TERMS.has(domain.split('.')[0])) return domain;
  }

  let rest = desc;
  for (let i = 0; i < 4 && NOISE_PREFIX.test(rest); i++) rest = rest.replace(NOISE_PREFIX, '');
  const tokens = rest
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    // reference numbers and the like before the name
    .filter((t, i, all) => !(/^\d+$/.test(t) && all.slice(0, i).every((x) => /^\d+$/.test(x))));
  while (tokens[0] === 'the') tokens.shift();
  if (!tokens.length || GENERIC_TERMS.has(tokens[0])) return null;

  // the longest known name that the description starts with
  for (let n = Math.min(4, tokens.length); n >= 1; n--) {
    const domain = MERCHANTS[tokens.slice(0, n).join(' ')];
    if (domain) return domain;
  }
  return null;
}

/** Normalised cache key — same merchant text should reuse the same guess. */
export function logoKey(description) {
  return String(description || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
