import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, CalendarDays, Crosshair, Megaphone, Pin, Users } from 'lucide-react';
import { toast } from 'sonner';
import { announcements as announcementStore, attendance, getErrorMessage, leave, operations as operationStore, type AttendanceDay, type OperationsNow } from '@/lib/store';
import type { Announcement } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { useReferenceData } from '@/lib/queries';
import { useAutoRefresh } from '@/lib/useAutoRefresh';

const radius = { borderRadius: '2px' } as const;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const statusColor: Record<string, string> = {
  'Szabadság': 'text-amber-400',
  'Betegállomány': 'text-red-400',
  'Vezényelve': 'text-sky-400',
  'Szolgálatban': 'text-primary',
  'Kiküldetés': 'text-violet-400',
  'Igazolt távollét': 'text-muted-foreground',
  'Igazolatlan távollét': 'text-destructive',
};

const timeOf = (iso: string) => (iso.includes('T') ? iso.slice(11, 16) : '');
const dayOf = (iso: string) => iso.slice(0, 10);

/**
 * Áttekintés: gyors kép arról, mi a helyzet MOST. Nem export, nem listák
 * típusonként — ki van feladatban és meddig, mi zajlik, mi az eltérés a mai
 * létszámban, és a friss közlemények. A részletek a saját oldalukon.
 */
