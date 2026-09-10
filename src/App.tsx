import { Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import LoginPage from "@/components/LoginPage";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";

// Útvonalanként külön csomag: az első betöltés csak a bejelentkezést és az
// áttekintőt hozza le. A Dashboard szándékosan NEM lazy — az a kezdőoldal.
const CalendarPage = lazy(() => import("@/pages/CalendarPage"));
const Personnel = lazy(() => import("@/pages/Personnel"));
const Operations = lazy(() => import("@/pages/Operations"));
const Events = lazy(() => import("@/pages/Events"));
const Equipment = lazy(() => import("@/pages/Equipment"));
const Inventory = lazy(() => import("@/pages/Inventory"));
const Vehicles = lazy(() => import("@/pages/Vehicles"));
const Duties = lazy(() => import("@/pages/Duties"));
const Announcements = lazy(() => import("@/pages/Announcements"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const ActivityLogPage = lazy(() => import("@/pages/ActivityLogPage"));
const Alerts = lazy(() => import("@/pages/Alerts"));
const Attendance = lazy(() => import("@/pages/Attendance"));
const Leave = lazy(() => import("@/pages/Leave"));
const Helyzetkep = lazy(() => import("@/pages/Helyzetkep"));
const Availability = lazy(() => import("@/pages/Availability"));
const Kovetelmenyek = lazy(() => import("@/pages/Kovetelmenyek"));
const NotFound = lazy(() => import("@/pages/NotFound"));

// Intranetes, egygépes üzem: az ablakváltásra való automatikus újratöltés csak
// fölösleges kéréseket generálna. A frissítést az oldalak maguk kérik.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

function AppRoutes() {
  const { user, canEdit } = useAuth();
  if (!user) return <LoginPage />;
  return (
    <Layout>
      <Suspense fallback={<p className="text-xs text-muted-foreground font-mono p-6">Betöltés…</p>}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/kozos-naptar" element={<CalendarPage />} />
          <Route path="/kozos-naptar/*" element={<CalendarPage />} />
          <Route path="/calendar" element={<Navigate to="/kozos-naptar" replace />} />
          <Route path="/calendar/*" element={<Navigate to="/kozos-naptar" replace />} />
          <Route path="/personnel" element={<Personnel />} />
          <Route path="/letszam" element={<Attendance />} />
          <Route path="/szabadsag" element={<Leave />} />
          <Route path="/helyzetkep" element={<Helyzetkep />} />
          <Route path="/foglaltsag" element={<Availability />} />
          <Route path="/kovetelmenyek" element={<Kovetelmenyek />} />
          <Route path="/operations" element={<Operations />} />
          <Route path="/events" element={<Events />} />
          <Route path="/equipment" element={<Equipment />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/vehicles" element={<Vehicles />} />
          <Route path="/duties" element={<Duties />} />
          <Route path="/announcements" element={<Announcements />} />
          <Route path="/figyelmeztetesek" element={<Alerts />} />
          {canEdit && <Route path="/settings" element={<SettingsPage />} />}
          <Route path="/activity-log" element={<ActivityLogPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster position="bottom-right" duration={2800} />
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;



