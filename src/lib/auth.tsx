import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AuthToken, Role } from './types';
import { getToken, clearToken, login as storeLogin } from './store';

interface AuthContextType {
  user: AuthToken | null;
  login: (username: string, password: string) => { success: boolean; error?: string };
  logout: () => void;
  canEdit: boolean;
  isAdmin: boolean;
  isDev: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: () => ({ success: false }),
  logout: () => {},
  canEdit: false,
  isAdmin: false,
  isDev: false,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthToken | null>(getToken);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const t = getToken();
      if (!t && user) logout();
    }, 60000);
    return () => clearInterval(interval);
  }, [user, logout]);

  const loginFn = (username: string, password: string) => {
    const result = storeLogin(username, password);
    if (result.success && result.token) {
      setUser(result.token);
    }
    return result;
  };

  const canEdit = user?.role === 'admin' || user?.role === 'fejleszto';
  const isAdmin = user?.role === 'admin' || user?.role === 'fejleszto';
  const isDev = user?.role === 'fejleszto';

  return (
    <AuthContext.Provider value={{ user, login: loginFn, logout, canEdit, isAdmin, isDev }}>
      {children}
    </AuthContext.Provider>
  );
}
