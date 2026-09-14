import { afterEach, describe, expect, it, vi } from 'vitest';
import { isOnline, setOnline, OFFLINE_MESSAGE } from './connection';
import { reference } from './store';

describe('kapcsolat a központi géppel', () => {
  afterEach(() => { vi.restoreAllMocks(); setOnline(true); });

  it('hálózati hibánál egy érthető üzenet jön, és az állapot offline lesz', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(reference.get()).rejects.toThrow(OFFLINE_MESSAGE);
    expect(isOnline()).toBe(false);
  });

  it('sikeres válasz után visszaáll online-ra', async () => {
    setOnline(false);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"ranks":[],"units":[],"personStatuses":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await reference.get();
    expect(isOnline()).toBe(true);
  });
});
