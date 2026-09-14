/** Téma: sötét (alap) vagy világos. A választás a böngészőben marad. */
export type Theme = 'dark' | 'light';
const KEY = 'honved_theme';

export function getTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(theme: Theme): void {
  if (theme === 'light') document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // privát ablak / tiltott tárolás: a téma erre a munkamenetre él
  }
}
