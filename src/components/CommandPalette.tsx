import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crosshair, FileSignature, Search, User } from 'lucide-react';
import { search as searchStore, type QuickSearchResult } from '@/lib/store';

/** A fejléc keresőmezője ezzel nyitja meg — az ügyintézőnek nem kell billentyűkombináció. */
export const OPEN_PALETTE_EVENT = 'open-command-palette';
export function openCommandPalette(): void {
  window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
}

type Hit =
  | { kind: 'person'; id: string; title: string; subtitle: string }
  | { kind: 'order'; id: string; title: string; subtitle: string }
  | { kind: 'operation'; id: string; source: 'exercise' | 'training'; title: string; subtitle: string };

const KIND_LABEL: Record<Hit['kind'], string> = { person: 'Személy', order: 'Parancs', operation: 'Művelet' };
const KIND_ICON: Record<Hit['kind'], typeof User> = { person: User, order: FileSignature, operation: Crosshair };

function toHits(result: QuickSearchResult): Hit[] {
  return [
    ...result.persons.map((p) => ({ kind: 'person' as const, id: p.id, title: p.name, subtitle: `${p.rank} · ${p.unit} · ${p.sztsz}` })),
    ...result.orders.map((o) => ({ kind: 'order' as const, id: o.id, title: `${o.number ? `${o.number} — ` : ''}${o.subject}`, subtitle: `${o.typeName} · ${o.status}` })),
    ...result.operations.map((op) => ({ kind: 'operation' as const, id: op.id, source: op.source, title: op.name, subtitle: `${op.type} · ${op.startDate.slice(0, 10)} · ${op.status}` })),
  ];
}

/**
 * Ctrl+K gyorskereső: név vagy SZTSZ → a személy aktája, a parancs, a művelet.
 * Az ügyintéző leggyakoribb mozdulata; bárhonnan elérhető, egér nélkül is.
 */
export default function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setHits([]);
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Gépelés közben késleltetve keresünk, hogy ne minden billentyű menjen a szerverre.
  useEffect(() => {
    if (!open) return;
    const needle = query.trim();
    if (needle.length < 2) { setHits([]); return; }
    let alive = true;
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const result = await searchStore.quick(needle);
        if (alive) { setHits(toHits(result)); setActive(0); }
      } catch {
        if (alive) setHits([]);
      } finally {
        if (alive) setLoading(false);
      }
    }, 200);
    return () => { alive = false; clearTimeout(handle); };
  }, [query, open]);

  const go = useCallback((hit: Hit) => {
    setOpen(false);
    if (hit.kind === 'person') navigate('/personnel', { state: { openPersonnelId: hit.id } });
    else if (hit.kind === 'order') navigate('/parancsok', { state: { openOrderId: hit.id } });
    else navigate(`/operations?source=${hit.source}`, { state: { openOperationId: hit.id, openOperationSource: hit.source } });
  }, [navigate]);

  const grouped = useMemo(() => {
    const map = new Map<Hit['kind'], Hit[]>();
    for (const hit of hits) map.set(hit.kind, [...(map.get(hit.kind) ?? []), hit]);
    return [...map.entries()];
  }, [hits]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-start justify-center pt-[12vh] px-4" onClick={() => setOpen(false)}>
      <div className="w-full max-w-xl bg-card border border-border shadow-xl" style={{ borderRadius: '2px' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-3 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === 'Enter' && hits[active]) { e.preventDefault(); go(hits[active]); }
            }}
            placeholder="Név, SZTSZ, parancs tárgya, művelet neve…"
            className="flex-1 bg-transparent py-3 text-sm focus:outline-none"
          />
          <span className="text-[10px] font-mono text-muted-foreground border border-border px-1.5 py-0.5" style={{ borderRadius: '2px' }}>Esc</span>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {query.trim().length < 2 ? (
            <p className="px-4 py-6 text-xs text-muted-foreground font-mono">Írj legalább két karaktert. ↑↓ lépked, Enter megnyit.</p>
          ) : hits.length === 0 ? (
            <p className="px-4 py-6 text-xs text-muted-foreground font-mono">{loading ? 'Keresés…' : 'Nincs találat.'}</p>
          ) : (
            grouped.map(([kind, items]) => (
              <div key={kind}>
                <p className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-military font-mono text-muted-foreground">{KIND_LABEL[kind]}</p>
                {items.map((hit) => {
                  const index = hits.indexOf(hit);
                  const Icon = KIND_ICON[hit.kind];
                  return (
                    <button
                      key={`${hit.kind}-${hit.id}`}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => go(hit)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left ${index === active ? 'bg-primary/15' : 'hover:bg-secondary/60'}`}
                    >
                      <Icon className="w-4 h-4 text-primary shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-sm truncate">{hit.title}</span>
                        <span className="block text-xs text-muted-foreground font-mono truncate">{hit.subtitle}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
