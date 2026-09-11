// ============================================================
// File: src/__tests__/unit/csv.test.ts
// Purpose: Unit tests for the CSV helpers in src/lib/csv.ts
//          (toCsv/parseCsv round-trip, quoting rules, downloadCsv's
//          DOM/Blob side effects). Added as part of closing the CI
//          coverage gate (see claude/typecheck... / coverage fix docs)
//          - these exercise real behavior, not stubs written to
//          inflate a number.
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { toCsv, parseCsv, downloadCsv } from '../../lib/csv';

describe('toCsv', () => {
  it('joins simple rows with commas and CRLF between rows', () => {
    expect(toCsv([['a', 'b'], ['c', 'd']])).toBe('a,b\r\nc,d');
  });

  it('quotes a cell containing a comma', () => {
    expect(toCsv([['a,b', 'c']])).toBe('"a,b",c');
  });

  it('quotes a cell containing a double quote and doubles it', () => {
    expect(toCsv([['say "hi"']])).toBe('"say ""hi"""');
  });

  it('quotes a cell containing a newline', () => {
    expect(toCsv([['line1\nline2']])).toBe('"line1\nline2"');
  });

  it('leaves plain numeric and text cells unquoted', () => {
    expect(toCsv([[1, 'plain', 2.5]])).toBe('1,plain,2.5');
  });

  it('renders null/undefined cells as empty strings', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(toCsv([[null as any, undefined as any, 'x']])).toBe(',,x');
  });

  it('handles an empty rows array', () => {
    expect(toCsv([])).toBe('');
  });
});

describe('parseCsv', () => {
  it('parses a simple two-row CSV', () => {
    expect(parseCsv('a,b\nc,d')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\nc,d')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('handles a lone CR as a line ending', () => {
    expect(parseCsv('a,b\rc,d')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('parses a quoted field containing a comma', () => {
    expect(parseCsv('"a,b",c')).toEqual([['a,b', 'c']]);
  });

  it('parses a quoted field with an escaped (doubled) quote', () => {
    expect(parseCsv('"say ""hi""",x')).toEqual([['say "hi"', 'x']]);
  });

  it('parses a quoted field containing an embedded newline', () => {
    expect(parseCsv('"line1\nline2",x')).toEqual([['line1\nline2', 'x']]);
  });

  it('drops a trailing blank line', () => {
    expect(parseCsv('a,b\nc,d\n')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('round-trips through toCsv and back', () => {
    const original = [
      ['name', 'notes'],
      ['Widget, Deluxe', 'has a "special" finish'],
      ['Plain Widget', 'multi\nline note'],
    ];
    expect(parseCsv(toCsv(original))).toEqual(original);
  });

  it('returns an empty array for an empty string', () => {
    expect(parseCsv('')).toEqual([]);
  });
});

describe('downloadCsv', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates an object URL, clicks a temporary anchor, then revokes it', () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    const revokeObjectURL = vi.fn();
    // jsdom does not implement these - stub them for the duration of the test.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (URL as any).createObjectURL = createObjectURL;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (URL as any).revokeObjectURL = revokeObjectURL;

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    vi.useFakeTimers();
    downloadCsv('export.csv', 'a,b\nc,d');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    // The anchor is removed and the URL revoked on the next tick, not
    // synchronously - see the bug-fix comment in csv.ts.
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    vi.useRealTimers();
  });
});
