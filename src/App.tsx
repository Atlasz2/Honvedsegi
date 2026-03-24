import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import LoginPage from "@/components/LoginPage";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Personnel from "@/pages/Personnel";
import Exercises from "@/pages/Exercises";
import Training from "@/pages/Training";
import Equipment from "@/pages/Equipment";
import Inventory from "@/pages/Inventory";
import Vehicles from "@/pages/Vehicles";
import Duties from "@/pages/Duties";
import Announcements from "@/pages/Announcements";
import SettingsPage from "@/pages/SettingsPage";
import ActivityLogPage from "@/pages/ActivityLogPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppRoutes() {
  const { user, isAdmin } = useAuth();
  if (!user) return <LoginPage />;
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/personnel" element={<Personnel />} />
        <Route path="/exercises" element={<Exercises />} />
        <Route path="/training" element={<Training />} />
        <Route path="/equipment" element={<Equipment />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/vehicles" element={<Vehicles />} />
        <Route path="/duties" element={<Duties />} />
        <Route path="/announcements" element={<Announcements />} />
        {isAdmin && <Route path="/settings" element={<SettingsPage />} />}
        {isAdmin && <Route path="/activity-log" element={<ActivityLogPage />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
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
