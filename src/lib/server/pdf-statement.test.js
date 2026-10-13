import { describe, it, expect } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { pdfToCsv } from './pdf-statement.js';

/**
 * A minimal real PDF: monospaced text placed at exact coordinates, so the
 * columns of a statement line up the way they do in a bank's own PDF.
 * @param {{x:number,y:number,t:string}[][]} pages
 */
function makePdf(pages) {
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>'];
  const pageIds = [];
  for (const items of pages) {
    const body =
      'BT /F1 10 Tf\n' +
      items.map(({ x, y, t }) => `1 0 0 1 ${x} ${y} Tm (${t.replace(/[\\()]/g, '\\$&')}) Tj\n`).join('') +
      'ET';
    objs.push(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${objs.length} 0 R >>`);
    pageIds.push(objs.length);
  }
  objs[1] = `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  let out = '%PDF-1.4\n';
  const offsets = objs.map((o, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

/**
 * A PDF that is only a picture of a statement — no text layer — the way a
 * scanner produces one: a JPEG of a page with the statement drawn on it.
 */
function makeScanPdf(draw) {
  const sc = 2;
  const cv = createCanvas(612 * sc, 792 * sc);
  const g = cv.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#111';
  g.font = `${10 * sc}px sans-serif`;
  draw({
    text: (t, x, y) => g.fillText(t, x * sc, y * sc),
    rtext: (t, edge, y) => g.fillText(t, edge * sc - g.measureText(t).width, y * sc)
  });
  const jpg = cv.toBuffer('image/jpeg', 80);
  const content = 'q 612 0 0 792 0 0 cm /Im0 Do Q';
  const parts = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>'),
    Buffer.from(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`),
    Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${cv.width} /Height ${cv.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`),
      jpg,
      Buffer.from('\nendstream')
    ])
  ];
  let out = Buffer.from('%PDF-1.4\n');
  const offsets = parts.map((o, i) => {
    const at = out.length;
    out = Buffer.concat([out, Buffer.from(`${i + 1} 0 obj\n`), o, Buffer.from('\nendobj\n')]);
    return at;
  });
  const xref = out.length;
  const tail =
    `xref\n0 ${parts.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('') +
    `trailer\n<< /Size ${parts.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.concat([out, Buffer.from(tail)]));
}

const CW = 6; // Courier at 10pt
const at = (x, y, t) => ({ x, y, t });
const right = (edge, y, t) => at(edge - t.length * CW, y, t);
const txn = (y, date, desc, { debit, credit, bal }) => [
  at(40, y, date),
  at(110, y, desc),
  ...(debit ? [right(400, y, debit)] : []),
  ...(credit ? [right(460, y, credit)] : []),
  ...(bal ? [right(540, y, bal)] : [])
];
const header = (y) => [at(40, y, 'Date'), at(110, y, 'Description'), right(400, y, 'Debit'), right(460, y, 'Credit'), right(540, y, 'Balance')];

describe('pdfToCsv', () => {
  it('reads a real two-page PDF statement into a CSV', async () => {
    const page1 = [
      at(40, 750, 'ACME BANK  Statement period 01 Jun 2026 to 30 Jun 2026'),
      ...header(720),
      ...txn(700, '01 Jun', 'Coffee Shop', { debit: '10.00', bal: '990.00' }),
      ...txn(686, '04 Jun', 'Salary June', { credit: '2,500.00', bal: '3,490.00' }),
      ...txn(672, '05 Jun', 'Groceries', { debit: '61.20', bal: '3,428.80' }),
      at(110, 660, 'Cape Town ZA'),
      at(110, 100, 'Thank you for banking with us')
    ];
    const page2 = [...header(750), ...txn(730, '09 Jun', 'Rent', { debit: '900.00', bal: '2,528.80' })];

    const { csv, rows } = await pdfToCsv(makePdf([page1, page2]), 'dmy');
    expect(rows).toBe(4);
    expect(csv.trim().split(/\r?\n/)).toEqual([
      'date,description,Amount',
      '2026-06-01,Coffee Shop,-10',
      '2026-06-04,Salary June,2500',
      '2026-06-05,Groceries Cape Town ZA,-61.2',
      '2026-06-09,Rent,-900'
    ]);
  });

  it('reads a scanned PDF (no text layer) with OCR, on this server', async () => {
    const pdf = makeScanPdf(({ text, rtext }) => {
      text('ACME BANK   Statement period 01 Jun 2026 to 30 Jun 2026', 40, 60);
      text('Date', 40, 100);
      text('Description', 110, 100);
      rtext('Debit', 400, 100);
      rtext('Credit', 460, 100);
      rtext('Balance', 540, 100);
      [
        ['01 Jun', 'Coffee Shop', '10.00', '', '990.00'],
        ['04 Jun', 'Salary June', '', '2,500.00', '3,490.00'],
        ['05 Jun', 'Groceries', '61.20', '', '3,428.80']
      ].forEach(([d, desc, debit, credit, bal], i) => {
        const y = 130 + i * 18;
        text(d, 40, y);
        text(desc, 110, y);
        if (debit) rtext(debit, 400, y);
        if (credit) rtext(credit, 460, y);
        rtext(bal, 540, y);
      });
    });
    const { csv, ocr } = await pdfToCsv(pdf, 'dmy');
    expect(ocr).toBe(true);
    expect(csv.trim().split(/\r?\n/)).toEqual([
      'date,description,Amount',
      '2026-06-01,Coffee Shop,-10',
      '2026-06-04,Salary June,2500',
      '2026-06-05,Groceries,-61.2'
    ]);
  }, 60_000);

  it('says so when a blank scan has nothing to read', async () => {
    await expect(pdfToCsv(makeScanPdf(() => {}), 'dmy')).rejects.toThrow(/no text could be made out/);
  }, 60_000);

  it('says so when no transactions are found', async () => {
    await expect(pdfToCsv(makePdf([[at(40, 700, 'Hello, this is a letter.')]]), 'dmy')).rejects.toThrow(/no transactions/);
  });

  it('says so when the file is not a readable PDF', async () => {
    await expect(pdfToCsv(new TextEncoder().encode('%PDF-1.4 garbage'), 'dmy')).rejects.toThrow(/could not be opened/);
  });
});
