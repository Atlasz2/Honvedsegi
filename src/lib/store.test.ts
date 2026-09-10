import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getErrorMessage, getToken, clearToken, reference } from './store';

const TOKEN_KEY = 'honved_auth_token';

function storeSession(expiryOffsetMs: number) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify({
    token: 'teszt-token',
    user: { username: 'admin', displayName: 'Admin', role: 'admin', expiry: Date.now() + expiryOffsetMs },
  }));
}

describe('munkamenet a böngészőben', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('érvényes munkamenetet visszaad', () => {
    storeSession(60_000);
    expect(getToken()?.username).toBe('admin');
  });

  it('a lejárt munkamenetet eldobja, nem adja vissza', () => {
    storeSession(-1000);
    expect(getToken()).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('a sérült tárolt tartalmat eldobja hiba nélkül', () => {
    localStorage.setItem(TOKEN_KEY, 'ez nem JSON');
    expect(getToken()).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('a clearToken kijelentkeztet', () => {
    storeSession(60_000);
    clearToken();
    expect(getToken()).toBeNull();
  });
});

describe('API hibakezelés', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('401-re eldobja a helyi munkamenetet', async () => {
    storeSession(60_000);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Lejárt munkamenet' }), { status: 401 }),
    ));

    await expect(reference.get()).rejects.toThrow('Lejárt munkamenet');
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('a backend hibaüzenetét adja tovább, nem általánosat', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Hiányzik a kötelező mező: név' }), { status: 400 }),
    ));

    await expect(reference.get()).rejects.toThrow('Hiányzik a kötelező mező: név');
  });

  it('üres hibaválasznál olvasható magyar üzenetet ad', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));

    await expect(reference.get()).rejects.toThrow('A kérés sikertelen volt (500)');
  });

  it('a bejelentkezett kérés viszi a tokent', async () => {
    storeSession(60_000);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ units: [], personStatuses: [], ranks: [] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await reference.get();

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer teszt-token');
  });
});

describe('getErrorMessage', () => {
  it('Error esetén az üzenetet adja', () => {
    expect(getErrorMessage(new Error('valami baj'))).toBe('valami baj');
  });

  it('ismeretlen hibánál általános magyar üzenetet ad', () => {
    expect(getErrorMessage('szöveg')).toBe('Váratlan hiba történt');
    expect(getErrorMessage(null)).toBe('Váratlan hiba történt');
  });
});
