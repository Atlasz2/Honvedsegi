import { describe, expect, it } from 'vitest';
import { rankWeight, shortRank } from './rank';

describe('rankWeight', () => {
  it('a hivatalos létra szerint rendez', () => {
    expect(rankWeight('Honvéd')).toBeLessThan(rankWeight('Tizedes'));
    expect(rankWeight('Tizedes')).toBeLessThan(rankWeight('Őrmester'));
    expect(rankWeight('Őrmester')).toBeLessThan(rankWeight('Százados'));
    expect(rankWeight('Százados')).toBeLessThan(rankWeight('Ezredes'));
  });

  it('ékezet és kisbetű/nagybetű nem számít', () => {
    expect(rankWeight('őrmester')).toBe(rankWeight('Ormester'));
    expect(rankWeight('  ŐRMESTER  ')).toBe(rankWeight('Őrmester'));
  });

  it('a migráció előtti "Közkatona" ugyanoda esik, mint a "Honvéd"', () => {
    // A seed korábban Közkatona-t is használt; a régi adatokat ugyanúgy kell
    // rendezni, különben a lista aljára esnének.
    expect(rankWeight('Közkatona')).toBe(rankWeight('Honvéd'));
  });

  it('ismeretlen fokozatra 0-t ad, nem dob hibát', () => {
    expect(rankWeight('Nagyfőnök')).toBe(0);
    expect(rankWeight('')).toBe(0);
    expect(rankWeight(undefined)).toBe(0);
  });
});

describe('shortRank', () => {
  it('a ismert fokozatokat rövidíti', () => {
    expect(shortRank('Honvéd')).toBe('Hv');
    expect(shortRank('Őrmester')).toBe('Őrm');
    expect(shortRank('Alezredes')).toBe('Alez');
  });

  it('ismeretlen fokozatnál az eredetit adja vissza', () => {
    expect(shortRank('Nagyfőnök')).toBe('Nagyfőnök');
  });

  it('hiányzó értéknél kötőjelet ad', () => {
    expect(shortRank('')).toBe('-');
    expect(shortRank(undefined)).toBe('-');
  });
});
