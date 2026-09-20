import { describe, it, expect } from 'vitest';
import { createZip, readZip } from './zip.js';

describe('zip', () => {
  it('round-trips several files, including empty and non-ASCII content', () => {
    const files = [
      { name: 'transactions.csv', data: 'date,amount\r\n2026-01-01,10.50\r\n' },
      { name: 'categories.csv', data: 'name\r\n"Coffee, tea"\r\n' },
      { name: 'empty.csv', data: '' },
      { name: 'unicode.csv', data: 'name\r\ncafé — €12\r\n' }
    ];

    const zipped = createZip(files);
    const back = readZip(zipped);

    expect(back).toHaveLength(files.length);
    for (const f of files) {
      const match = back.find((e) => e.name === f.name);
      expect(match).toBeDefined();
      expect(match.data.toString('utf8')).toBe(f.data);
    }
  });

  it('throws a clear error for a non-zip buffer', () => {
    expect(() => readZip(Buffer.from('not a zip'))).toThrow('Not a valid zip file.');
  });
});
