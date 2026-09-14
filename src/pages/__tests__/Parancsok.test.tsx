import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/lib/store', () => ({
  orders: { updateType: vi.fn(), createType: vi.fn(), removeType: vi.fn() },
  personnel: { getPaged: vi.fn() },
  getErrorMessage: (e: unknown) => String(e),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ canEdit: true }) }));
vi.mock('@/components/DatePickerInput', () => ({ default: () => null }));
vi.mock('@/components/Modal', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

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

describe('parancs részlete — aláírás-hely', () => {
  it('a beosztás mezőbe folyamatosan lehet írni (nem esik ki a fókusz)', async () => {
    const { OrderDetailModal } = await import('../Parancsok');
    const order = {
      id: 'o1', orderTypeId: 't1', typeName: 'Leszerelési parancs', number: '1/2026', issuer: 'MH', subject: 'X',
      personnelId: '', personName: '', status: 'Előkészítés' as const, dueDate: '', issuedDate: '', notes: '',
      createdBy: 'admin', createdAt: '2026-09-12T10:00:00', doneChapters: 0, totalChapters: 0,
      pendingResponsibles: [], readyToSign: false, signedCount: 0, isOverdue: false,
      signatures: [{ role: 'Törzsfőnök', name: '', signed: false, signedAt: '', signedBy: '' }], chapters: [],
    };
    render(<OrderDetailModal order={order} canEdit onClose={() => {}} onChanged={() => {}} onDelete={() => {}} onCopy={() => {}} />);
    const input = screen.getByDisplayValue('Törzsfőnök') as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: 'Törzsfőnök h' } });
    expect(document.activeElement).toBe(screen.getByDisplayValue('Törzsfőnök h'));
    fireEvent.change(screen.getByDisplayValue('Törzsfőnök h'), { target: { value: 'Törzsfőnök he' } });
    expect(document.activeElement).toBe(screen.getByDisplayValue('Törzsfőnök he'));
  });
});
