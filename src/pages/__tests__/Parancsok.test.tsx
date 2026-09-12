import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/lib/store', () => ({
  orders: { updateType: vi.fn(), createType: vi.fn(), removeType: vi.fn() },
  personnel: { getPaged: vi.fn() },
  getErrorMessage: (e: unknown) => String(e),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ canEdit: true }) }));
vi.mock('@/components/DatePickerInput', () => ({ default: () => null }));

import { OrderTypesModal } from '../Parancsok';

const type = {
  id: 't1', name: 'Leszerelési parancs', description: '', orderCount: 0,
  chapters: [{ name: 'Bevezető', responsible: 'Ügyvitel', required: true, template: '' }],
  signers: ['Parancsnok', 'Törzsfőnök'],
};

describe('parancstípus szerkesztő — aláírók', () => {
  it('az aláíró törölhető a × gombbal', () => {
    render(<OrderTypesModal open types={[type]} canEdit onClose={() => {}} onChanged={async () => {}} />);
    fireEvent.click(screen.getByText('Szerkesztés'));
    expect(screen.getAllByDisplayValue(/Parancsnok|Törzsfőnök/)).toHaveLength(2);
    fireEvent.click(screen.getAllByTitle('Aláíró törlése')[0]);
    expect(screen.queryByDisplayValue('Parancsnok')).toBeNull();
    expect(screen.getByDisplayValue('Törzsfőnök')).toBeTruthy();
  });

  it('hozzáadott üres aláíró is törölhető', () => {
    render(<OrderTypesModal open types={[type]} canEdit onClose={() => {}} onChanged={async () => {}} />);
    fireEvent.click(screen.getByText('Szerkesztés'));
    fireEvent.click(screen.getByText('+ Aláíró'));
    expect(screen.getAllByTitle('Aláíró törlése')).toHaveLength(3);
    fireEvent.click(screen.getAllByTitle('Aláíró törlése')[2]);
    expect(screen.getAllByTitle('Aláíró törlése')).toHaveLength(2);
  });
});
