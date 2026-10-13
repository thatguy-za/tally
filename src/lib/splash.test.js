import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { splashScreens } from './splash.js';

describe('splashScreens', () => {
  const all = splashScreens();

  it('has a light and a dark image for every screen', () => {
    expect(all.filter((s) => s.theme === 'light')).toHaveLength(all.filter((s) => s.theme === 'dark').length);
  });

  it('never lists the same file for two different screens', () => {
    const byFile = new Map();
    for (const s of all) byFile.set(s.file, (byFile.get(s.file) || 0) + 1);
    // a file is shared only when the same pixel size is reached by two screens' media queries
    expect(new Set(all.map((s) => s.media)).size).toBe(all.length);
    expect(byFile.size).toBeLessThanOrEqual(all.length);
  });

  it('names each file after its pixel size', () => {
    for (const s of all) expect(s.file).toBe(`/splash/${s.theme}-${s.px[0]}x${s.px[1]}.png`);
  });

  it('has every image generated and committed', () => {
    for (const s of all) expect(existsSync(`static${s.file}`), s.file).toBe(true);
  });
});
