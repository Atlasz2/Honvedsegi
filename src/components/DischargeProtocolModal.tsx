import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { entry, getErrorMessage } from '@/lib/store';
import type { Equipment } from '@/lib/types';
import Modal from '@/components/Modal';

type Props = { open: boolean; onClose: () => void; equipment: Equipment[]; onClosed?: () => void };
type Line = { returned: boolean; amount: string };

/**
 * Leszerelési jegyzőkönyv: kiválasztod a katonát, soronként jelölöd, mi lett
 * visszaadva és mi hiányzik (a hiányért az összeg rögzíthető), és letöltöd a
 * DOCX-et — két példányban (veszprémi személyügy, ellátó). A „Leszerelés lezárása"
 * rögzíti is: a visszaadott felszerelés visszavéve, a hiányzó a katonánál marad
 * megtérítendőként, a katona Leszerelt lesz.
 */
export default function DischargeProtocolModal({ open, onClose, equipment, onClosed }: Props) {
  const [personId, setPersonId] = useState('');
  const [lines, setLines] = useState<Record<string, Line>>({});
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const holders = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of equipment) if (e.checkedOutTo) map.set(e.checkedOutTo, e.checkedOutToName ?? e.checkedOutTo);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'hu'));
  }, [equipment]);
  const items = equipment.filter((e) => e.checkedOutTo === personId);
  const lineOf = (id: string): Line => lines[id] ?? { returned: true, amount: '' };
  const setLine = (id: string, patch: Partial<Line>) => setLines((prev) => ({ ...prev, [id]: { ...lineOf(id), ...patch } }));
  const total = items.reduce((sum, e) => sum + (lineOf(e.id).returned ? 0 : Number(lineOf(e.id).amount) || 0), 0);

  const payload = () => items.map((e) => ({
    equipmentId: e.id, returned: lineOf(e.id).returned, amount: Number(lineOf(e.id).amount) || 0,
  }));

  const download = async () => {
    setBusy(true);
    try {
      await entry.protocolDocx(personId, payload());
      toast.success('Jegyzőkönyv letöltve (2 példány)');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const closeDischarge = async () => {
    setBusy(true);
    try {
      const result = await entry.closeDischarge(personId, payload());
      toast.success(`Leszerelés lezárva: ${result.returned} visszavéve, ${result.missing} hiányzik`);
      setConfirming(false);
      setPersonId('');
      setLines({});
      onClosed?.();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Leszerelési jegyzőkönyv" wide>
      <div className="space-y-3 text-sm">
        <select value={personId} onChange={(e) => { setPersonId(e.target.value); setLines({}); setConfirming(false); }} className="w-full bg-input border border-border px-2 py-1.5" style={{ borderRadius: '2px' }}>
          <option value="">— válaszd ki a leszerelő katonát (akinél van kiadott felszerelés) —</option>
          {holders.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        {personId && (
          <table className="w-full mil-table">
            <thead><tr><th>Felszerelés</th><th>Gyári szám</th><th>Visszaadva</th><th>Fizetendő (Ft)</th></tr></thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id}>
                  <td>{e.name}</td>
                  <td className="font-mono text-xs">{e.serialNumber || '—'}</td>
                  <td>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={lineOf(e.id).returned} onChange={(ev) => setLine(e.id, { returned: ev.target.checked })} />
                      {lineOf(e.id).returned ? 'visszaadva' : 'HIÁNYZIK'}
                    </label>
                  </td>
                  <td>
                    <input
                      type="number" min={0} disabled={lineOf(e.id).returned} value={lineOf(e.id).amount}
                      onChange={(ev) => setLine(e.id, { amount: ev.target.value })}
                      className="w-28 bg-input border border-border px-2 py-1 text-sm disabled:opacity-40" style={{ borderRadius: '2px' }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {personId && <p className="font-mono text-xs">Megtérítendő összesen: <b>{total.toLocaleString('hu-HU')} Ft</b></p>}
        {confirming && (
          <p className="text-xs border border-border p-2" style={{ borderRadius: '2px' }}>
            Lezáráskor a visszaadott felszerelés visszavéve lesz, a hiányzó a katonánál marad megtérítendőként,
            a katona státusza pedig Leszerelt. Biztosan lezárod?
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-mil-secondary text-xs">Bezár</button>
          <button onClick={() => { void download(); }} disabled={!personId || busy} className="btn-mil-secondary text-xs">{busy ? 'Készül…' : 'Jegyzőkönyv (DOCX)'}</button>
          {confirming
            ? <button onClick={() => { void closeDischarge(); }} disabled={busy} className="btn-mil-primary text-xs">Igen, lezárom</button>
            : <button onClick={() => setConfirming(true)} disabled={!personId || busy} className="btn-mil-primary text-xs">Leszerelés lezárása</button>}
        </div>
      </div>
    </Modal>
  );
}
