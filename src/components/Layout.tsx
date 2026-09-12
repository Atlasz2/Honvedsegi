import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ListChecks, Users, Crosshair, Shield as ShieldIcon,
  Package, Truck, CalendarRange, CalendarDays, Settings, ChevronLeft, ChevronRight, LogOut, BellRing, ClipboardCheck, Palmtree, History, FileSignature,
} from 'lucide-react';
import { qualificationAlerts } from '@/lib/store';
import CommandPalette, { openCommandPalette } from '@/components/CommandPalette';
import { useConnection, setOnline } from '@/lib/connection';
import { Search, WifiOff } from 'lucide-react';

// A menü sorrendje a napi munka sorrendje: ami rám vár → mi a helyzet → naptár →
// emberek → feladatok → parancsok → figyelmeztetések → napló → beállítások.
// A Helyzetkép az Áttekintésbe, a Foglaltság a Közös naptárba, a Hírek az
// Áttekintésbe olvadt; a logisztika (felszerelés/készlet/jármű) külön csoport a
// végén — 2 hét múlva dől el, kell-e egyáltalán.
type NavItem = { path: string; label: string; icon: typeof Users; alertBadge?: boolean; editorOnly?: boolean; group?: string };

const navItems: NavItem[] = [
  { path: '/', label: 'Teendőim', icon: ListChecks },
  { path: '/attekintes', label: 'Áttekintés', icon: LayoutDashboard },
  { path: '/kozos-naptar', label: 'Közös naptár', icon: CalendarRange },
  { path: '/personnel', label: 'Személyek', icon: Users },
  { path: '/letszam', label: 'Létszám', icon: ClipboardCheck },
  { path: '/szabadsag', label: 'Szabadság', icon: Palmtree },
  { path: '/operations', label: 'Műveletek', icon: Crosshair },
  { path: '/events', label: 'Események', icon: CalendarDays },
  { path: '/parancsok', label: 'Parancsok', icon: FileSignature },
  { path: '/figyelmeztetesek', label: 'Figyelmeztetések', icon: BellRing, alertBadge: true },
  { path: '/activity-log', label: 'Napló', icon: History },
  { path: '/settings', label: 'Beállítások', icon: Settings, editorOnly: true },
  { path: '/equipment', label: 'Felszerelés', icon: ShieldIcon, group: 'Logisztika' },
  { path: '/inventory', label: 'Készletek', icon: Package, group: 'Logisztika' },
  { path: '/vehicles', label: 'Járművek', icon: Truck, group: 'Logisztika' },
];

