/**
 * iOS shows a blank screen while an installed web app starts, unless it is
 * given a launch image that matches the exact screen size — and in dark mode
 * that blank screen is a white flash. This lists every current iPhone and iPad
 * screen (CSS points + pixel ratio) so a light and a dark image can be made
 * for each (scripts/generate-splash.mjs) and linked from the layout.
 */

/** [width, height] in CSS points, portrait, and the device pixel ratio. */
const PHONES = [
  [440, 956, 3], // 16 Pro Max
  [430, 932, 3], // 14/15 Plus, 14 Pro Max, 15 Pro Max, 16 Plus
  [428, 926, 3], // 12/13 Pro Max, 14 Plus
  [402, 874, 3], // 16 Pro
  [393, 852, 3], // 14 Pro, 15, 15 Pro, 16
  [390, 844, 3], // 12, 13, 14, 12/13 Pro
  [414, 896, 3], // XS Max, 11 Pro Max
  [414, 896, 2], // XR, 11
  [375, 812, 3], // X, XS, 11 Pro, 12/13 mini
  [414, 736, 3], // 6/7/8 Plus
  [375, 667, 2] // 6/7/8, SE 2/3
];
const PADS = [
  [1024, 1366, 2], // 12.9"
  [834, 1194, 2], // 11"
  [820, 1180, 2], // Air, 10th gen
  [834, 1112, 2], // 10.5"
  [810, 1080, 2], // 10.2"
  [744, 1133, 2] // mini
];

export const SPLASH_COLORS = { light: '#f6f3ec', dark: '#16150f' };

/**
 * @typedef {{ theme: 'light'|'dark', file: string, px: [number, number], media: string }} Splash
 * @returns {Splash[]}
 */
export function splashScreens() {
  const out = [];
  const add = (w, h, r, orientation) => {
    // a landscape launch swaps the screen's dimensions
    const [pw, ph] = orientation === 'portrait' ? [w, h] : [h, w];
    for (const theme of /** @type {const} */ (['light', 'dark'])) {
      const px = /** @type {[number, number]} */ ([pw * r, ph * r]);
      out.push({
        theme,
        px,
        file: `/splash/${theme}-${px[0]}x${px[1]}.png`,
        media:
          `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r})` +
          ` and (orientation: ${orientation}) and (prefers-color-scheme: ${theme})`
      });
    }
  };
  for (const [w, h, r] of PHONES) add(w, h, r, 'portrait');
  for (const [w, h, r] of PADS) {
    add(w, h, r, 'portrait');
    add(w, h, r, 'landscape');
  }
  // two devices can share a pixel size (e.g. 414x896@3 reached from two lists)
  return out.filter((s, i) => out.findIndex((t) => t.file === s.file && t.media === s.media) === i);
}
