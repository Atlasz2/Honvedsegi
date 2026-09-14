const RANK_ORDER: Record<string, number> = {
  honved: 1,
  kozkatona: 1,   // migráció előtti elnevezés
  orvezeto: 2,
  tizedes: 3,
  szakaszvezeto: 4,
  ormester: 5,
  torzsormester: 6,
  fotorzsormester: 7,
  zaszlos: 8,
  torzszaszlos: 9,
  fotorzszaszlos: 10,
  hadnagy: 11,
  fohadnagy: 12,
  szazados: 13,
  ornagy: 14,
  alezredes: 15,
  ezredes: 16,
  dandartabornok: 17,
  vezerornagy: 18,
  altabornagy: 19,
  vezerezredes: 20,
};

const RANK_SHORT: Record<string, string> = {
  honved: 'Hv',
  kozkatona: 'Hv',   // migráció előtti elnevezés
  orvezeto: 'Örv',
  tizedes: 'Tiz',
  szakaszvezeto: 'Szkv',
  ormester: 'Őrm',
  torzsormester: 'Törm',
  fotorzsormester: 'Ftörm',
  zaszlos: 'Zls',
  torzszaszlos: 'Tzls',
  fotorzszaszlos: 'Ftzls',
  hadnagy: 'Hdgy',
  fohadnagy: 'Fhdgy',
  szazados: 'Szd',
  ornagy: 'Őrgy',
  alezredes: 'Alez',
  ezredes: 'Ezds',
  dandartabornok: 'Ddtbk',
  vezerornagy: 'Vőrgy',
  altabornagy: 'Altbgy',
  vezerezredes: 'Vezds',
};

function normalizeRank(rank: string): string {
  return (rank || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '');
}

export function rankWeight(rank?: string): number {
  const normalized = normalizeRank(rank || '');
  return RANK_ORDER[normalized] ?? 0;
}

export function shortRank(rank?: string): string {
  const normalized = normalizeRank(rank || '');
  return RANK_SHORT[normalized] || (rank || '-');
}
