import { createRequire } from 'node:module';
import path from 'node:path';
import { getDocumentProxy, renderPageAsImage } from 'unpdf';

/**
 * OCR for scanned PDF statements, run entirely on this server: pages are drawn
 * to images with a local canvas and read by tesseract.js (WASM). The English
 * language data ships in node_modules and is loaded from disk — `langPath` is
 * a directory, so the engine never reaches for its default download URL.
 */

const MAX_OCR_PAGES = 10;
// ~220 dpi: small digits and decimal points survive; 150 dpi loses them
const SCALE = 3;

// OCR is heavy (a worker is ~100–200 MB and a page takes seconds), so it runs
// one statement at a time, and a second request waits rather than piling on
let queue = Promise.resolve();
let waiting = 0;
const MAX_WAITING = 2;

/** An expected problem with the document, safe to show the user as is. */
export class OcrError extends Error {}

const require = createRequire(import.meta.url);
const langPath = () => path.join(path.dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int');

/**
 * Read the words off every page of a scanned PDF.
 * @param {Uint8Array} bytes
 * @returns {Promise<{str:string,x:number,y:number,width:number,height:number}[][]>}
 *   one array of positioned words per page, in PDF points with y up — the same
 *   shape the text-layer reader produces, so one parser handles both
 */
export function ocrPdf(bytes) {
  if (waiting >= MAX_WAITING) return Promise.reject(new OcrError('another statement is being read right now — try again in a minute.'));
  waiting++;
  const run = queue.then(() => doOcr(bytes));
  queue = run.catch(() => {}).then(() => { waiting--; });
  return run;
}

async function doOcr(bytes) {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  if (pdf.numPages > MAX_OCR_PAGES)
    throw new OcrError(`it is a scan of ${pdf.numPages} pages and the limit for scanned PDFs is ${MAX_OCR_PAGES}. Upload fewer pages at a time.`);

  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, { langPath: langPath(), gzip: true, cacheMethod: 'none' });
  try {
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const png = await renderPageAsImage(pdf, n, { canvasImport: () => import('@napi-rs/canvas'), scale: SCALE });
      const pageH = (await pdf.getPage(n)).getViewport({ scale: 1 }).height;
      const { data } = await worker.recognize(Buffer.from(png), {}, { blocks: true });
      const words = (data.blocks || []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)));
      pages.push(
        words
          .filter((w) => w.text.trim())
          .map((w) => ({
            str: w.text,
            x: w.bbox.x0 / SCALE,
            // the word's vertical centre, flipped to PDF's y-up
            y: pageH - (w.bbox.y0 + w.bbox.y1) / 2 / SCALE,
            width: (w.bbox.x1 - w.bbox.x0) / SCALE,
            height: (w.bbox.y1 - w.bbox.y0) / SCALE
          }))
      );
    }
    return pages;
  } finally {
    await worker.terminate();
  }
}
