import axios from 'axios';

const API_BASE = 'https://api.pearlstreets.com:81/api/v1';

// Generate CSRF token for each session
function getCsrfToken() {
  if (typeof window === 'undefined') return '';
  let token = sessionStorage.getItem('csrfToken');
  if (!token) {
    token = 'csrf_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem('csrfToken', token);
  }
  return token;
}

// Session timeout - auto logout after 30 min of inactivity
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
let sessionTimer = null;

function resetSessionTimeout() {
  if (typeof window === 'undefined') return;
  if (sessionTimer) clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => {
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('refreshToken');
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('csrfToken');
    if (typeof window !== 'undefined') window.location.href = '/';
  }, SESSION_TIMEOUT_MS);
}

// Track user activity to reset timeout
if (typeof window !== 'undefined') {
  ['click', 'keypress', 'scroll', 'touchstart'].forEach(event => {
    window.addEventListener(event, resetSessionTimeout, { passive: true });
  });
}

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach token + CSRF to every request
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    // Use sessionStorage instead of localStorage (cleared on tab close)
    const token = sessionStorage.getItem('accessToken');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    // CSRF token
    config.headers['X-CSRF-Token'] = getCsrfToken();
    // Reset inactivity timeout
    resetSessionTimeout();
  }
  return config;
});

// Handle 401 - try refresh, then logout
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refresh = sessionStorage.getItem('refreshToken');
        if (!refresh) throw new Error('No refresh token');
        const { data } = await axios.post(`${API_BASE}/delivery/token/refresh/`, { refresh });
        sessionStorage.setItem('accessToken', data.access);
        if (data.refresh) sessionStorage.setItem('refreshToken', data.refresh);
        original.headers.Authorization = `Bearer ${data.access}`;
        return api(original);
      } catch {
        sessionStorage.removeItem('accessToken');
        sessionStorage.removeItem('refreshToken');
        sessionStorage.removeItem('user');
        if (typeof window !== 'undefined') window.location.href = '/';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
