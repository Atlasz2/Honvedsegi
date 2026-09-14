/** A szolgálatok a Műveletekbe olvadtak: ezek a gyakorlat-típusok jelentik a
 * szolgálatot. A backend `DUTY_EXERCISE_TYPES` párja. */
export const DUTY_TYPES = ['Őrszolgálat', 'Ügyeleti szolgálat', 'Készenléti szolgálat', 'Rendezvénybiztosítás'] as const;

export function isDutyType(type: string): boolean {
  return (DUTY_TYPES as readonly string[]).includes(type);
}
