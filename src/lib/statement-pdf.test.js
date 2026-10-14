import { describe, it, expect } from 'vitest';
import { parseStatement, readDate } from './statement-pdf.js';

// Lay text out the way a PDF reader reports it: one item per cell, with an x
// position and a width. `right` makes a cell right-aligned at that edge, as
// amount columns are.
const W = 5; // width of one character
const cell = (str, x) => ({ str, x, width: str.length * W, height: 10 });
const right = (str, edge) => cell(str, edge - str.length * W);
function page(rows, top = 700, pitch = 14) {
  return rows.flatMap((r, i) => r.map((it) => ({ ...it, y: top - i * pitch })));
}

describe('readDate', () => {
  it('reads the formats banks print', () => {
    expect(readDate('2026-06-01 Coffee', 'dmy', null)).toMatchObject({ iso: '2026-06-01', rest: 'Coffee' });
    expect(readDate('01/06/2026', 'dmy', null).iso).toBe('2026-06-01');
    expect(readDate('06/01/2026', 'mdy', null).iso).toBe('2026-06-01');
    expect(readDate('01 Jun 2026', 'dmy', null).iso).toBe('2026-06-01');
    expect(readDate('Jun 1, 2026', 'dmy', null).iso).toBe('2026-06-01');
  });
  it('borrows the statement year when the line has only day and month', () => {
    expect(readDate('01 Jun Coffee', 'dmy', 2026)).toMatchObject({ iso: '2026-06-01', rest: 'Coffee' });
    expect(readDate('01/06 Coffee', 'dmy', 2026).iso).toBe('2026-06-01');
    expect(readDate('01 Jun', 'dmy', null)).toBeNull();
  });
  it('does not mistake other text for a date', () => {
    expect(readDate('Opening balance', 'dmy', 2026)).toBeNull();
    expect(readDate('31/02/2026', 'dmy', null)).toBeNull();
    expect(readDate('1234.50', 'dmy', 2026)).toBeNull();
  });
});

describe('parseStatement', () => {
  it('uses Debit and Credit header columns', () => {
    const p = page([
      [cell('Statement period 01/06/2026 to 30/06/2026', 40)],
      [cell('Date', 40), cell('Description', 110), right('Debit', 400), right('Credit', 460), right('Balance', 530)],
      [cell('01/06/2026', 40), cell('Coffee Shop', 110), right('10.00', 400), right('990.00', 530)],
      [cell('04/06/2026', 40), cell('Salary', 110), right('2,500.00', 460), right('3,490.00', 530)],
      [cell('05/06/2026', 40), cell('Groceries', 110), right('61.20', 400), right('3,428.80', 530)]
    ]);
    const r = parseStatement([p]);
    expect(r.signed).toBe(true);
    expect(r.rows).toEqual([
      { date: '2026-06-01', description: 'Coffee Shop', amounts: [-10] },
      { date: '2026-06-04', description: 'Salary', amounts: [2500] },
      { date: '2026-06-05', description: 'Groceries', amounts: [-61.2] }
    ]);
  });

  it('takes the sign from explicit minus signs in one amount column', () => {
    const p = page([
      [cell('Date', 40), cell('Details', 110), right('Amount', 400)],
      [cell('2026-06-01', 40), cell('Coffee', 110), right('-10.00', 400)],
      [cell('2026-06-04', 40), cell('Salary', 110), right('2500.00', 400)],
      [cell('2026-06-05', 40), cell('Fee', 110), right('(3.50)', 400)]
    ]);
    expect(parseStatement([p]).rows.map((r) => r.amounts[0])).toEqual([-10, 2500, -3.5]);
  });

  it('works out debit versus credit from the running balance when there is no header', () => {
    const p = page([
      [cell('Opening balance', 110), right('1,000.00', 530)],
      [cell('01/06/2026', 40), cell('Coffee Shop', 110), right('10.00', 400), right('990.00', 530)],
      [cell('04/06/2026', 40), cell('Salary', 110), right('2,500.00', 460), right('3,490.00', 530)],
      [cell('05/06/2026', 40), cell('Groceries', 110), right('61.20', 400), right('3,428.80', 530)],
      [cell('09/06/2026', 40), cell('Rent', 110), right('900.00', 400), right('2,528.80', 530)]
    ]);
    expect(parseStatement([p]).rows.map((r) => r.amounts[0])).toEqual([-10, 2500, -61.2, -900]);
  });

  it('takes one unsigned amount column’s sign from the balance, using the opening balance for the first row', () => {
    const p = page([
      [cell('Balance brought forward', 110), right('1,000.00', 530)],
      [cell('01/06/2026', 40), cell('Coffee Shop', 110), right('10.00', 400), right('990.00', 530)],
      [cell('04/06/2026', 40), cell('Salary', 110), right('2,500.00', 400), right('3,490.00', 530)],
      [cell('05/06/2026', 40), cell('Groceries', 110), right('61.20', 400), right('3,428.80', 530)]
    ]);
    expect(parseStatement([p]).rows.map((r) => r.amounts[0])).toEqual([-10, 2500, -61.2]);
  });

  it('reads day-and-month dates and joins a wrapped description', () => {
    const p = page([
      [cell('Statement 2026', 40)],
      [cell('01 Jun', 40), cell('Card purchase', 110), right('-10.00', 400)],
      [cell('Cape Town ZA', 110)],
      [cell('04 Jun', 40), cell('Salary', 110), right('2500.00', 400)]
    ]);
    expect(parseStatement([p]).rows).toEqual([
      { date: '2026-06-01', description: 'Card purchase Cape Town ZA', amounts: [-10] },
      { date: '2026-06-04', description: 'Salary', amounts: [2500] }
    ]);
  });

  it('leaves a distant footer line out of the last description', () => {
    const rows = [
      [cell('01/06/2026', 40), cell('Coffee', 110), right('-10.00', 400)]
    ];
    const pg = [...page(rows), ...[cell('Thank you for banking with us', 110)].map((it) => ({ ...it, y: 100 }))];
    expect(parseStatement([pg]).rows[0].description).toBe('Coffee');
  });

  it('follows the columns across pages', () => {
    const header = [cell('Date', 40), cell('Description', 110), right('Debit', 400), right('Credit', 460)];
    const p1 = page([header, [cell('01/06/2026', 40), cell('Coffee', 110), right('10.00', 400)]]);
    const p2 = page([header, [cell('04/06/2026', 40), cell('Salary', 110), right('2,500.00', 460)]]);
    expect(parseStatement([p1, p2]).rows.map((r) => r.amounts[0])).toEqual([-10, 2500]);
  });

  it('hands over the amount columns as printed when it cannot tell which is which', () => {
    const p = page([
      [cell('01/06/2026', 40), cell('Coffee', 110), right('10.00', 400)],
      [cell('04/06/2026', 40), cell('Salary', 110), right('2,500.00', 460)]
    ]);
    const r = parseStatement([p]);
    expect(r.signed).toBe(false);
    expect(r.headers).toEqual(['Amount 1', 'Amount 2']);
    expect(r.rows[1].amounts).toEqual([0, 2500]);
  });

  it('ignores lines that are not transactions', () => {
    const p = page([
      [cell('Page 1 of 2', 40)],
      [cell('Account number 1234 5678', 40)],
      [cell('Total debits', 110), right('71.20', 400)]
    ]);
    expect(parseStatement([p]).rows).toEqual([]);
  });
});

