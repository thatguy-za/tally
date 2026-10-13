/**
 * Turns the positioned text of a PDF bank statement into transaction rows —
 * entirely locally, no network and no AI. Pure: it takes the text items a PDF
 * reader produced (string + position) so it can be tested without a PDF.
 *
 * Statements have no single layout, so this reads the page the way a person
 * does: a transaction is a line that starts with a date and carries a money
 * amount; the columns are the vertical stripes the amounts line up in; a
 * running-balance column, when there is one, tells debits from credits.
 * Where the layout can't be worked out with confidence, the amount columns are
 * handed on as they are so the review screen's column mapping can finish the job.
 */
import { parseAmount, parseDate } from './csv.js';

const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';
// most specific first; each is anchored to the start of the text
const DATE_PATTERNS = [
  /^\d{4}-\d{1,2}-\d{1,2}/,
  /^\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}(?![\d/])/,
  new RegExp(`^\\d{1,2}[ \\-]${MONTH}[ \\-,]*\\d{4}`, 'i'),
  new RegExp(`^${MONTH} \\d{1,2},? \\d{4}`, 'i'),
  new RegExp(`^\\d{1,2}[ \\-]?${MONTH}(?![a-z])`, 'i'),
  new RegExp(`^${MONTH} \\d{1,2}(?![\\d,])`, 'i'),
  /^\d{1,2}\/\d{1,2}(?![\d/.,])/
];
const HAS_YEAR = /\d{4}|\d[/.\-]\d{1,2}[/.\-]\d{2}$/;

// a printed money amount: optional sign/currency, digits with a 2-digit
// decimal part, optional trailing minus or CR/DR. Requiring the decimals keeps
// years, reference numbers and page numbers from being mistaken for amounts.
const MONEY = /^[(+\-−–]?\s*[A-Za-z$€£¥]{0,3}\s*[(+\-−–]?\s*\d[\d.,\s]*[.,]\d{2}\s*\)?\s*(?:[-−–]|cr|dr)?$/i;
const OPENING = /(opening|brought forward|previous|balance\s*b\/?f|b\/?f\s*balance|balance\s*(?:brought|forward))/i;

const ROLE_WORDS = [
  ['balance', /balance/i],
  ['debit', /^(debits?|withdrawals?|money out|paid out|payments?( out)?|out|dr|charges?|spent)$/i],
  ['credit', /^(credits?|deposits?|money in|paid in|receipts?|payments? in|in|cr|received)$/i],
  ['amount', /^(amount|value|transaction amount|amount \(.*\))$/i]
];

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/**
 * Group a page's text items into lines of cells, top to bottom.
 * @param {{str:string,x:number,y:number,width:number,height:number}[]} items
 * @returns {{y:number,h:number,cells:{text:string,x:number,right:number}[]}[]}
 */
export function buildLines(items) {
  const real = items.filter((it) => it.str && it.str.trim());
  real.sort((a, b) => b.y - a.y || a.x - b.x);

  const lines = [];
  for (const it of real) {
    const h = it.height || it.fontSize || 10;
    const line = lines.find((l) => Math.abs(l.y - it.y) <= Math.max(2, h * 0.4));
    if (line) {
      line.items.push(it);
      line.h = Math.max(line.h, h);
    } else lines.push({ y: it.y, h, items: [it] });
  }
  lines.sort((a, b) => b.y - a.y);

  return lines.map((l) => {
    l.items.sort((a, b) => a.x - b.x);
    const cells = [];
    for (const it of l.items) {
      const prev = cells[cells.length - 1];
      const charW = it.width / Math.max(1, it.str.length);
      const gap = prev ? it.x - prev.right : Infinity;
      // a wide gap starts a new cell; a narrow one is just a space between words
      if (prev && gap <= Math.max(3, charW * 2.2)) {
        prev.text += (gap > charW * 0.3 ? ' ' : '') + it.str.trim();
        prev.right = it.x + it.width;
      } else {
        cells.push({ text: it.str.trim(), x: it.x, right: it.x + it.width });
      }
    }
    return { y: l.y, h: l.h, cells };
  });
}

/** The statement's year: the 4-digit year that appears most in its text. */
export function guessYear(lines) {
  const counts = new Map();
  for (const l of lines)
    for (const c of l.cells)
      for (const m of c.text.matchAll(/\b(19|20)\d{2}\b/g)) counts.set(m[0], (counts.get(m[0]) || 0) + 1);
  let best = null;
  for (const [y, n] of counts) if (!best || n > best[1]) best = [y, n];
  return best ? Number(best[0]) : null;
}

const isRealDate = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
};

