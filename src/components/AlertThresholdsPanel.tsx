import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { settings as settingsStore, getErrorMessage, type AlertSetting, type CustomAlertRule, type CustomRuleField } from '@/lib/store';

/**
 * Riasztási küszöbök — az admin állítja, nem a fejlesztő. Mindegyiknél ott
 * a magyarázat és az alapérték; a mentés naplózódik. Ami egy figyelmeztetés-
 * fajtát vezérel, az ki is kapcsolható (akkor sehol nem jelenik meg), és az
 * admin saját dátum-szabályokat is felvehet (pl. orvosi alkalmassági lejárata).
 */

function slugify(value: string): string {
  const folded = value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return folded.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || `szabaly-${Date.now().toString(36)}`;
}

export default function AlertThresholdsPanel({ canEdit }: { canEdit: boolean }) {
  const [items, setItems] = useState<AlertSetting[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const [rules, setRules] = useState<CustomAlertRule[]>([]);
  const [savedRules, setSavedRules] = useState<CustomAlertRule[]>([]);
  const [fields, setFields] = useState<CustomRuleField[]>([]);
  const [savingRules, setSavingRules] = useState(false);

  const applyItems = (list: AlertSetting[]) => {
    setItems(list);
    setValues(Object.fromEntries(list.map((i) => [i.key, String(i.value)])));
    setEnabled(Object.fromEntries(list.map((i) => [i.key, i.enabled])));
  };

  const load = async () => {
    try {
      const [result, custom] = await Promise.all([settingsStore.alerts(), settingsStore.customRules()]);
      applyItems(result.items);
      setRules(custom.rules);
      setSavedRules(custom.rules);
      setFields(custom.fields);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };
  useEffect(() => { void load(); }, []);

  const dirty = items.some((i) => values[i.key] !== String(i.value) || enabled[i.key] !== i.enabled);
  const rulesDirty = JSON.stringify(rules) !== JSON.stringify(savedRules);

  const save = async () => {
    const payload: Record<string, number> = {};
    const toggles: Record<string, boolean> = {};
    for (const item of items) {
      const n = Number(values[item.key]);
      if (!Number.isInteger(n)) { toast.error(`${item.label}: egész szám kell.`); return; }
      if (n < item.min || n > item.max) { toast.error(`${item.label}: ${item.min}–${item.max} között.`); return; }
      if (n !== item.value) payload[item.key] = n;
      if (item.toggleable && enabled[item.key] !== item.enabled) toggles[item.key] = enabled[item.key];
    }
    setSaving(true);
    try {
      const result = await settingsStore.updateAlerts(payload, toggles);
      applyItems(result.items);
      toast.success(result.changed.length ? `${result.changed.length} beállítás módosítva.` : 'Nincs változás.');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const addRule = () => {
    const field = fields[0]?.key ?? 'join_date';
    setRules((prev) => [...prev, { id: `${slugify('uj')}-${Date.now().toString(36)}`, label: '', field, validityDays: 365, warnDays: 30, enabled: true }]);
  };

  const updateRule = (id: string, patch: Partial<CustomAlertRule>) =>
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const saveRules = async () => {
    for (const r of rules) {
      if (!r.label.trim()) { toast.error('Minden szabálynak kell név.'); return; }
      if (!Number.isInteger(r.validityDays) || r.validityDays < 0) { toast.error(`${r.label}: az érvényesség nem-negatív egész nap.`); return; }
      if (!Number.isInteger(r.warnDays) || r.warnDays < 0 || r.warnDays > 365) { toast.error(`${r.label}: az előrejelzés 0–365 nap.`); return; }
    }
    setSavingRules(true);
    try {
      const result = await settingsStore.updateCustomRules(rules.map((r) => ({ ...r, label: r.label.trim() })));
      setRules(result.rules);
      setSavedRules(result.rules);
      toast.success('Egyéni szabályok mentve.');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSavingRules(false);
    }
  };

  return (
    <div className="mt-8 bg-card border border-border p-4" style={{ borderRadius: '2px' }}>
      <h2 className="text-sm uppercase tracking-military text-primary font-mono">Riasztási küszöbök</h2>
      <p className="text-xs text-muted-foreground mt-1">Hány nappal előre szóljon a rendszer, és mik a kötelező minimumok. A Figyelmeztetések és a Teendőim ezekkel számol. A kikapcsolt fajta sehol nem jelenik meg.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {items.map((item) => {
          const on = enabled[item.key] ?? true;
          return (
            <div key={item.key} className={`border border-border p-3 ${on ? '' : 'opacity-60'}`} style={{ borderRadius: '2px' }}>
              <div className="flex items-start justify-between gap-2">
                <span className="block text-xs uppercase tracking-military text-muted-foreground">{item.label}</span>
                {item.toggleable && (
                  <label className="flex items-center gap-1.5 text-[11px] font-mono cursor-pointer select-none shrink-0" title={on ? 'Kikapcsolás: ez a figyelmeztetés nem jelenik meg' : 'Bekapcsolás'}>
                    <input type="checkbox" checked={on} disabled={!canEdit} onChange={(e) => setEnabled((prev) => ({ ...prev, [item.key]: e.target.checked }))} className="accent-primary" />
                    {on ? 'aktív' : 'kikapcsolva'}
                  </label>
                )}
              </div>
              <span className="flex items-center gap-2 mt-1">
                <input
                  type="number"
                  min={item.min}
                  max={item.max}
                  value={values[item.key] ?? ''}
                  disabled={!canEdit || !on}
                  onChange={(e) => setValues((prev) => ({ ...prev, [item.key]: e.target.value }))}
                  className="w-24 bg-input border border-border px-2 py-1 text-sm font-mono"
                  style={{ borderRadius: '2px' }}
                />
                <span className="text-[11px] font-mono text-muted-foreground">alap: {item.default} · {item.min}–{item.max}</span>
              </span>
              <span className="block text-[11px] text-muted-foreground mt-1">{item.help}</span>
            </div>
          );
        })}
      </div>
      {canEdit && (
        <div className="flex justify-end mt-3">
          <button onClick={() => { void save(); }} disabled={!dirty || saving} className="btn-mil-primary text-xs">{saving ? 'Mentés…' : 'Küszöbök mentése'}</button>
        </div>
      )}

      <div className="mt-6 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm uppercase tracking-military text-primary font-mono">Egyéni szabályok</h3>
            <p className="text-xs text-muted-foreground mt-1">Új figyelmeztetés egy személy-dátummezőre: a mező dátuma + érvényesség (nap) = lejárat; ennyi nappal előtte kerül a Figyelmeztetések közé. A KGIR-exportból átvett, egyébként nem használt oszlopok is választhatók.</p>
          </div>
          {canEdit && (
            <button onClick={addRule} className="btn-mil-secondary text-xs flex items-center gap-1"><Plus className="w-3.5 h-3.5" />Új szabály</button>
          )}
        </div>
        {rules.length === 0 ? (
          <p className="text-xs text-muted-foreground font-mono mt-3">Nincs egyéni szabály.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {rules.map((r) => (
              <div key={r.id} className={`grid gap-2 md:grid-cols-[2fr_2fr_1fr_1fr_auto_auto] items-end border border-border p-3 ${r.enabled ? '' : 'opacity-60'}`} style={{ borderRadius: '2px' }}>
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Név</span>
                  <input value={r.label} disabled={!canEdit} onChange={(e) => updateRule(r.id, { label: e.target.value })} placeholder="pl. Orvosi alkalmassági lejár" className="w-full bg-input border border-border px-2 py-1.5 text-sm" style={{ borderRadius: '2px' }} />
                </label>
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Dátummező</span>
                  <select value={r.field} disabled={!canEdit} onChange={(e) => updateRule(r.id, { field: e.target.value })} className="w-full bg-input border border-border px-2 py-1.5 text-sm" style={{ borderRadius: '2px' }}>
                    {!fields.some((f) => f.key === r.field) && <option value={r.field}>{r.field.replace(/^extra:/, '')}</option>}
                    {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Érvényes (nap)</span>
                  <input type="number" min={0} value={r.validityDays} disabled={!canEdit} onChange={(e) => updateRule(r.id, { validityDays: Number(e.target.value) })} title="0 = maga a mező a határidő" className="w-full bg-input border border-border px-2 py-1.5 text-sm font-mono" style={{ borderRadius: '2px' }} />
                </label>
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Előre (nap)</span>
                  <input type="number" min={0} max={365} value={r.warnDays} disabled={!canEdit} onChange={(e) => updateRule(r.id, { warnDays: Number(e.target.value) })} className="w-full bg-input border border-border px-2 py-1.5 text-sm font-mono" style={{ borderRadius: '2px' }} />
                </label>
                <label className="flex items-center gap-1.5 text-[11px] font-mono cursor-pointer select-none pb-2">
                  <input type="checkbox" checked={r.enabled} disabled={!canEdit} onChange={(e) => updateRule(r.id, { enabled: e.target.checked })} className="accent-primary" />
                  {r.enabled ? 'aktív' : 'kikapcsolva'}
                </label>
                {canEdit && (
                  <button onClick={() => setRules((prev) => prev.filter((x) => x.id !== r.id))} className="text-destructive hover:bg-destructive/10 p-1.5 mb-1" title="Szabály törlése" style={{ borderRadius: '2px' }}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {canEdit && (
          <div className="flex justify-end mt-3">
            <button onClick={() => { void saveRules(); }} disabled={!rulesDirty || savingRules} className="btn-mil-primary text-xs">{savingRules ? 'Mentés…' : 'Egyéni szabályok mentése'}</button>
          </div>
        )}
      </div>
    </div>
  );
}
