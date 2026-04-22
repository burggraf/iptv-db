import { useState, useEffect, createContext, useContext, type ReactNode } from 'react';
import type { AuthModel } from 'pocketbase';
import { pb, isAuthenticated, login, logout } from '../lib/pocketbase';

interface AuthContextType {
  user: AuthModel | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthModel | null>(pb.authStore.model);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen for auth changes
    pb.authStore.onChange(() => {
      setUser(pb.authStore.model);
    });
    setLoading(false);
  }, []);

  const doLogin = async (email: string, password: string) => {
    await login(email, password);
    setUser(pb.authStore.model);
  };

  const doLogout = () => {
    logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login: doLogin, logout: doLogout }}>
      {children}
    </AuthContext.Provider>
  );
}
