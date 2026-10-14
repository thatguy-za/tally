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
export function ocrPdf(bytes, pageNumbers) {
  if (waiting >= MAX_WAITING) return Promise.reject(new OcrError('another statement is being read right now — try again in a minute.'));
  waiting++;
  const run = queue.then(() => doOcr(bytes, pageNumbers));
  queue = run.catch(() => {}).then(() => { waiting--; });
  return run;
}

async function doOcr(bytes, pageNumbers) {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const wanted = pageNumbers ?? Array.from({ length: pdf.numPages }, (_, i) => i + 1);
  if (wanted.length > MAX_OCR_PAGES)
    throw new OcrError(`it has ${wanted.length} scanned pages and the limit is ${MAX_OCR_PAGES}. Upload fewer pages at a time.`);

  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, { langPath: langPath(), gzip: true, cacheMethod: 'none' });
  try {
    const pages = [];
    for (const n of wanted) {
      const png = await renderPageAsImage(pdf, n, { canvasImport: () => import('@napi-rs/canvas'), scale: SCALE });
      const pageH = (await pdf.getPage(n)).getViewport({ scale: 1 }).height;
      const { data } = await worker.recognize(Buffer.from(png), {}, { blocks: true });
      const lines = (data.blocks || []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
      const slope = pageSlope(lines);
      const centreX = (await pdf.getPage(n)).getViewport({ scale: SCALE }).width / 2;
      const words = lines.flatMap((l) => l.words);
      pages.push(
        words
          .filter((w) => w.text.trim())
          .map((w) => {
            // straighten a tilted scan: a row's date and amount can sit several
            // points apart in height from one side of the page to the other
            const cy = (w.bbox.y0 + w.bbox.y1) / 2 - slope * ((w.bbox.x0 + w.bbox.x1) / 2 - centreX);
            return {
              str: w.text,
              x: w.bbox.x0 / SCALE,
              // the word's vertical centre, flipped to PDF's y-up
              y: pageH - cy / SCALE,
              width: (w.bbox.x1 - w.bbox.x0) / SCALE,
              height: (w.bbox.y1 - w.bbox.y0) / SCALE
            };
          })
      );
    }
    return pages;
  } finally {
    await worker.terminate();
  }
}

/**
 * How much the page is tilted: the median slope (dy per dx, y down) of the
 * longer lines of text, each fitted by least squares through its words. A
 * scanner or a phone rarely holds the page perfectly straight, and even half a
 * degree moves one end of a row a few points off the other. Anything steeper
 * than about 6 degrees is more likely a bad reading than a tilt, so is ignored.
 * @param {{ words: { bbox: {x0:number,y0:number,x1:number,y1:number} }[] }[]} lines
 */
export function pageSlope(lines) {
  const slopes = [];
  for (const l of lines) {
    const pts = (l.words || []).map((w) => [(w.bbox.x0 + w.bbox.x1) / 2, (w.bbox.y0 + w.bbox.y1) / 2]);
    if (pts.length < 4) continue;
    const xs = pts.map((p) => p[0]);
    if (Math.max(...xs) - Math.min(...xs) < 250) continue;
    const mx = xs.reduce((a, b) => a + b, 0) / pts.length;
    const my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const sxx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
    if (!sxx) continue;
    slopes.push(pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / sxx);
  }
  if (!slopes.length) return 0;
  slopes.sort((a, b) => a - b);
  const med = slopes[Math.floor(slopes.length / 2)];
  return Math.abs(med) <= 0.1 ? med : 0;
}
