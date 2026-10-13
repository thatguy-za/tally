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
