/**
 * Minimal, dependency-free CSV parser.
 * Handles quoted fields, escaped quotes ("") , and \n / \r\n line endings.
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const s = text.replace(/^﻿/, '');

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
    } else if (c === ',' || c === ';' || c === '\t') {
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

/**
 * Parse a currency-ish string into a number.
 * Accepts "1.234,56", "1,234.56", "(1234.56)", "€ 1234", "-1234".
 * @param {string} raw
 * @returns {number|null}
 */
export function parseAmount(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  s = s.replace(/[^0-9.,\-]/g, '');
  if (s.includes('-')) { negative = true; s = s.replace(/-/g, ''); }
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma > -1) {
    // treat comma as decimal separator if it looks like one
    s = s.replace(/,(\d{1,2})$/, '.$1').replace(/,/g, '');
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}

/**
 * Normalise a date string to YYYY-MM-DD. Supports ISO, DD/MM/YYYY, MM/DD/YYYY, DD.MM.YYYY.
 * @param {string} raw
 * @param {'dmy'|'mdy'} order
 * @returns {string|null}
 */
export function parseDate(raw, order = 'dmy') {
  if (!raw) return null;
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (m) {
    let [, a, b, y] = m;
    if (y.length === 2) y = Number(y) > 70 ? `19${y}` : `20${y}`;
    const day = order === 'mdy' ? b : a;
    const mon = order === 'mdy' ? a : b;
    return `${y}-${mon.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}
