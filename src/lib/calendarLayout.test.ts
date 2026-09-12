import { describe, expect, it } from 'vitest';
import { addDays, buildColorMap, monthWeeks, weekBars, type CalendarItem } from './calendarLayout';

const item = (id: string, startDate: string, endDate: string, kind = 'Gyakorlat'): CalendarItem => ({
  id, source: 'exercise', name: id, kind, dutyType: '', startDate, endDate, location: '', status: 'Tervezett', peopleSummary: '', peopleCount: 0,
});

describe('monthWeeks', () => {
  it('hétfővel kezd, 6 hetet ad, a szomszéd hónapok napjaival', () => {
    const weeks = monthWeeks(2026, 8); // 2026. szeptember: 1-je kedd
    expect(weeks).toHaveLength(6);
    expect(weeks[0][0]).toBe('2026-08-31');
    expect(weeks[0][1]).toBe('2026-09-01');
    expect(weeks[5][6]).toBe('2026-10-11');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });
});

describe('weekBars', () => {
  const week = monthWeeks(2026, 8)[1]; // 2026-09-07 (H) … 2026-09-13 (V)

  it('a több napos művelet egy folytonos sáv a kezdettől a végéig', () => {
    const bars = weekBars(week, [item('a', '2026-09-08', '2026-09-10')]);
    expect(bars).toEqual([expect.objectContaining({ startCol: 1, span: 3, lane: 0, continuesLeft: false, continuesRight: false })]);
  });

  it('a héten túlnyúló sáv a hét szélén folytatódik-jelet kap', () => {
    const bars = weekBars(week, [item('a', '2026-09-05', '2026-09-20')]);
    expect(bars[0]).toMatchObject({ startCol: 0, span: 7, continuesLeft: true, continuesRight: true });
  });

  it('az átfedő elemek külön sávot (lane) kapnak, a nem átfedők osztoznak', () => {
    const bars = weekBars(week, [
      item('a', '2026-09-07', '2026-09-09'),
      item('b', '2026-09-08', '2026-09-08'),
      item('c', '2026-09-10', '2026-09-11'),
    ]);
    const byId = Object.fromEntries(bars.map((b) => [b.item.id, b]));
    expect(byId.a.lane).toBe(0);
    expect(byId.b.lane).toBe(1);
    expect(byId.c.lane).toBe(0);
  });

  it('a hétre nem eső elem kimarad; időpontos (T-s) dátum is működik', () => {
    const bars = weekBars(week, [item('x', '2026-09-20', '2026-09-21'), item('y', '2026-09-09T08:00', '2026-09-09T16:00')]);
    expect(bars.map((b) => b.item.id)).toEqual(['y']);
  });
});

describe('buildColorMap', () => {
  it('a gyakori típusok fix színt kapnak, a többi különbözőt', () => {
    const map = buildColorMap(['Gyakorlat', 'Őrszolgálat', 'Ügyelet', 'Lövészet', 'Kiképzés']);
    expect(map.get('Gyakorlat')).toBe('bg-sky-600');
    expect(new Set(map.values()).size).toBe(5);
  });
});
