import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { login as apiLogin, logout as apiLogout, getStoredUser } from './auth';
import api from './api';

const AuthContext = createContext(null);

const PUBLIC_ROUTES = ['/login', '/register', '/forgot-password'];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const stored = getStoredUser();
    if (stored) {
      setUser(stored);
      api.get('/delivery/profile/').then(({ data }) => {
        const profile = data.data || data;
        setUser(profile);
        sessionStorage.setItem('user', JSON.stringify(profile));
      }).catch(() => {});
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (loading) return;
    const isPublic = PUBLIC_ROUTES.includes(router.pathname);
    if (!user && !isPublic) router.replace('/login');
    if (user && isPublic) router.replace('/');
  }, [user, loading, router.pathname]);

  const login = useCallback(async (email, password) => {
    const data = await apiLogin(email, password);
    setUser(data.user);
    router.push('/');
    return data;
  }, [router]);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    router.push('/login');
  }, [router]);

  const refreshProfile = useCallback(async () => {
    const { data } = await api.get('/delivery/profile/');
    const profile = data.data || data;
    setUser(profile);
    sessionStorage.setItem('user', JSON.stringify(profile));
    return profile;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
