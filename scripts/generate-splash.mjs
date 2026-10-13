// Draws the iOS launch images listed in src/lib/splash.js into static/splash/.
// Run `node scripts/generate-splash.mjs` after changing the list or the icon;
// the PNGs are committed, so this is not part of the build.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { splashScreens, SPLASH_COLORS } from '../src/lib/splash.js';

mkdirSync('static/splash', { recursive: true });
const icon = await loadImage('static/icon-512.png');
const seen = new Set();
let bytes = 0;
for (const s of splashScreens()) {
  if (seen.has(s.file)) continue;
  seen.add(s.file);
  const [w, h] = s.px;
  const cv = createCanvas(w, h);
  const g = cv.getContext('2d');
  g.fillStyle = SPLASH_COLORS[s.theme];
  g.fillRect(0, 0, w, h);
  // the icon, centred, a fifth of the short side
  const size = Math.round(Math.min(w, h) * 0.2);
  g.drawImage(icon, Math.round((w - size) / 2), Math.round((h - size) / 2), size, size);
  const png = cv.toBuffer('image/png');
  writeFileSync(`static${s.file.replace('/splash', '/splash')}`, png);
  bytes += png.length;
}
console.log(`${seen.size} images, ${(bytes / 1024).toFixed(0)} KB`);
