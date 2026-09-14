import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, CheckCircle2, FileDown, Search } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage, tableExport } from '@/lib/store';

export type AlertColumn<T> = {
  header: string;
  /** Megjelenítés a táblában. */
  render: (row: T) => ReactNode;
  /** Szöveges érték az exporthoz (és ha nincs `searchText`, a szűréshez). */
  value: (row: T) => string;
  className?: string;
};

type Tone = 'destructive' | 'warning' | 'primary';

type Props<T> = {
  title: string;
  tone: Tone;
  icon: ReactNode;
  rows: T[];
  columns: AlertColumn<T>[];
  rowKey: (row: T) => string;
  emptyText: string;
  /** Rövid magyarázat / határidő-sor a fejléc alatt, csak kinyitva látszik. */
  description?: ReactNode;
  onRowClick?: (row: T) => void;
  /** Csoportosítás (pl. lejárt / hamarosan / folyamatban): a csoportok sorrendje a visszaadott címkék első előfordulása. */
  groupOf?: (row: T) => string;
  /** Alapból nyitva? Alapértelmezés: ha van sor, de legfeljebb ennyi. */
  openIfAtMost?: number;
  loading?: boolean;
};

const TONE_BORDER: Record<Tone, string> = {
  destructive: 'border-l-destructive',
  warning: 'border-l-amber-400',
  primary: 'border-l-primary',
};

function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Egy figyelmeztetés-szekció: jól elkülönülő, kattintásra nyíló fejléc a
 * darabszámmal; kinyitva szűrő, Excel-export és a táblázat. 500 sor így nem
 * szórja tele az oldalt — alapból csak a kis listák vannak nyitva.
 */
export default function AlertSection<T>({
  title, tone, icon, rows, columns, rowKey, emptyText, description, onRowClick, groupOf, openIfAtMost = 10, loading = false,
}: Props<T>) {
  const [open, setOpen] = useState<boolean | null>(null);
  const [filter, setFilter] = useState('');
  const isOpen = open ?? (rows.length > 0 && rows.length <= openIfAtMost);

  const filtered = useMemo(() => {
    const needle = fold(filter.trim());
    if (!needle) return rows;
    return rows.filter((row) => columns.some((c) => fold(c.value(row)).includes(needle)));
  }, [rows, columns, filter]);

  const groups = useMemo(() => {
    if (!groupOf) return [['', filtered] as const];
    const map = new Map<string, T[]>();
    for (const row of filtered) {
      const key = groupOf(row);
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return [...map.entries()];
  }, [filtered, groupOf]);

  const exportXlsx = async () => {
    try {
      const headers = [...(groupOf ? ['Csoport'] : []), ...columns.map((c) => c.header)];
      const body = groups.flatMap(([group, items]) =>
        items.map((row) => [...(groupOf ? [group] : []), ...columns.map((c) => c.value(row))]),
      );
      await tableExport.xlsx(title, headers, body, `${fold(title).replace(/[^a-z0-9]+/g, '-')}.xlsx`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <section className={`mb-4 bg-card border border-border border-l-2 ${TONE_BORDER[tone]}`} style={{ borderRadius: '2px' }}>
      <button
        onClick={() => setOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40 transition-colors"
      >
        {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
        <span className="shrink-0">{icon}</span>
        <span className="text-sm font-bold uppercase tracking-military flex-1">{title}</span>
        {loading ? (
          <span className="text-xs font-mono text-muted-foreground">…</span>
        ) : rows.length === 0 ? (
          <span className="flex items-center gap-1 text-xs font-mono text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" />rendben</span>
        ) : (
          <span className={`px-2 py-0.5 text-xs font-mono ${tone === 'destructive' ? 'bg-destructive/15 text-destructive' : tone === 'warning' ? 'bg-amber-400/15 text-amber-400' : 'bg-primary/15 text-primary'}`} style={{ borderRadius: '2px' }}>
            {rows.length} fő
          </span>
        )}
      </button>

      {isOpen && (
        <div className="border-t border-border px-4 pb-4">
          {description && <div className="pt-3 text-xs text-muted-foreground font-mono">{description}</div>}
          {rows.length === 0 ? (
            <p className="flex items-center gap-2 text-muted-foreground font-mono py-4 text-sm"><CheckCircle2 className="w-4 h-4 text-green-500" />{emptyText}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 py-3">
                <div className="relative flex-1 min-w-[12rem] max-w-sm">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Szűrés név, alegység, bármi…"
                    className="w-full bg-input border border-border pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-primary"
                    style={{ borderRadius: '2px' }}
                  />
                </div>
                <span className="text-xs font-mono text-muted-foreground">{filtered.length} / {rows.length}</span>
                <button onClick={() => { void exportXlsx(); }} className="btn-mil-secondary text-xs flex items-center gap-1.5 ml-auto">
                  <FileDown className="w-3.5 h-3.5" />
                  Excel
                </button>
              </div>
              <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
                <table className="w-full mil-table">
                  <thead className="sticky top-0 bg-card">
                    <tr>{columns.map((c) => <th key={c.header}>{c.header}</th>)}</tr>
                  </thead>
                  <tbody>
                    {groups.map(([group, items]) => (
                      <GroupRows key={group} group={group} items={items} columns={columns} rowKey={rowKey} onRowClick={onRowClick} />
                    ))}
                    {filtered.length === 0 && (
                      <tr><td colSpan={columns.length} className="text-muted-foreground text-xs py-4">Nincs találat a szűrésre.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function GroupRows<T>({ group, items, columns, rowKey, onRowClick }: {
  group: string; items: T[]; columns: AlertColumn<T>[]; rowKey: (row: T) => string; onRowClick?: (row: T) => void;
}) {
  return (
    <>
      {group && (
        <tr>
          <td colSpan={columns.length} className="bg-secondary/40 text-[11px] font-mono uppercase tracking-military text-muted-foreground py-1">
            {group} ({items.length})
          </td>
        </tr>
      )}
      {items.map((row) => (
        <tr
          key={rowKey(row)}
          className={onRowClick ? 'cursor-pointer hover:bg-secondary transition-colors' : ''}
          onClick={onRowClick ? () => onRowClick(row) : undefined}
        >
          {columns.map((c) => <td key={c.header} className={c.className}>{c.render(row)}</td>)}
        </tr>
      ))}
    </>
  );
}
