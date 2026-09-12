import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { settings as settingsStore, getErrorMessage, type AlertSetting } from '@/lib/store';

/**
 * Riasztási küszöbök — az admin állítja, nem a fejlesztő. Mindegyiknél ott
 * a magyarázat és az alapérték; a mentés naplózódik.
 */
export default function AlertThresholdsPanel({ canEdit }: { canEdit: boolean }) {
  const [items, setItems] = useState<AlertSetting[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const result = await settingsStore.alerts();
      setItems(result.items);
      setValues(Object.fromEntries(result.items.map((i) => [i.key, String(i.value)])));
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };
  useEffect(() => { void load(); }, []);

  const dirty = items.some((i) => values[i.key] !== String(i.value));

  const save = async () => {
    const payload: Record<string, number> = {};
    for (const item of items) {
      const n = Number(values[item.key]);
      if (!Number.isInteger(n)) { toast.error(`${item.label}: egész szám kell.`); return; }
      if (n < item.min || n > item.max) { toast.error(`${item.label}: ${item.min}–${item.max} között.`); return; }
      if (n !== item.value) payload[item.key] = n;
    }
    setSaving(true);
    try {
      const result = await settingsStore.updateAlerts(payload);
      setItems(result.items);
      setValues(Object.fromEntries(result.items.map((i) => [i.key, String(i.value)])));
      toast.success(result.changed.length ? `${result.changed.length} küszöb módosítva.` : 'Nincs változás.');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-8 bg-card border border-border p-4" style={{ borderRadius: '2px' }}>
      <h2 className="text-sm uppercase tracking-military text-primary font-mono">Riasztási küszöbök</h2>
      <p className="text-xs text-muted-foreground mt-1">Hány nappal előre szóljon a rendszer, és mik a kötelező minimumok. A Figyelmeztetések és a Teendőim ezekkel számol.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <label key={item.key} className="block border border-border p-3" style={{ borderRadius: '2px' }}>
            <span className="block text-xs uppercase tracking-military text-muted-foreground">{item.label}</span>
            <span className="flex items-center gap-2 mt-1">
              <input
                type="number"
                min={item.min}
                max={item.max}
                value={values[item.key] ?? ''}
                disabled={!canEdit}
                onChange={(e) => setValues((prev) => ({ ...prev, [item.key]: e.target.value }))}
                className="w-24 bg-input border border-border px-2 py-1 text-sm font-mono"
                style={{ borderRadius: '2px' }}
              />
              <span className="text-[11px] font-mono text-muted-foreground">alap: {item.default} · {item.min}–{item.max}</span>
            </span>
            <span className="block text-[11px] text-muted-foreground mt-1">{item.help}</span>
          </label>
        ))}
      </div>
      {canEdit && (
        <div className="flex justify-end mt-3">
          <button onClick={() => { void save(); }} disabled={!dirty || saving} className="btn-mil-primary text-xs">{saving ? 'Mentés…' : 'Küszöbök mentése'}</button>
        </div>
      )}
    </div>
  );
}