import { inferDateOrder } from './statement-pdf.js';

describe('date order inferred from the statement itself', () => {
  const lines = (...dates) => dates.map((d) => ({ cells: [{ text: d }] }));

  it('a day above 12 settles it, whatever order Settings has', () => {
    expect(inferDateOrder(lines('06/01', '06/13', '06/20'), 'dmy')).toBe('mdy');
    expect(inferDateOrder(lines('13/06', '20/06', '25/06'), 'mdy')).toBe('dmy');
  });

  it('prefers the reading that covers the shorter stretch of time', () => {
    expect(inferDateOrder(lines('06/01', '06/04', '06/09', '06/11'), 'dmy')).toBe('mdy');
    expect(inferDateOrder(lines('01/06', '04/06', '09/06', '11/06'), 'mdy')).toBe('dmy');
  });

  it('keeps the Settings order when nothing decides it', () => {
    expect(inferDateOrder(lines('03/04', '03/04', '03/04'), 'mdy')).toBe('mdy');
    expect(inferDateOrder(lines('01/02'), 'dmy')).toBe('dmy');
  });

  it('reads a US statement correctly when the user is set to day first', () => {
    const p = page([
      [cell('Statement 2026', 40)],
      [cell('Date', 40), cell('Description', 100), right('Amount', 400)],
      [cell('06/01', 40), cell('Coffee', 100), right('-10.00', 400)],
      [cell('06/13', 40), cell('Rent', 100), right('-900.00', 400)],
      [cell('06/28', 40), cell('Salary', 100), right('2,500.00', 400)]
    ]);
    expect(parseStatement([p], { dateOrder: 'dmy' }).rows.map((r) => r.date)).toEqual(['2026-06-01', '2026-06-13', '2026-06-28']);
  });
});