const roleBadge: Record<string, string> = {
  admin: 'ADMIN',
  reader: 'OLVASÓ',
  editor: 'SZERKESZTŐ',
  fejleszto: 'ALKOTÓ',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, canEdit } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const online = useConnection();
  const location = useLocation();

  // Kapcsolat-vesztéskor 5 másodpercenként megpróbáljuk a health-végpontot,
  // és amint válaszol, a sáv eltűnik.
  useEffect(() => {
    if (online) return;
    const iv = setInterval(async () => {
      try {
        const response = await fetch('/api/health', { cache: 'no-store' });
        if (response.ok) setOnline(true);
      } catch {
        // még mindig nincs kapcsolat
      }
    }, 5000);
    return () => clearInterval(iv);
  }, [online]);

  useEffect(() => {
    const fetchAlertCount = async () => {
      try {
        const data = await qualificationAlerts.getAlerts(60);
        setAlertCount(data.length);
      } catch {
        // silently ignore — badge simply shows 0
      }
    };
    void fetchAlertCount();
    const iv = setInterval(() => { void fetchAlertCount(); }, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);
  return (
    <div className="flex min-h-screen bg-background">
      <CommandPalette />
      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-screen bg-sidebar border-r border-border flex flex-col z-50 transition-all duration-200 scanline-overlay ${collapsed ? 'w-16' : 'w-56'}`}
        style={{ borderRight: '1px solid hsl(222 20% 21%)' }}
      >
        {/* Logo */}
        <div className={`h-14 flex items-center border-b border-border px-3 ${collapsed ? 'justify-center' : 'gap-2'}`}>
          <ShieldIcon className="w-6 h-6 text-primary flex-shrink-0" />
          {!collapsed && (
            <div>
              <span className="text-lg font-bold font-rajdhani tracking-military-wide text-primary">HONVÉD</span>
              <p className="text-[10px] text-muted-foreground -mt-1 tracking-military">TARTALÉKOS EGYSÉG</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {navItems.map((item, index) => {
            if (item.editorOnly && !canEdit) return null;
            const groupStart = item.group && navItems[index - 1]?.group !== item.group;
            const active = item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path);
            const badge = item.alertBadge && alertCount > 0 ? alertCount : 0;
            return (
              <React.Fragment key={item.path}>
              {groupStart && !collapsed && (
                <p className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-military font-mono text-muted-foreground/70">{item.group}</p>
              )}
              {groupStart && collapsed && <div className="mx-3 my-2 h-px bg-border" />}
              <NavLink
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 mx-1 my-0.5 text-sm transition-colors ${
                  active
                    ? 'text-primary bg-primary/10 border-l-[3px] border-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary border-l-[3px] border-transparent'
                } ${collapsed ? 'justify-center px-0' : ''}`}
                style={{ borderRadius: '2px' }}
                title={collapsed ? item.label : undefined}
              >
                <span className="relative flex-shrink-0">
                  <item.icon className="w-5 h-5" />
                  {collapsed && badge > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 bg-destructive text-[10px] text-white font-mono flex items-center justify-center" style={{ borderRadius: '2px' }}>
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </span>
                {!collapsed && <span className="font-rajdhani font-medium tracking-wide flex-1">{item.label}</span>}
                {!collapsed && badge > 0 && (
                  <span className="px-1.5 py-0.5 bg-destructive text-[10px] text-white font-mono" style={{ borderRadius: '2px' }}>
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </NavLink>
              </React.Fragment>
            );
          })}
        </nav>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="h-10 flex items-center justify-center border-t border-border text-muted-foreground hover:text-foreground transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </aside>

      {/* Main content */}
      <div className={`flex-1 flex flex-col transition-all duration-200 ${collapsed ? 'ml-16' : 'ml-56'}`}>
        {/* Top bar */}
        <header className="h-12 bg-sidebar border-b border-border flex items-center justify-between px-4 sticky top-0 z-40">
          <div className="flex-1 flex justify-center px-4">
            <button
              onClick={openCommandPalette}
              className="w-full max-w-md flex items-center gap-2 bg-input border border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
              style={{ borderRadius: '2px' }}
              title="Gyorskereső (Ctrl+K is nyitja)"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="flex-1 text-left">Keresés: név, SZTSZ, parancs, művelet…</span>
              <span className="hidden md:inline font-mono text-[10px] border border-border px-1" style={{ borderRadius: '2px' }}>Ctrl+K</span>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-brass font-rajdhani font-semibold text-sm">{user?.displayName}</span>
            <span className="px-2 py-0.5 text-[10px] uppercase tracking-military font-mono border border-border text-muted-foreground" style={{ borderRadius: '2px' }}>
              {roleBadge[user?.role || ''] || user?.role}
            </span>
            <button onClick={logout} className="text-muted-foreground hover:text-destructive transition-colors p-1" title="Kijelentkezés">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {!online && (
          <div className="bg-destructive/15 border-b border-destructive/40 text-destructive px-4 py-2 text-xs font-mono flex items-center gap-2">
            <WifiOff className="w-4 h-4" />
            Nincs kapcsolat a központi géppel — a rendszer 5 másodpercenként újra próbálkozik. Amíg ez látszik, a mentések nem mennek át.
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 p-6 crosshair-bg overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}