/** Read a date off the start of `text`: { iso, rest } or null. */
export function readDate(text, order, year) {
  for (const re of DATE_PATTERNS) {
    const m = text.match(re);
    if (!m) continue;
    let raw = m[0];
    let iso = null;
    if (HAS_YEAR.test(raw)) iso = parseDate(raw, order);
    else if (year) {
      // day and month only — borrow the statement's year
      if (/[a-z]/i.test(raw)) iso = parseDate(`${raw.replace(/\.$/, '')} ${year}`, order);
      else iso = parseDate(`${raw}/${year}`, order);
    }
    if (!iso || !isRealDate(iso)) continue;
    return { iso, rest: text.slice(raw.length).replace(/^[\s,.\-]+/, '') };
  }
  return null;
}

/** { value (always positive), sign: -1 | 1 | null } for a money-looking cell, else null. */
function readMoney(text) {
  const t = text.trim();
  if (!MONEY.test(t)) return null;
  const n = parseAmount(t);
  if (n == null) return null;
  const explicitNeg = /^[(\-−–]/.test(t) || /[-−–)]\s*$/.test(t) || /dr\s*$/i.test(t) || n < 0;
  const explicitPos = /^\+/.test(t) || /cr\s*$/i.test(t);
  return { value: Math.abs(n), sign: explicitNeg ? -1 : explicitPos ? 1 : null };
}

const cents = (n) => Math.round(n * 100);

/**
 * @param {{str:string,x:number,y:number,width:number,height:number}[][]} pages
 * @param {{ dateOrder?: 'dmy'|'mdy'|'ymd' }} [opts]
 * @returns {{ rows: {date:string,description:string,amounts:number[]}[], headers: string[], signed: boolean }}
 *   `signed`: each row has one signed `amounts[0]`. When false, `amounts` holds
 *   the amount columns as printed (unsigned) and `headers` names them.
 */
