import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { documents, getErrorMessage, type DocumentFilter, type DocumentRow } from '@/lib/store';

const DAY_OPTIONS = [
  { label: 'Mind', value: null },
  { label: '30 napon belül', value: 30 },
  { label: '60 napon belül', value: 60 },
  { label: '90 napon belül', value: 90 },
] as const;

/**
 * Az összes személyi okmány egy táblában (szolgálati igazolvány, sárga kártya,
 * alkalmasságok…), típusra és lejáratra szűrhetően, Excelbe exportálhatóan.
 * Várpalotán (2. betekintés) ez adja a hiányzó „aktuális táblázatot": kinek
 * mije van, mikor jár le, és kinek kell új igazolvány a rendfokozat miatt.
 */
export default function Okmanyok() {
  const navigate = useNavigate();
  const [types, setTypes] = useState<string[]>([]);
  const [filter, setFilter] = useState<DocumentFilter>({ name: '', days: null, mismatch: false });
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { documents.types().then(setTypes).catch(() => setTypes([])); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await documents.list(filter));
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const exportXlsx = async () => {
    try { await documents.exportXlsx(filter); } catch (error) { toast.error(getErrorMessage(error)); }
  };

  const field = 'bg-input border border-border px-2 py-1.5 text-sm';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-rajdhani uppercase tracking-military">Okmányok</h1>
        <button onClick={() => { void exportXlsx(); }} className="btn-mil-secondary flex items-center gap-2 text-xs">
          <FileDown className="w-4 h-4" />Excel export
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select value={filter.name ?? ''} onChange={(e) => setFilter({ ...filter, name: e.target.value })} className={field} style={{ borderRadius: '2px' }}>
          <option value="">Minden típus</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={filter.days ?? ''}
          onChange={(e) => setFilter({ ...filter, days: e.target.value === '' ? null : Number(e.target.value) })}
          className={field} style={{ borderRadius: '2px' }}
        >
          {DAY_OPTIONS.map((o) => <option key={o.label} value={o.value ?? ''}>{o.label}</option>)}
        </select>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={!!filter.mismatch} onChange={(e) => setFilter({ ...filter, mismatch: e.target.checked })} />
          Csak ahol új kártya kell (rendfokozat-eltérés)
        </label>
        <span className="text-xs text-muted-foreground font-mono">{loading ? 'Betöltés…' : `${rows.length} tétel`}</span>
      </div>

      <table className="w-full mil-table">
        <thead>
          <tr><th>Név</th><th>Rendfokozat</th><th>Egység</th><th>Okmány</th><th>Okmányszám</th><th>Kártyán</th><th>Lejárat</th><th>Állapot</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.documentId} className="cursor-pointer" onClick={() => navigate('/personnel', { state: { openPersonnelId: r.personnelId } })}>
              <td className="font-medium">{r.name}</td>
              <td>{r.rank}</td>
              <td>{r.unit}</td>
              <td className="font-mono text-xs">{r.documentName}</td>
              <td className="font-mono text-xs text-muted-foreground">{r.identifier || '—'}</td>
              <td className="font-mono text-xs">{r.rankOnCard || '—'}</td>
              <td className="font-mono text-xs">{r.expiryDate ?? '—'}</td>
              <td className="space-x-1">
                {r.rankMismatch && <span className="px-2 py-0.5 text-xs badge-cancelled" style={{ borderRadius: '2px' }}>új kártya kell</span>}
                {r.isExpired
                  ? <span className="px-2 py-0.5 text-xs badge-cancelled" style={{ borderRadius: '2px' }}>Lejárt {Math.abs(r.daysUntilExpiry ?? 0)} napja</span>
                  : r.daysUntilExpiry !== null && r.daysUntilExpiry <= 30
                    ? <span className="px-2 py-0.5 text-xs badge-reserve" style={{ borderRadius: '2px' }}>{r.daysUntilExpiry} nap</span>
                    : null}
              </td>
            </tr>
          ))}
          {!loading && rows.length === 0 && (
            <tr><td colSpan={8} className="text-xs text-muted-foreground font-mono py-6 text-center">Nincs a szűrőnek megfelelő okmány.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
