// Olyan útvonalak, amelyeknek nincs saját menüpontjuk: melyik menüpont világítson.
// Így mindig van kijelölt elem — a felhasználó tudja, hol jár.
const NAV_ALIAS: Record<string, string> = {
  '/riportok': '/attekintes',
  '/announcements': '/attekintes',
  '/helyzetkep': '/attekintes',
  '/kovetelmenyek': '/operations',
  '/foglaltsag': '/kozos-naptar',
  '/calendar': '/kozos-naptar',
};

export function activeNavPath(pathname: string, navPaths: string[]): string {
  const alias = Object.keys(NAV_ALIAS).find((prefix) => pathname === prefix || pathname.startsWith(prefix + '/'));
  if (alias) return NAV_ALIAS[alias];
  if (pathname === '/') return '/';
  const match = navPaths
    .filter((path) => path !== '/' && (pathname === path || pathname.startsWith(path + '/')))
    .sort((a, b) => b.length - a.length)[0];
  return match ?? '/';
}