export function parseStatement(pages, { dateOrder = 'dmy' } = {}) {
  const lines = pages.flatMap((p) => buildLines(p));
  const year = guessYear(lines);

  // ---- 1. transaction lines ------------------------------------------------
  const txns = [];
  let opening = null; // balance printed before the first transaction, if any
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const money = line.cells.map((c) => ({ c, m: readMoney(c.text) })).filter((x) => x.m);
    const first = line.cells[0];
    const date = first ? readDate(first.text, dateOrder, year) : null;

    if (!date) {
      if (money.length && OPENING.test(line.cells.map((c) => c.text).join(' ')) && !txns.length)
        opening = { right: money[money.length - 1].c.right, value: money[money.length - 1].m.value, sign: money[money.length - 1].m.sign };
      continue;
    }
    if (!money.length) continue;

    // description: everything that isn't the date or an amount (a second
    // date — posting date next to transaction date — is skipped too)
    const texts = [];
    if (date.rest) texts.push(date.rest);
    for (const c of line.cells.slice(1)) {
      if (money.some((x) => x.c === c)) continue;
      const again = readDate(c.text, dateOrder, year);
      if (again && !texts.length && !again.rest) continue;
      texts.push(c.text);
    }
    txns.push({ li, line, date: date.iso, parts: texts, money, descX: line.cells[1]?.x ?? first.x });
  }

  if (!txns.length) return { rows: [], headers: [], signed: false };

  // ---- 2. wrapped descriptions --------------------------------------------
  // a line with no date and no amount right under a transaction is its second
  // line of description; footers sit further away and are left alone
  for (const t of txns) {
    for (let k = 1; k <= 2; k++) {
      const next = lines[t.li + k];
      if (!next || txns.some((x) => x.li === t.li + k)) break;
      const prev = lines[t.li + k - 1];
      if (prev.y - next.y > Math.max(prev.h, next.h) * 1.7) break;
      if (next.cells.some((c) => readMoney(c.text)) || readDate(next.cells[0]?.text ?? '', dateOrder, year)) break;
      if (OPENING.test(next.cells.map((c) => c.text).join(' '))) break;
      if (next.cells[0].x < t.descX - 6) break;
      t.parts.push(next.cells.map((c) => c.text).join(' '));
    }
  }

  // ---- 3. amount columns ---------------------------------------------------
  const edges = txns.flatMap((t) => t.money.map((x) => x.c.right)).sort((a, b) => a - b);
  const tol = Math.max(6, median(txns.map((t) => t.line.h)) * 0.9);
  /** @type {{right:number,left:number,n:number}[]} */
  const columns = [];
  for (const e of edges) {
    const last = columns[columns.length - 1];
    if (last && e - last.right <= tol) {
      last.right = (last.right * last.n + e) / (last.n + 1);
      last.n++;
    } else columns.push({ right: e, left: Infinity, n: 1 });
  }
  const colOf = (right) => {
    let best = 0;
    for (let i = 1; i < columns.length; i++) if (Math.abs(columns[i].right - right) < Math.abs(columns[best].right - right)) best = i;
    return best;
  };
  for (const t of txns) {
    t.vals = new Array(columns.length).fill(null);
    for (const x of t.money) {
      const i = colOf(x.c.right);
      columns[i].left = Math.min(columns[i].left, x.c.x);
      if (t.vals[i] == null) t.vals[i] = x.m;
    }
  }
  if (columns.length > 6) return { rows: [], headers: [], signed: false };

  // ---- 4. column roles, from a header line ---------------------------------
  const roles = new Array(columns.length).fill(null);
  for (const line of lines) {
    const found = [];
    for (const c of line.cells) {
      const word = c.text.trim();
      const hit = ROLE_WORDS.find(([, re]) => re.test(word));
      if (hit) found.push({ role: hit[0], c });
    }
    if (found.length < 2) continue;
    for (const { role, c } of found) {
      let best = -1;
      let bestD = Infinity;
      columns.forEach((col, i) => {
        // distance between the header's span and where this column's amounts sit
        const lo = Math.min(col.left, col.right);
        const d = c.right < lo ? lo - c.right : c.x > col.right ? c.x - col.right : 0;
        if (d < bestD) { bestD = d; best = i; }
      });
      if (best >= 0 && bestD < 40 && !roles[best]) roles[best] = role;
    }
    break;
  }

  // ---- 5. running balance, to find the balance column and the signs --------
  const balanceCol = (() => {
    const fromHeader = roles.indexOf('balance');
    if (fromHeader >= 0) return fromHeader;
    if (columns.length < 2) return -1;
    const last = columns.length - 1;
    let ok = 0;
    let tested = 0;
    for (let i = 1; i < txns.length; i++) {
      const a = txns[i - 1].vals[last];
      const b = txns[i].vals[last];
      if (!a || !b) continue;
      const others = txns[i].vals.filter((v, c) => v && c !== last);
      if (!others.length) continue;
      tested++;
      const diff = Math.abs(cents(signed(b, last, txns[i]) - signed(a, last, txns[i - 1])));
      if (others.some((v) => Math.abs(diff - cents(v.value)) <= 1)) ok++;
    }
    return tested >= 2 && ok / tested >= 0.6 ? last : -1;
  })();
  // a balance is printed positive unless marked (overdrawn) — keep its own sign
  function signed(v, _col, _t) {
    return (v.sign ?? 1) * v.value;
  }
  if (balanceCol >= 0) roles[balanceCol] = 'balance';

  // the balance change on each line: positive = money in
  let prevBal = opening && balanceCol >= 0 && Math.abs(opening.right - columns[balanceCol].right) <= tol * 2 ? signed(opening, 0, null) : null;
  for (const t of txns) {
    const b = balanceCol >= 0 ? t.vals[balanceCol] : null;
    if (b) {
      const bal = signed(b, balanceCol, t);
      t.delta = prevBal == null ? null : bal - prevBal;
      prevBal = bal;
    } else t.delta = null;
  }

  const amountCols = columns.map((_, i) => i).filter((i) => i !== balanceCol);
  const desc = (t) => t.parts.join(' ').replace(/\s+/g, ' ').trim();

  // ---- 6a. a debit column and a credit column --------------------------------
  let debitCol = roles.indexOf('debit');
  let creditCol = roles.indexOf('credit');
  if (debitCol < 0 && creditCol < 0 && amountCols.length === 2 && balanceCol >= 0) {
    // no header: the balance movement says which of the two is money out
    const score = [0, 0];
    amountCols.forEach((col, k) => {
      for (const t of txns) if (t.vals[col] && t.delta != null) score[k] += t.delta < 0 ? 1 : -1;
    });
    if (score[0] !== score[1]) {
      debitCol = amountCols[score[0] > score[1] ? 0 : 1];
      creditCol = amountCols[score[0] > score[1] ? 1 : 0];
    }
  }
  if (debitCol >= 0 || creditCol >= 0) {
    return {
      signed: true,
      headers: ['Amount'],
      rows: txns.map((t) => ({
        date: t.date,
        description: desc(t),
        amounts: [(t.vals[creditCol]?.value ?? 0) - (t.vals[debitCol]?.value ?? 0)]
      }))
    };
  }

  // ---- 6b. one amount column --------------------------------------------------
  if (amountCols.length === 1) {
    const col = amountCols[0];
    const rows = [];
    for (const t of txns) {
      const v = t.vals[col];
      if (!v) continue;
      let sign = v.sign;
      // an unmarked amount takes its sign from what the balance did
      if (sign == null && t.delta != null && Math.abs(Math.abs(cents(t.delta)) - cents(v.value)) <= 1) sign = t.delta < 0 ? -1 : 1;
      rows.push({ date: t.date, description: desc(t), amounts: [(sign ?? 1) * v.value] });
    }
    return { signed: true, headers: ['Amount'], rows };
  }

  // ---- 6c. can't tell — hand the amount columns over as printed ---------------
  return {
    signed: false,
    headers: amountCols.map((_, k) => `Amount ${k + 1}`),
    rows: txns.map((t) => ({
      date: t.date,
      description: desc(t),
      amounts: amountCols.map((c) => t.vals[c]?.value ?? 0)
    }))
  };
}
