/** Magyar telefonszám formázás és ellenőrzés. */

/** A tárolt alak: +36 XX XXX XXXX */
export const PHONE_PATTERN = /^\+36 \d{2} \d{3} \d{4}$/;

/**
 * Gépelés közbeni formázás magyar alakra.
 *
 * Elnyeli a megszokott bevitelt (06…, +36…, 36…, szóközök, kötőjelek), és
 * részleges számnál is értelmes köztes alakot ad, hogy a mező ne ugráljon.
 */
export function normalizeHungarianPhone(input: string): string {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('06') || digits.startsWith('36')) {
    digits = digits.slice(2);
  }
  digits = digits.slice(0, 9);

  if (!digits) return '';
  if (digits.length <= 2) return `+36 ${digits}`;
  if (digits.length <= 5) return `+36 ${digits.slice(0, 2)} ${digits.slice(2)}`;
  return `+36 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`;
}

export function isValidHungarianPhone(value: string): boolean {
  return PHONE_PATTERN.test(value);
}
