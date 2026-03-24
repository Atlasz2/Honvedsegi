import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AuthToken } from './types';
import { getToken, login as storeLogin, logoutSession } from './store';

interface AuthContextType {
  user: AuthToken | null;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  canEdit: boolean;
  isAdmin: boolean;
  isDev: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: async () => ({ success: false }),
  logout: () => {},
  canEdit: false,
  isAdmin: false,
  isDev: false,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthToken | null>(getToken);

  const logout = useCallback(() => {
    void logoutSession();
    setUser(null);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const token = getToken();
      if (!token && user) {
        logout();
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [user, logout]);

  const loginFn = useCallback(async (username: string, password: string) => {
    const result = await storeLogin(username, password);
    if (result.success && result.token) {
      setUser(result.token);
    }
    return { success: result.success, error: result.error };
  }, []);

  const canEdit = user?.role === 'editor' || user?.role === 'admin' || user?.role === 'fejleszto';
  const isAdmin = user?.role === 'admin' || user?.role === 'fejleszto';
  const isDev = user?.role === 'fejleszto';

  return (
    <AuthContext.Provider value={{ user, login: loginFn, logout, canEdit, isAdmin, isDev }}>
      {children}
    </AuthContext.Provider>
  );
}