describe('signs on card statements and other single-column layouts', () => {
  it('on a card, plain amounts are spending and CR marks a payment', () => {
    const p = page([
      [cell('Card statement  Credit limit 5,000.00  2026', 40)],
      [cell('Date', 40), cell('Description', 100), right('Amount', 400)],
      [cell('01/06/2026', 40), cell('Coffee', 100), right('4.50', 400)],
      [cell('02/06/2026', 40), cell('Payment thank you', 100), right('100.00 CR', 400)],
      [cell('03/06/2026', 40), cell('Shop', 100), right('20.00', 400)]
    ]);
    expect(parseStatement([p]).rows.map((r) => r.amounts[0])).toEqual([-4.5, 100, -20]);
  });

  it('with no card wording, when only credits are marked the rest are debits', () => {
    const p = page([
      [cell('Date', 40), cell('Description', 100), right('Amount', 400)],
      [cell('01/06/2026', 40), cell('Coffee', 100), right('4.50', 400)],
      [cell('02/06/2026', 40), cell('Salary', 100), right('100.00 CR', 400)],
      [cell('03/06/2026', 40), cell('Shop', 100), right('20.00', 400)]
    ]);
    expect(parseStatement([p]).rows.map((r) => r.amounts[0])).toEqual([-4.5, 100, -20]);
  });

  it('the balance corrects a minus sign that a scan lost', () => {
    const p = page([
      [cell('Opening balance', 100), right('1,000.00', 540)],
      [cell('01/06/2026', 40), cell('Coffee', 100), right('10.00', 440), right('990.00', 540)],
      [cell('02/06/2026', 40), cell('Rent', 100), right('-300.00', 440), right('690.00', 540)],
      [cell('03/06/2026', 40), cell('Pay', 100), right('500.00', 440), right('1,190.00', 540)]
    ]);
    expect(parseStatement([p]).rows.map((r) => r.amounts[0])).toEqual([-10, -300, 500]);
  });
});

describe('rows and layouts real statements have', () => {
  it('a transaction with no date of its own takes the date above it', () => {
    const p = page([
      [cell('Date', 40), cell('Description', 100), right('Paid out', 400), right('Paid in', 470), right('Balance', 540)],
      [cell('01/06/2026', 40), cell('Coffee', 100), right('10.00', 400), right('990.00', 540)],
      [cell('Tea', 100), right('5.00', 400), right('985.00', 540)],
      [cell('02/06/2026', 40), cell('Salary', 100), right('500.00', 470), right('1,485.00', 540)]
    ]);
    expect(parseStatement([p]).rows).toEqual([
      { date: '2026-06-01', description: 'Coffee', amounts: [-10] },
      { date: '2026-06-01', description: 'Tea', amounts: [-5] },
      { date: '2026-06-02', description: 'Salary', amounts: [500] }
    ]);
  });

  it('does not take a totals line for a transaction', () => {
    const p = page([
      [cell('01/06/2026', 40), cell('Coffee', 100), right('-10.00', 400)],
      [cell('Total spent', 100), right('10.00', 400)],
      [cell('02/06/2026', 40), cell('Rent', 100), right('-900.00', 400)]
    ]);
    expect(parseStatement([p]).rows.map((r) => r.description)).toEqual(['Coffee', 'Rent']);
  });

  it('a stray speck at the start of a row does not hide its date', () => {
    const p = page([
      [cell('.', 8), cell('01/06/2026', 40), cell('Coffee', 100), right('-10.00', 400)],
      [cell(':', 8), cell('02/06/2026', 40), cell('Rent', 100), right('-900.00', 400)]
    ]);
    expect(parseStatement([p]).rows).toHaveLength(2);
  });

  it('reads a statement listed newest first, using the running balance', () => {
    const p = page([
      [cell('Date', 40), cell('Description', 100), right('Amount', 440), right('Balance', 540)],
      [cell('03/06/2026', 40), cell('Pay', 100), right('500.00', 440), right('1,190.00', 540)],
      [cell('02/06/2026', 40), cell('Rent', 100), right('300.00', 440), right('690.00', 540)],
      [cell('01/06/2026', 40), cell('Coffee', 100), right('10.00', 440), right('990.00', 540)],
      [cell('Balance brought forward', 100), right('1,000.00', 540)]
    ]);
    expect(parseStatement([p]).rows.map((r) => r.amounts[0])).toEqual([500, -300, -10]);
  });

  it('understands Dutch column headings', () => {
    const p = page([
      [cell('Datum', 40), cell('Omschrijving', 100), right('Bedrag', 440), right('Saldo', 540)],
      [cell('01-06-2026', 40), cell('Koffie', 100), right('-4,50', 440), right('995,50', 540)],
      [cell('02-06-2026', 40), cell('Salaris', 100), right('2.500,00', 440), right('3.495,50', 540)]
    ]);
    expect(parseStatement([p]).rows.map((r) => r.amounts[0])).toEqual([-4.5, 2500]);
  });

  it('whole-number amounts are repaired only for a scan, and only in an amount column', () => {
    const rows = [
      [cell('Date', 40), cell('Description', 100), right('Amount', 440), right('Balance', 540)],
      [cell('01/06/2026', 40), cell('Coffee', 100), right('10.00 DR', 440), right('990.00 CR', 540)],
      [cell('02/06/2026', 40), cell('Rent', 100), right('31799 CR', 440), right('1,307.99 CR', 540)],
      [cell('03/06/2026', 40), cell('Tea', 100), right('5.00 DR', 440), right('1,302.99 CR', 540)]
    ];
    expect(parseStatement([page(rows)]).rows).toHaveLength(2);
    expect(parseStatement([page(rows)], { ocr: true }).rows.map((r) => r.amounts[0])).toEqual([-10, 317.99, -5]);
  });
});
