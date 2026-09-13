import { describe, expect, it } from 'vitest';
import { activeNavPath } from './navigation';

const NAV = ['/', '/attekintes', '/kozos-naptar', '/operations', '/settings'];

describe('activeNavPath', () => {
  it('menüpont nélküli oldalon is világít valami', () => {
    expect(activeNavPath('/riportok', NAV)).toBe('/attekintes');
    expect(activeNavPath('/announcements', NAV)).toBe('/attekintes');
    expect(activeNavPath('/kovetelmenyek', NAV)).toBe('/operations');
    expect(activeNavPath('/calendar/2026', NAV)).toBe('/kozos-naptar');
  });
  it('a saját menüpont és a gyökér működik', () => {
    expect(activeNavPath('/', NAV)).toBe('/');
    expect(activeNavPath('/operations', NAV)).toBe('/operations');
    expect(activeNavPath('/settings/x', NAV)).toBe('/settings');
    expect(activeNavPath('/ismeretlen', NAV)).toBe('/');
  });
});
