import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, FileSignature, Megaphone, Palmtree, PenLine } from 'lucide-react';
import { toast } from 'sonner';
import { me as meStore, getErrorMessage, type MyTodos } from '@/lib/store';
import { useAuth } from '@/lib/auth';
import { useAutoRefresh } from '@/lib/useAutoRefresh';

const radius = { borderRadius: '2px' } as const;

/**
 * Teendőim — belépés után az első képernyő. Nem a rendszer egészét mutatja,
 * hanem azt, ami rám vár: a részlegem nyitott parancs-fejezetei, a lejáró
 * határidők, a jóváhagyásra váró szabadságok, a heti műveletek.
 */
export default function Teendoim() {
  const navigate = useNavigate();
  const { user, canEdit } = useAuth();
  const [todos, setTodos] = useState<MyTodos | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setTodos(await meStore.todos());
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err));
      toast.error(getErrorMessage(err));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useAutoRefresh(refresh);

  const openOrder = (orderId: string) => navigate('/parancsok', { state: { openOrderId: orderId } });
  const alertTotal = todos ? Object.values(todos.alerts).reduce((a, b) => a + b, 0) : 0;
  const overdueChapters = todos?.myChapters.filter((c) => c.isOverdue).length ?? 0;
  const has = (duty: string) => todos?.duties.includes(duty) ?? false;
  const showChapters = has('chapters');
  const showLeave = canEdit && has('leave');
  const showTraining = has('training');
  const showOrderAlerts = has('chapters') || has('orders');

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold font-rajdhani uppercase tracking-military">Teendőim</h1>
          <p className="text-xs text-muted-foreground font-mono mt-1">
            {user?.displayName}{todos?.department ? ` · ${todos.department} részleg` : ' · nincs részleg beállítva — a Beállításokban egy admin megadhatja'}
          </p>
        </div>
        <button onClick={() => navigate('/attekintes')} className="btn-mil-secondary text-xs">Teljes áttekintés →</button>
      </div>

      {error && !todos && (
        <div className="bg-card border border-destructive/40 p-4 text-sm text-destructive" style={radius}>{error}</div>
      )}

      {todos && (
        <>
          {todos.changes.length > 0 && (
            <section className="mb-6 bg-card border border-amber-400/50" style={radius}>
              <header className="flex items-center gap-2 px-4 py-2 border-b border-amber-400/30">
                <Megaphone className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-bold uppercase tracking-military flex-1">Változott az elmúlt napokban — nézd meg, mielőtt elindulsz</h2>
              </header>
              <ul>
                {todos.changes.map((c) => (
                  <li key={c.id} className="px-4 py-2 border-b border-border/50 last:border-0 text-sm">
                    <span className="font-medium">{c.title}</span>
                    <span className="block text-xs text-muted-foreground whitespace-pre-line">{c.content}</span>
                    <span className="block text-[11px] font-mono text-muted-foreground">{c.date} · {c.author}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {showChapters && (
              <button onClick={() => navigate('/parancsok')} className={`stats-card text-left border-l-2 ${overdueChapters ? 'border-l-destructive' : todos.myChapters.length ? 'border-l-amber-400' : 'border-l-border'} hover:bg-secondary/40`}>
                <div className="stats-number">{todos.myChapters.length}</div>
                <div className="stats-label">Fejezet vár rám{overdueChapters ? ` · ${overdueChapters} lejárt` : ''}</div>
              </button>
            )}
            {showOrderAlerts && (
              <button onClick={() => navigate('/parancsok')} className={`stats-card text-left border-l-2 ${todos.waitingSignature ? 'border-l-primary' : 'border-l-border'} hover:bg-secondary/40`}>
                <div className="stats-number">{todos.waitingSignature}</div>
                <div className="stats-label">Parancs aláírásra vár</div>
              </button>
            )}
            {showLeave && (
              <button onClick={() => navigate('/szabadsag')} className={`stats-card text-left border-l-2 ${todos.pendingLeaveCount ? 'border-l-amber-400' : 'border-l-border'} hover:bg-secondary/40`}>
                <div className="stats-number">{todos.pendingLeaveCount}</div>
                <div className="stats-label">Szabadság jóváhagyásra</div>
              </button>
            )}
            <button onClick={() => navigate('/figyelmeztetesek')} className={`stats-card text-left border-l-2 ${alertTotal ? 'border-l-destructive' : 'border-l-border'} hover:bg-secondary/40`}>
              <div className="stats-number">{alertTotal}</div>
              <div className="stats-label">Esedékes riasztás</div>
            </button>
          </div>

          <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
            <div className="space-y-6">
              {!todos.department && (
                <div className="bg-card border border-amber-400/40 p-4 text-sm" style={radius}>
                  <p className="font-medium">Még nincs beállítva, mi tartozik hozzád.</p>
                  <p className="text-xs text-muted-foreground mt-1">Az admin a Beállítások → Felhasználók alatt ad részleget (Ügyvitel, Jog, Kiképzés, Személyügy, Pénzügy, Hadművelet). Addig itt csak a heti műveletek látszanak.</p>
                </div>
              )}

              {/* A részlegem fejezetei */}
              {showChapters && (
              <section className="bg-card border border-border" style={radius}>
                <header className="flex items-center gap-2 px-4 py-3 border-b border-border">
                  <PenLine className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-bold uppercase tracking-military flex-1">A részlegem nyitott fejezetei</h2>
                  <span className="text-xs font-mono text-muted-foreground">{todos.myChapters.length}</span>
                </header>
                {!todos.department ? (
                  <p className="px-4 py-4 text-xs text-muted-foreground font-mono">Nincs részleged beállítva, ezért itt nem jelenik meg fejezet. Az admin a Beállítások → Felhasználók alatt adja meg (Ügyvitel, Jog, Kiképzés, Személyügy, Pénzügy).</p>
                ) : todos.myChapters.length === 0 ? (
                  <p className="px-4 py-4 text-xs text-muted-foreground font-mono flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500" />Nincs nyitott fejezet — minden parancsban kész a részleg része.</p>
                ) : (
                  <ul>
                    {todos.myChapters.map((c) => (
                      <li key={c.chapterId}>
                        <button onClick={() => openOrder(c.orderId)} className="w-full text-left px-4 py-2.5 border-b border-border/50 hover:bg-secondary/40 flex items-start gap-3">
                          <span className={`mt-1 w-2 h-2 shrink-0 ${c.isOverdue ? 'bg-destructive' : c.hasText ? 'bg-amber-400' : 'bg-muted-foreground'}`} style={radius} title={c.isOverdue ? 'lejárt' : c.hasText ? 'folyamatban' : 'üres'} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm"><span className="font-medium">{c.chapter}</span> <span className="text-muted-foreground">— {c.number ? `${c.number} ` : ''}{c.subject}</span></span>
                            <span className="block text-xs font-mono text-muted-foreground">
                              {c.status}{c.assignee ? ` · ${c.assignee}` : ''}{!c.hasText ? ' · még üres' : ''}
                            </span>
                          </span>
                          {c.dueDate && (
                            <span className={`text-xs font-mono shrink-0 ${c.isOverdue ? 'text-destructive' : (c.daysLeft ?? 99) <= 7 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                              {c.isOverdue ? `lejárt ${Math.abs(c.daysLeft ?? 0)} napja` : `${c.daysLeft} nap`}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              )}

              {/* Szabadságok */}
              {showLeave && (
                <section className="bg-card border border-border" style={radius}>
                  <header className="flex items-center gap-2 px-4 py-3 border-b border-border">
                    <Palmtree className="w-4 h-4 text-primary" />
                    <h2 className="text-sm font-bold uppercase tracking-military flex-1">Jóváhagyásra váró szabadságok</h2>
                    <span className="text-xs font-mono text-muted-foreground">{todos.pendingLeaveCount}</span>
                  </header>
                  {todos.pendingLeave.length === 0 ? (
                    <p className="px-4 py-4 text-xs text-muted-foreground font-mono flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500" />Nincs elbírálatlan kérelem.</p>
                  ) : (
                    <ul>
                      {todos.pendingLeave.map((lv) => (
                        <li key={lv.id}>
                          <button onClick={() => navigate('/szabadsag')} className="w-full text-left px-4 py-2 border-b border-border/50 hover:bg-secondary/40 text-sm flex justify-between gap-3">
                            <span><span className="font-medium">{lv.personName}</span> <span className="text-muted-foreground">· {lv.type}</span></span>
                            <span className="font-mono text-xs text-muted-foreground">{lv.startDate} – {lv.endDate}</span>
                          </button>
                        </li>
                      ))}
                      {todos.pendingLeaveCount > todos.pendingLeave.length && (
                        <li className="px-4 py-2 text-xs font-mono text-muted-foreground">… és még {todos.pendingLeaveCount - todos.pendingLeave.length}.</li>
                      )}
                    </ul>
                  )}
                </section>
              )}
            </div>

            <div className="space-y-6">
              {/* Riasztások számokban — csak ami az én részlegemé */}
              {(showOrderAlerts || showTraining) && (
              <section className="bg-card border border-border" style={radius}>
                <header className="flex items-center gap-2 px-4 py-3 border-b border-border">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <h2 className="text-sm font-bold uppercase tracking-military flex-1">Ma esedékes</h2>
                </header>
                <ul className="text-sm">
                  {([
                    ...(showOrderAlerts ? [
                      ['Lejárt parancs-határidő (részlegem)', todos.alerts.overdueOrderDeadlines, 'text-destructive'],
                      ['Parancs-határidő hamarosan (részlegem)', todos.alerts.dueSoonOrderDeadlines, 'text-amber-400'],
                    ] as const : []),
                    ...(showTraining ? [
                      ['Alapkiképzés lejárt — leszerelendő', todos.alerts.basicTrainingOverdue, 'text-destructive'],
                      ['Alapkiképzés hamarosan lejár', todos.alerts.basicTrainingDueSoon, 'text-amber-400'],
                    ] as const : []),
                  ] as const).map(([label, count, cls]) => (
                    <li key={label}>
                      <button onClick={() => navigate('/figyelmeztetesek')} className="w-full flex justify-between px-4 py-2 border-b border-border/50 hover:bg-secondary/40 text-left">
                        <span className="text-muted-foreground">{label}</span>
                        <span className={`font-mono ${count ? cls : 'text-muted-foreground'}`}>{count}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
              )}

              {showOrderAlerts && todos.waitingSignature > 0 && (
                <button onClick={() => navigate('/parancsok')} className="w-full bg-card border border-primary/40 p-3 text-left text-sm flex items-center gap-2 hover:bg-secondary/40" style={radius}>
                  <FileSignature className="w-4 h-4 text-primary" />
                  {todos.waitingSignature} parancs minden fejezete kész — aláírásra vár.
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
