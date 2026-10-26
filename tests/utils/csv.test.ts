import { describe, expect, it } from 'vitest';
import { toCsv } from '../../src/utils/csv.js';

describe('toCsv', () => {
  it('writes rows with CRLF line endings', () => {
    expect(
      toCsv(
        ['a', 'b'],
        [
          [1, 'x'],
          [null, undefined],
        ],
      ),
    ).toBe('a,b\r\n1,x\r\n,\r\n');
  });

  it('quotes commas, quotes and newlines', () => {
    expect(toCsv(['v'], [['Smith, Jo'], ['say "hi"'], ['two\nlines']])).toBe(
      'v\r\n"Smith, Jo"\r\n"say ""hi"""\r\n"two\nlines"\r\n',
    );
  });

  it('defuses cells that spreadsheets would run as formulas', () => {
    const csv = toCsv(['v'], [['=HYPERLINK("http://x")'], ['+1'], ['-2'], ['@SUM(A1)'], ['ok=1']]);
    expect(csv.split('\r\n').slice(1, -1)).toEqual([
      `"'=HYPERLINK(""http://x"")"`,
      "'+1",
      "'-2",
      "'@SUM(A1)",
      'ok=1',
    ]);
  });
});
