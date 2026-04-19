import api from './api';

// Use sessionStorage (not localStorage) - tokens cleared on tab close
const store = typeof window !== 'undefined' ? sessionStorage : null;

export async function login(email, password) {
  const { data } = await api.post('/delivery/login/', { email, password });
  if (store) {
    store.setItem('accessToken', data.access_token);
    store.setItem('refreshToken', data.refresh_token);
    store.setItem('user', JSON.stringify(data.user));
    store.setItem('loginAt', Date.now().toString());
  }
  return data;
}

export async function register(payload) {
  const { data } = await api.post('/delivery/register/', payload);
  return data;
}

export async function logout() {
  try {
    const refresh = store?.getItem('refreshToken');
    if (refresh) await api.post('/delivery/logout/', { refresh });
  } catch {}
  if (store) {
    store.removeItem('accessToken');
    store.removeItem('refreshToken');
    store.removeItem('user');
    store.removeItem('csrfToken');
    store.removeItem('loginAt');
  }
}

export async function forgotPassword(email) {
  const { data } = await api.post('/delivery/forgot-password/', { email });
  return data;
}

export async function resetPassword(email, otp, newPassword) {
  const { data } = await api.post('/delivery/reset-password/', { email, otp, new_password: newPassword });
  return data;
}

export async function changePassword(oldPassword, newPassword) {
  const { data } = await api.post('/delivery/update-password/', { old_password: oldPassword, new_password: newPassword });
  return data;
}

export function getStoredUser() {
  if (!store) return null;
  // Check absolute session expiry (24h max)
  const loginAt = store.getItem('loginAt');
  if (loginAt && Date.now() - parseInt(loginAt) > 24 * 60 * 60 * 1000) {
    store.removeItem('accessToken');
    store.removeItem('refreshToken');
    store.removeItem('user');
    store.removeItem('loginAt');
    return null;
  }
  const raw = store.getItem('user');
  return raw ? JSON.parse(raw) : null;
}

export function isAuthenticated() {
  if (!store) return false;
  return !!store.getItem('accessToken');
}