export default function Attekintes() {
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const date = todayIso();
  const [nowRaw, setNow] = useState<OperationsNow | null>(null);
  const [dayRaw, setDay] = useState<AttendanceDay | null>(null);
  // Ezredtörzs: zászlóaljanként is nézhető (a zászlóalj ügyintézője a szervertől eleve csak a sajátját kapja).
  const { user } = useAuth();
  const { data: reference } = useReferenceData();
  const unitOptions = Object.keys(reference.unitLabels ?? {}).filter((u) => u !== reference.regimentUnit);
  const [unitView, setUnitView] = useState<string>('all');
  const inView = (unit: string | undefined) => unitView === 'all' || (unit ?? '') === unitView || (unitView !== '' && !(unit ?? ''));
  const now = useMemo<OperationsNow | null>(() => {
    if (!nowRaw || unitView === 'all') return nowRaw;
    const onTask = nowRaw.onTask.filter((r) => (unitView === '' ? !r.operationUnit : r.unit === unitView || r.operationUnit === unitView));
    return {
      ...nowRaw,
      running: nowRaw.running.filter((r) => (unitView === '' ? !r.unit : inView(r.unit))),
      onTask,
      onTaskPeople: new Set(onTask.map((r) => r.personnelId)).size,
      upcoming: nowRaw.upcoming.filter((r) => (unitView === '' ? !r.unit : inView(r.unit))),
    };
  }, [nowRaw, unitView]);  // eslint-disable-line react-hooks/exhaustive-deps
  const day = useMemo<AttendanceDay | null>(() => {
    if (!dayRaw || unitView === 'all') return dayRaw;
    const items = dayRaw.items.filter((i) => (unitView === '' ? i.unit === reference.regimentUnit : i.unit === unitView));
    const summary: Record<string, number> = {};
    items.forEach((i) => { summary[i.status] = (summary[i.status] ?? 0) + 1; });
    return { ...dayRaw, items, summary, total: items.length };
  }, [dayRaw, unitView, reference.regimentUnit]);
  // Zászlóalj-sáv: egy sorban, mi hol áll (csak az ezredtörzsnek).
  const battalionStrip = useMemo(() => {
    if (!nowRaw || !dayRaw || user?.unit) return [];
    return unitOptions.map((u) => ({
      unit: u,
      label: reference.unitLabels?.[u] ?? u,
      onTask: new Set(nowRaw.onTask.filter((r) => r.unit === u).map((r) => r.personnelId)).size,
      running: nowRaw.running.filter((r) => r.unit === u).length,
      exceptions: dayRaw.items.filter((i) => i.unit === u && i.status !== 'Jelen').length,
      present: dayRaw.items.filter((i) => i.unit === u && i.status === 'Jelen').length,
      upcoming: nowRaw.upcoming.filter((r) => r.unit === u).length,
      closed: dayRaw.closures.find((c) => c.unit === u) ?? null,
    }));
  }, [nowRaw, dayRaw, unitOptions, reference.unitLabels, user?.unit]);
  const [pendingLeave, setPendingLeave] = useState(0);
  const [news, setNews] = useState<Announcement[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [nowData, dayData, leaves, newsData] = await Promise.all([
        operationStore.now(),
        attendance.getDay(date),
        leave.list('Beadva'),
        announcementStore.getAll(),
      ]);
      setNow(nowData);
      setDay(dayData);
      setPendingLeave(leaves.length);
      setNews(newsData.slice(0, 5));
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, [date]);

  useEffect(() => { void refresh(); }, [refresh]);
  useAutoRefresh(refresh);

  // Aki a feladat-listában már szerepel, az az „Eltérések" közt nem jelenik meg
  // újra (a „Szolgálatban" létszám-állapot ugyanazt mondaná el másodszor).
  const onTaskIds = useMemo(() => new Set((now?.onTask ?? []).map((r) => r.personnelId)), [now]);
  const exceptions = (day?.items ?? []).filter((item) => item.status !== 'Jelen' && !onTaskIds.has(item.personnelId));
  const hiddenExceptions = (day?.items ?? []).filter((item) => item.status !== 'Jelen' && onTaskIds.has(item.personnelId)).length;

  // Feladatonként csoportosítva: a feladat neve egyszer, alatta az emberek.
  const onTaskGroups = useMemo(() => {
    const groups = new Map<string, { key: string; operationId: string; source: 'exercise'; name: string; isDuty: boolean; startDate: string; endDate: string; rows: OperationsNow['onTask'] }>();
    for (const row of now?.onTask ?? []) {
      const key = `${row.source}-${row.operationId}`;
      const group = groups.get(key) ?? { key, operationId: row.operationId, source: row.source, name: row.operationName, isDuty: row.isDuty, startDate: row.startDate, endDate: row.endDate, rows: [] };
      group.rows.push(row);
      groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'hu'));
  }, [now]);
  const presentCount = day?.summary?.['Jelen'] ?? 0;
  const otherStatuses = Object.entries(day?.summary ?? {}).filter(([s]) => s !== 'Jelen').sort((a, b) => b[1] - a[1]);
  const openOperation = (id: string, source: 'exercise') => navigate(`/operations?source=${source}`, { state: { openOperationId: id, openOperationSource: source } });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold font-rajdhani uppercase tracking-military flex items-center gap-2"><Activity className="w-6 h-6 text-primary" />Áttekintés</h1>
          <p className="text-xs text-muted-foreground font-mono mt-1">{date} · mi a helyzet most</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/letszam')} className="btn-mil-secondary text-xs">Napi létszám →</button>
          <button onClick={() => navigate('/riportok')} className="btn-mil-secondary text-xs">Riport készítése →</button>
        </div>
      </div>

      {battalionStrip.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-xs uppercase tracking-military font-mono text-muted-foreground">Nézet:</span>
            {[['all', 'Minden zászlóalj'], ['', 'Ezredszintű'], ...unitOptions.map((u) => [u, reference.unitLabels?.[u] ?? u])].map(([key, label]) => (
              <button key={key} onClick={() => setUnitView(key)} className={`px-3 py-1 text-xs uppercase tracking-military font-mono ${unitView === key ? 'btn-mil-primary' : 'btn-mil-secondary'}`}>{label}</button>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {battalionStrip.map((b) => (
              <button key={b.unit} onClick={() => setUnitView(unitView === b.unit ? 'all' : b.unit)} className={`bg-card border p-3 text-left hover:bg-secondary/40 ${unitView === b.unit ? 'border-primary' : 'border-border'}`} style={radius}>
                <div className="flex items-center justify-between">
                  <span className="font-rajdhani font-bold uppercase tracking-military text-primary">{b.label}</span>
                  <span className={`text-[10px] font-mono ${b.closed ? 'text-emerald-400' : 'text-amber-400'}`} title={b.closed ? `Lezárta: ${b.closed.closedByName}` : 'A mai létszám még nincs lezárva'}>
                    {b.closed ? `létszám lezárva ${new Date(b.closed.closedAt).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })}` : 'létszám nyitott'}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                  <div><div className="text-lg font-rajdhani font-bold">{b.onTask}</div><div className="text-[10px] uppercase text-muted-foreground">feladatban</div></div>
                  <div><div className="text-lg font-rajdhani font-bold">{b.running}</div><div className="text-[10px] uppercase text-muted-foreground">futó művelet</div></div>
                  <div><div className={`text-lg font-rajdhani font-bold ${b.exceptions ? 'text-amber-400' : ''}`}>{b.exceptions}</div><div className="text-[10px] uppercase text-muted-foreground">eltérés</div></div>
                  <div><div className="text-lg font-rajdhani font-bold">{b.upcoming}</div><div className="text-[10px] uppercase text-muted-foreground">közelgő</div></div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="stats-card border-l-2 border-l-primary">
          <div className="stats-number">{now?.onTaskPeople ?? '—'}</div>
          <div className="stats-label">Most feladatban</div>
        </div>
        <div className="stats-card">
          <div className="stats-number">{now?.running.length ?? '—'}</div>
          <div className="stats-label">Folyamatban lévő művelet</div>
        </div>
        <div className="stats-card">
          <div className="stats-number">{now?.todayEvents.length ?? '—'}</div>
          <div className="stats-label">Mai esemény</div>
        </div>
        <button onClick={() => navigate('/letszam')} className="stats-card text-left hover:bg-secondary/40">
          <div className="stats-number">{day ? `${presentCount} / ${day.total}` : '—'}</div>
          <div className="stats-label">Jelen az aktív állományból</div>
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          {/* Ki van most feladatban */}
          <section className="bg-card border border-border" style={radius}>
            <header className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Users className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-military flex-1">Ki van most feladatban</h2>
              <span className="text-xs font-mono text-muted-foreground">{now?.onTask.length ?? 0}</span>
            </header>
            {!now || now.onTask.length === 0 ? (
              <p className="px-4 py-4 text-xs text-muted-foreground font-mono">Ma senki nincs műveletbe beosztva.</p>
            ) : (
              <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
                <table className="w-full mil-table">
                  <thead className="sticky top-0 bg-card"><tr><th>Név</th><th>Rendfokozat</th><th>Alegység</th><th>Mikortól</th><th>Meddig</th></tr></thead>
                  {onTaskGroups.map((group, gi) => (
                    <tbody key={group.key} className={gi > 0 ? 'border-t-2 border-border' : ''}>
                      <tr className="cursor-pointer hover:bg-secondary transition-colors" onClick={() => openOperation(group.operationId, group.source)}>
                        <td colSpan={5} className="text-center py-2 bg-secondary/30">
                          {group.isDuty && <span className="mono-chip text-[10px] mr-2">SZOLGÁLAT</span>}
                          <span className="font-rajdhani font-bold uppercase tracking-military text-sm text-primary">{group.name}</span>
                          <span className="ml-2 text-[11px] font-mono text-muted-foreground">{group.rows.length} fő</span>
                        </td>
                      </tr>
                      {group.rows.map((row) => (
                        <tr key={`${row.personnelId}-${row.operationId}`} className="cursor-pointer hover:bg-secondary transition-colors" onClick={() => navigate('/personnel', { state: { openPersonnelId: row.personnelId } })}>
                          <td className="font-medium">{row.name}</td>
                          <td className="font-mono text-xs text-primary">{row.rank}</td>
                          <td className="text-muted-foreground text-xs">{row.unit}</td>
                          <td className="font-mono text-xs">{dayOf(row.startDate)}{timeOf(row.startDate) ? ` ${timeOf(row.startDate)}` : ''}</td>
                          <td className="font-mono text-xs">{dayOf(row.endDate)}{timeOf(row.endDate) ? ` ${timeOf(row.endDate)}` : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  ))}
                </table>
              </div>
            )}
          </section>

          {/* Eltérések a mai létszámban */}
          <section className="bg-card border border-border" style={radius}>
            <header className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Activity className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold uppercase tracking-military flex-1">Eltérések a mai létszámban</h2>
              <span className="text-xs font-mono text-muted-foreground">{exceptions.length}{hiddenExceptions ? ` (+${hiddenExceptions} feladatban, fent)` : ''}{pendingLeave ? ` · ${pendingLeave} szabadság jóváhagyásra` : ''}</span>
            </header>
            {otherStatuses.length > 0 && (
              <div className="flex flex-wrap gap-2 px-4 py-2 border-b border-border/50 text-xs font-mono">
                {otherStatuses.map(([status, count]) => <span key={status} className={statusColor[status] ?? 'text-muted-foreground'}>{status}: {count}</span>)}
              </div>
            )}
            {exceptions.length === 0 ? (
              <p className="px-4 py-4 text-xs text-muted-foreground font-mono">Mindenki jelen (vagy még nincs rögzítve eltérés).</p>
            ) : (
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full mil-table">
                  <thead className="sticky top-0 bg-card"><tr><th>Név</th><th>Alegység</th><th>Állapot</th><th>Megjegyzés</th></tr></thead>
                  <tbody>
                    {exceptions.map((item) => (
                      <tr key={item.personnelId} className="cursor-pointer hover:bg-secondary transition-colors" onClick={() => navigate('/personnel', { state: { openPersonnelId: item.personnelId } })}>
                        <td className="font-medium">{item.name}</td>
                        <td className="text-muted-foreground text-xs">{item.unit}</td>
                        <td className={`text-xs font-mono ${statusColor[item.status] ?? ''}`}>{item.status}</td>
                        <td className="text-muted-foreground text-xs">{item.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6">
          {/* Folyamatban / mai események */}
          <section className="bg-card border border-border" style={radius}>
            <header className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Crosshair className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-military flex-1">Folyamatban lévő műveletek</h2>
            </header>
            {!now || now.running.length === 0 ? (
              <p className="px-4 py-4 text-xs text-muted-foreground font-mono">Ma nem zajlik művelet.</p>
            ) : (
              <ul>
                {now.running.map((op) => (
                  <li key={op.id}>
                    <button onClick={() => openOperation(op.id, op.source)} className="w-full text-left px-4 py-2 border-b border-border/50 hover:bg-secondary/40 text-sm">
                      <span className="block"><span className="font-medium">{op.name}</span> <span className="text-muted-foreground text-xs">· {op.type}{op.isDuty ? ' · szolgálat' : ''}</span></span>
                      <span className="block text-xs font-mono text-muted-foreground">{dayOf(op.startDate)} – {dayOf(op.endDate)}{op.location ? ` · ${op.location}` : ''} · {op.assignedCount} fő</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="bg-card border border-border" style={radius}>
            <header className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <CalendarDays className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-military flex-1">Mai események</h2>
            </header>
            {!now || now.todayEvents.length === 0 ? (
              <p className="px-4 py-4 text-xs text-muted-foreground font-mono">Ma nincs esemény.</p>
            ) : (
              <ul>
                {now.todayEvents.map((ev) => (
                  <li key={ev.id}>
                    <button onClick={() => navigate('/events', { state: { openEventId: ev.id } })} className="w-full text-left px-4 py-2 border-b border-border/50 hover:bg-secondary/40 text-sm flex justify-between gap-3">
                      <span><span className="font-medium">{ev.name}</span> <span className="text-muted-foreground text-xs">· {ev.type}</span></span>
                      <span className="font-mono text-xs text-primary shrink-0">{timeOf(ev.startDate) || 'egész nap'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* A következő 7 nap műveletei */}
          <section className="bg-card border border-border" style={radius}>
            <header className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <CalendarDays className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-military flex-1">A következő 7 nap</h2>
              <span className="text-xs font-mono text-muted-foreground">{now?.upcoming.length ?? 0}</span>
            </header>
            {!now || now.upcoming.length === 0 ? (
              <p className="px-4 py-4 text-xs text-muted-foreground font-mono">Nem indul művelet a következő héten.</p>
            ) : (
              <ul className="max-h-72 overflow-y-auto">
                {now.upcoming.map((op) => (
                  <li key={op.id}>
                    <button onClick={() => openOperation(op.id, op.source)} className="w-full text-left px-4 py-2 border-b border-border/50 hover:bg-secondary/40 text-sm">
                      <span className="block">
                        {op.isDuty && <span className="mono-chip text-[10px] mr-1">SZOLGÁLAT</span>}
                        <span className="font-medium">{op.name}</span> <span className="text-muted-foreground text-xs">· {op.type}</span>
                      </span>
                      <span className="block text-xs font-mono text-muted-foreground">{dayOf(op.startDate)}{timeOf(op.startDate) ? ` ${timeOf(op.startDate)}` : ''}{dayOf(op.endDate) !== dayOf(op.startDate) ? ` – ${dayOf(op.endDate)}` : ''}{op.location ? ` · ${op.location}` : ''}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Hírek és közlemények */}
          <section className="bg-card border border-border" style={radius}>
            <header className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Megaphone className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-military flex-1">Hírek és közlemények</h2>
              <button onClick={() => navigate('/announcements')} className="text-xs font-mono text-primary hover:underline">{canEdit ? 'Összes / új' : 'Összes'}</button>
            </header>
            {news.length === 0 ? (
              <p className="px-4 py-4 text-xs text-muted-foreground font-mono">Nincs közlemény.</p>
            ) : (
              <ul>
                {news.map((a) => (
                  <li key={a.id} className="px-4 py-2.5 border-b border-border/50">
                    <p className="text-sm flex items-center gap-2">{a.pinned && <Pin className="w-3 h-3 text-amber-400 shrink-0" />}<span className="font-medium">{a.title}</span></p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{a.content}</p>
                    <p className="text-[11px] font-mono text-muted-foreground mt-0.5">{a.category} · {a.author} · {a.date}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
