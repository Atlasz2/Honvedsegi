import { describe, expect, it } from 'vitest';
import { isValidHungarianPhone, normalizeHungarianPhone } from './phone';

describe('normalizeHungarianPhone', () => {
  it('a megszokott bevitel mindegyik alakját ugyanarra hozza', () => {
    const expected = '+36 20 123 4567';
    for (const input of ['06201234567', '+36201234567', '36201234567', '20 123 4567', '06-20-123-4567']) {
      expect(normalizeHungarianPhone(input)).toBe(expected);
    }
  });

  it('részleges szám gépelése közben értelmes köztes alakot ad', () => {
    expect(normalizeHungarianPhone('06')).toBe('');
    expect(normalizeHungarianPhone('0620')).toBe('+36 20');
    expect(normalizeHungarianPhone('062012')).toBe('+36 20 12');
    expect(normalizeHungarianPhone('06201234')).toBe('+36 20 123 4');
  });

  it('a kilenc számjegy fölötti részt eldobja', () => {
    expect(normalizeHungarianPhone('062012345678999')).toBe('+36 20 123 4567');
  });

  it('üres és értelmezhetetlen bevitelre üres sztringet ad', () => {
    expect(normalizeHungarianPhone('')).toBe('');
    expect(normalizeHungarianPhone('   ')).toBe('');
    expect(normalizeHungarianPhone('nincs benne szám')).toBe('');
  });

  it('idempotens: a már formázott számot nem rontja el', () => {
    const formatted = normalizeHungarianPhone('06201234567');
    expect(normalizeHungarianPhone(formatted)).toBe(formatted);
  });
});

describe('isValidHungarianPhone', () => {
  it('a teljes, formázott számot elfogadja', () => {
    expect(isValidHungarianPhone('+36 20 123 4567')).toBe(true);
  });

  it('a részleges vagy rosszul tagolt számot elutasítja', () => {
    for (const value of ['+36 20 123', '+36201234567', '06 20 123 4567', '']) {
      expect(isValidHungarianPhone(value)).toBe(false);
    }
  });
});
