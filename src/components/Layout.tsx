import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Crosshair, Shield as ShieldIcon,
  Package, Truck, ShieldAlert, CalendarRange, CalendarDays, Megaphone, Settings, ChevronLeft, ChevronRight, LogOut, BellRing,
} from 'lucide-react';
import { qualificationAlerts } from '@/lib/store';

const navItems = [
  { path: '/', label: 'Áttekintés', icon: LayoutDashboard },
  { path: '/kozos-naptar', label: 'Közös naptár', icon: CalendarRange },
  { path: '/personnel', label: 'Személyek', icon: Users },
  { path: '/duties', label: 'Szolgálatok', icon: ShieldAlert },
  { path: '/operations', label: 'Műveletek', icon: Crosshair },
  { path: '/events', label: 'Események', icon: CalendarDays },
  { path: '/equipment', label: 'Felszerelés', icon: ShieldIcon },
  { path: '/inventory', label: 'Készletek', icon: Package },
  { path: '/vehicles', label: 'Járművek', icon: Truck },
  { path: '/announcements', label: 'Hírek', icon: Megaphone },
  { path: '/figyelmeztetesek', label: 'Figyelmeztetések', icon: BellRing, alertBadge: true },
  { path: '/settings', label: 'Beállítások', icon: Settings, adminOnly: true },
];

const roleBadge: Record<string, string> = {
  admin: 'ADMIN',
  reader: 'OLVASÓ',
  editor: 'SZERKESZTŐ',
  fejleszto: 'FEJLESZTŐ',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isAdmin } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [alertCount, setAlertCount] = useState(0);

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
  const [devTapCount, setDevTapCount] = useState(0);
  const [showEasterEgg, setShowEasterEgg] = useState(false);
  const tapResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eggHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const location = useLocation();

  useEffect(() => {
    return () => {
      if (tapResetRef.current) clearTimeout(tapResetRef.current);
      if (eggHideRef.current) clearTimeout(eggHideRef.current);
    };
  }, []);

  const handleDevNamesClick = () => {
    setDevTapCount(prev => {
      const next = prev + 1;

      if (tapResetRef.current) clearTimeout(tapResetRef.current);
      tapResetRef.current = setTimeout(() => setDevTapCount(0), 3000);

      if (next >= 5) {
        if (tapResetRef.current) clearTimeout(tapResetRef.current);
        setShowEasterEgg(true);
        if (eggHideRef.current) clearTimeout(eggHideRef.current);
        eggHideRef.current = setTimeout(() => setShowEasterEgg(false), 2600);
        return 0;
      }

      return next;
    });
  };

  return (
    <div className="flex min-h-screen bg-background">
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
          {navItems.map(item => {
            if (item.adminOnly && !isAdmin) return null;
            const active = item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path) || (item.path === '/settings' && location.pathname === '/activity-log');
            const badge = item.alertBadge && alertCount > 0 ? alertCount : 0;
            return (
              <NavLink
                key={item.path}
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
          <div />
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

        {/* Page content */}
        <main className="flex-1 p-6 crosshair-bg overflow-auto">
          {children}
          <button
            type="button"
            onClick={handleDevNamesClick}
            className="mt-8 w-full text-center text-[10px] tracking-military text-muted-foreground opacity-30 hover:opacity-60 transition-opacity select-none cursor-default"
          >
            Fejlesztők: Kovács Martin · Rédli Máté · Tóth Rafael
          </button>

          {showEasterEgg && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[120] px-4 py-2 bg-card border border-primary text-primary text-xs font-mono shadow-md" style={{ borderRadius: '2px' }}>
              🍓 Málnás édesség unlocked!
            </div>
          )}
        </main>
      </div>
    </div>
  );
}







