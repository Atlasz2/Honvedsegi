import type { Training } from './types';

export interface Qualification {
  id: string;
  label: string;
}

/** Qualifications earned by completing specific training types with attendance 'Megjelent'. */
export const QUALIFICATIONS: Qualification[] = [
  { id: 'alapkikepzes',  label: 'Alapkiképzés' },
  { id: 'elsosegely',   label: 'Elsősegély' },
  { id: 'loveszeti',    label: 'Lövészeti' },
  { id: 'szakmai',      label: 'Szakmai kiképzés' },
  { id: 'parancsnoki',  label: 'Parancsnoki tanfolyam' },
];

const TRAINING_TYPE_TO_QUAL: Record<string, string> = {
  'Alapkiképzés': 'alapkikepzes',
  'Elsősegély': 'elsosegely',
  'Lövészeti': 'loveszeti',
  'Szakmai kiképzés': 'szakmai',
  'Parancsnoki tanfolyam': 'parancsnoki',
};

/** Returns the set of qualification IDs earned by the person based on completed trainings. */
export function getPersonQualifications(personId: string, trainings: Training[]): Set<string> {
  const earned = new Set<string>();
  for (const training of trainings) {
    if (training.status === 'Lemondva') continue;
    const qualId = TRAINING_TYPE_TO_QUAL[training.type];
    if (!qualId) continue;
    const assignment = training.assigned.find(a => a.personId === personId);
    if (assignment?.attendance === 'Megjelent') {
      earned.add(qualId);
    }
  }
  return earned;
}
