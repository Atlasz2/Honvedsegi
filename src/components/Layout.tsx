import React, { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Crosshair, GraduationCap, Shield as ShieldIcon,
  Package, Truck, Calendar, Megaphone, Settings, ChevronLeft, ChevronRight, LogOut
} from 'lucide-react';

const navItems = [
  { path: '/', label: 'Áttekintés', icon: LayoutDashboard },
  { path: '/personnel', label: 'Személyek', icon: Users },
  { path: '/exercises', label: 'Gyakorlatok', icon: Crosshair },
  { path: '/training', label: 'Kiképzések', icon: GraduationCap },
  { path: '/equipment', label: 'Felszerelés', icon: ShieldIcon },
  { path: '/inventory', label: 'Készletek', icon: Package },
  { path: '/vehicles', label: 'Járművek', icon: Truck },
  { path: '/duties', label: 'Szolgálatok', icon: Calendar },
  { path: '/announcements', label: 'Hírek', icon: Megaphone },
  { path: '/settings', label: 'Beállítások', icon: Settings, adminOnly: true },
];

const roleBadge: Record<string, string> = {
  admin: 'ADMIN',
  reader: 'OLVASÓ',
  fejleszto: 'FEJLESZTŐ',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isAdmin } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

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
            const active = item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path);
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
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span className="font-rajdhani font-medium tracking-wide">{item.label}</span>}
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
        </main>
      </div>
    </div>
  );
}
