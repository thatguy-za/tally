import { extractTextItems, getDocumentProxy } from 'unpdf';
import { toCsv } from '$lib/csv.js';
import { parseStatement } from '$lib/statement-pdf.js';
import { ocrPdf, OcrError } from '$lib/server/ocr.js';

const MAX_PAGES = 60;

/**
 * Read a PDF bank statement on this server — nothing is sent anywhere — and
 * return it as CSV text for the normal review screen.
 * @param {Uint8Array} bytes
 * @param {'dmy'|'mdy'|'ymd'} dateOrder
 * @returns {Promise<{ csv: string, rows: number, signed: boolean, ocr: boolean }>}
 * @throws {Error} with a user-facing message when nothing usable is found
 */
export async function pdfToCsv(bytes, dateOrder) {
  let pages;
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    if (pdf.numPages > MAX_PAGES) throw new Error(`it has more than ${MAX_PAGES} pages.`);
    ({ items: pages } = await extractTextItems(pdf));
  } catch (e) {
    if (/pages\.$/.test(e?.message)) throw e;
    throw new Error('it could not be opened — it may be damaged or password-protected.');
  }

  // no selectable text means a scan or a photo — read it with OCR, still on
  // this server
  let ocr = false;
  // pages with no text at all are pictures — a whole scan, or a scanned page
  // stitched into an otherwise ordinary statement. Only those are read with OCR.
  const blank = pages.map((p, i) => (p.some((it) => it.str.trim()) ? 0 : i + 1)).filter(Boolean);
  if (blank.length) {
    let read;
    try {
      read = await ocrPdf(bytes, blank);
    } catch (e) {
      if (e instanceof OcrError) throw e;
      console.error('OCR failed', e);
      throw new Error('it is a scan and the OCR engine on this server could not read it.');
    }
    blank.forEach((n, k) => { pages[n - 1] = read[k]; });
    ocr = true;
    if (blank.length === pages.length && !pages.some((p) => p.length))
      throw new Error('it looks like a scan, but no text could be made out. Try a clearer or straighter copy, or export a CSV from your bank.');
  }

  const { rows, headers, signed } = parseStatement(pages, { dateOrder, ocr });
  if (!rows.length)
    throw new Error('no transactions were found in it. Is it a statement with dated lines and amounts? A CSV export from your bank is the reliable alternative.');

  const flat = rows.map((r) => ({
    date: r.date,
    description: r.description,
    ...Object.fromEntries(headers.map((h, i) => [h, r.amounts[i]]))
  }));
  return { ocr, csv: toCsv(flat, ['date', 'description', ...headers]), rows: rows.length, signed };
}
