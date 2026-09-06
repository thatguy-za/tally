/**
 * Minimal, dependency-free CSV/TSV parser. Runs on client and server.
 * Detects the delimiter (`,` `;` tab `|`), handles quoted fields, escaped
 * quotes (`""`), and `\n` / `\r\n` line endings.
 * @param {string} text
 * @param {string} [forceDelimiter] one of , ; \t |
 * @returns {string[][]}
 */
export function parseCsv(text, forceDelimiter) {
  const s = String(text ?? '').replace(/^﻿/, '');
  const delimiter = forceDelimiter || detectDelimiter(s);

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}

/** @param {string} s @returns {string} */
export function detectDelimiter(s) {
  const firstLine = (s.split(/\r?\n/).find((l) => l.trim() !== '') || '').replace(/"[^"]*"/g, '');
  const counts = {
    ',': (firstLine.match(/,/g) || []).length,
    ';': (firstLine.match(/;/g) || []).length,
    '\t': (firstLine.match(/\t/g) || []).length,
    '|': (firstLine.match(/\|/g) || []).length
  };
  let best = ',';
  let bestN = -1;
  for (const [d, n] of Object.entries(counts)) if (n > bestN) { best = d; bestN = n; }
  return best;
}

/**
 * Parse a currency-ish string into a number.
 * Accepts "1.234,56", "1,234.56", "(1234.56)", "€ 1234", "-1234", "1234 CR".
 * @param {string} raw
 * @returns {number|null}
 */
export function parseAmount(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (/\b(dr|debit)\b/i.test(s)) negative = true;
  if (/\b(cr|credit)\b/i.test(s)) negative = false;
  s = s.replace(/[^0-9.,\-]/g, '');
  if (s.includes('-')) { negative = true; s = s.replace(/-/g, ''); }
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma > -1) {
    s = s.replace(/,(\d{1,2})$/, '.$1').replace(/,/g, '');
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};

/**
 * Normalise a date string to YYYY-MM-DD.
 * Supports ISO, DD/MM/YYYY, MM/DD/YYYY, DD.MM.YYYY, DD-MMM-YYYY, "1 Jan 2026",
 * "Jan 1, 2026", YYYYMMDD.
 * @param {string} raw
 * @param {'dmy'|'mdy'|'ymd'} order
 * @returns {string|null}
 */
export function parseDate(raw, order = 'dmy') {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const pad = (n) => String(n).padStart(2, '0');
  const fixY = (y) => (y.length === 2 ? (Number(y) > 70 ? `19${y}` : `20${y}`) : y);

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;

  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // numeric with separators
  m = s.match(/^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4})$/);
  if (m) {
    let [, a, b, c] = m;
    if (a.length === 4 || order === 'ymd') return `${fixY(a)}-${pad(b)}-${pad(c)}`;
    const day = order === 'mdy' ? b : a;
    const mon = order === 'mdy' ? a : b;
    return `${fixY(c)}-${pad(mon)}-${pad(day)}`;
  }

  // "1 Jan 2026" / "1-Jan-26" / "Jan 1, 2026"
  m = s.match(/^(\d{1,2})[ \-]([A-Za-z]{3,})[ \-](\d{2,4})$/);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) {
    return `${fixY(m[3])}-${pad(MONTHS[m[2].slice(0, 3).toLowerCase()])}-${pad(m[1])}`;
  }
  m = s.match(/^([A-Za-z]{3,})[ ]+(\d{1,2}),?[ ]+(\d{2,4})$/);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) {
    return `${fixY(m[3])}-${pad(MONTHS[m[1].slice(0, 3).toLowerCase()])}-${pad(m[2])}`;
  }

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return null;
}

/**
 * Guess which column index maps to each field from header names.
 * @param {string[]} headers
 * @returns {{date:string, description:string, amount:string, debit:string, credit:string, category:string}}
 */
export function guessMapping(headers) {
  const lower = headers.map((h) => String(h).toLowerCase().trim());
  const find = (cands) => {
    for (const cand of cands) {
      const i = lower.findIndex((h) => h.includes(cand));
      if (i > -1) return String(i);
    }
    return '';
  };
  return {
    date: find(['date', 'datum', 'booking', 'posted', 'transaction date']),
    description: find([
      'description', 'desc', 'narrative', 'details', 'memo', 'reference',
      'payee', 'name', 'merchant', 'particulars', 'text'
    ]),
    amount: find(['amount', 'value', 'bedrag', 'montant', 'betrag']),
    debit: find(['debit', 'withdrawal', 'paid out', 'money out', 'uit', ' af', 'outgoing']),
    credit: find(['credit', 'deposit', 'paid in', 'money in', 'bij', 'incoming']),
    category: find(['category', 'categorie', 'kategorie', 'type'])
  };
}

/** Stable key for duplicate detection. */
export function dupeKey(date, amount, description) {
  return `${date}|${Number(amount).toFixed(2)}|${String(description || '').trim().toLowerCase()}`;
}
