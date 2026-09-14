/** „31 TVZ" → „31. TVZ"; üres → ezredszintű. A címkék a szervertől jönnek (reference.unitLabels). */
export function unitLabelOf(unit: string, unitLabels: Record<string, string> | undefined): string {
  if (!unit) return 'Ezredszintű';
  return unitLabels?.[unit] ?? unit;
}
