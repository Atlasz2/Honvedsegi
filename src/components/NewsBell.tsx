import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Pin } from 'lucide-react';
import { announcements as store } from '@/lib/store';
import { useAutoRefresh } from '@/lib/useAutoRefresh';
import type { Announcement } from '@/lib/types';

/**
 * Hírek-harang a fejlécben: a közlemények ne vesszenek el az Áttekintés alján.
 * A számláló az itt, ebben a böngészőben még nem látott híreket mutatja
 * (localStorage — személyes kényelem, nem szerveroldali állapot); ha van
 * olvasatlan „Sürgős", a harang piros keretet és villogó pontot kap.
 */

const SEEN_KEY = 'newsbell.seen';
const LIST_LIMIT = 6;

function readSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeSeen(ids: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...ids]));
  } catch {
    /* privát mód / tiltott tárhely — a számláló ilyenkor nem marad meg, ennyi */
  }
}

function sortNews(list: Announcement[]): Announcement[] {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (b.date || '').localeCompare(a.date || '');
  });
}

export default function NewsBell() {
  const navigate = useNavigate();
  const [news, setNews] = useState<Announcement[]>([]);
  const [seen, setSeen] = useState<Set<string>>(() => readSeen());
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await store.getAll();
      setNews(Array.isArray(list) ? list : []);
    } catch {
      /* a fejléc-harang nem zavarja a munkát hibaüzenettel; a következő frissítés újra próbálja */
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useAutoRefresh(refresh);

  // Kattintás a lenyílón kívül → zár.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const unread = news.filter((n) => !seen.has(n.id));
  const urgentUnread = unread.some((n) => n.category === 'Sürgős');
  const visible = sortNews(news).slice(0, LIST_LIMIT);

  const markAllSeen = () => {
    const next = new Set(seen);
    news.forEach((n) => next.add(n.id));
    setSeen(next);
    writeSeen(next);
  };

  const openItem = (item: Announcement) => {
    const next = new Set(seen);
    next.add(item.id);
    setSeen(next);
    writeSeen(next);
    setOpen(false);
    navigate('/announcements', { state: { openAnnouncementId: item.id } });
  };

  const ringClass = urgentUnread
    ? 'border-destructive text-destructive'
    : unread.length > 0
      ? 'border-primary text-primary'
      : 'border-border text-muted-foreground hover:text-foreground hover:border-primary';

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`relative flex items-center justify-center w-8 h-8 border bg-input transition-colors ${ringClass}`}
        style={{ borderRadius: '2px' }}
        title={urgentUnread ? 'Sürgős közlemény!' : unread.length > 0 ? `${unread.length} új közlemény` : 'Hírek és közlemények'}
        aria-label="Hírek"
        data-testid="news-bell"
      >
        <Bell className="w-4 h-4" />
        {unread.length > 0 && (
          <span
            className={`absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 text-[10px] text-white font-mono flex items-center justify-center ${urgentUnread ? 'bg-destructive' : 'bg-primary'}`}
            style={{ borderRadius: '2px' }}
          >
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
        {urgentUnread && <span className="pulse-dot-red absolute -bottom-1 -left-1" />}
      </button>

      {open && (
        <div
          className="absolute left-0 top-10 w-80 max-w-[90vw] bg-card border border-border shadow-lg z-50"
          style={{ borderRadius: '2px' }}
        >
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <span className="text-xs uppercase tracking-military font-mono text-primary flex-1">Hírek és közlemények</span>
            {unread.length > 0 && (
              <button onClick={markAllSeen} className="text-[11px] font-mono text-muted-foreground hover:text-foreground">Mind olvasott</button>
            )}
          </div>
          {visible.length === 0 ? (
            <p className="px-3 py-4 text-xs text-muted-foreground font-mono">Nincs közlemény.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {visible.map((n) => {
                const isNew = !seen.has(n.id);
                const urgent = n.category === 'Sürgős';
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => openItem(n)}
                      className={`w-full text-left px-3 py-2 border-b border-border/50 hover:bg-secondary/40 ${urgent ? 'border-l-[3px] border-l-destructive' : 'border-l-[3px] border-l-transparent'}`}
                    >
                      <span className="flex items-center gap-2">
                        {n.pinned && <Pin className="w-3 h-3 text-primary flex-shrink-0" />}
                        <span className={`text-sm truncate flex-1 ${isNew ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>{n.title}</span>
                        {urgent && <span className="text-[10px] uppercase tracking-military font-mono text-destructive">Sürgős</span>}
                      </span>
                      <span className="block text-[11px] font-mono text-muted-foreground">{n.date?.slice(0, 10)} · {n.category}{n.author ? ` · ${n.author}` : ''}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <button
            onClick={() => { setOpen(false); navigate('/announcements'); }}
            className="w-full px-3 py-2 text-xs font-mono text-primary hover:bg-secondary/40 text-left"
          >
            Összes közlemény →
          </button>
        </div>
      )}
    </div>
  );
}
