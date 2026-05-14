import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import secureStorage from './secureStorage';
import { sanitizeForApi } from '../utils/validation';

// API_BASE — désormais lu depuis env (EXPO_PUBLIC_API_BASE).
// Audit 2026-04-25 : marketplace Django DeliveryApp expose strictement les
// mêmes endpoints (`/api/v1/delivery/login/`, `/available/`, `/accept/`,
// `/earnings/`, `/tickets/...`) que ceux consommés par cette app. Donc
// pointer sur le Django marketplace (localhost:8000 en dev, prod sinon)
// connecte directement pearl-delivery à la même DB que les 4 apps marketplace
// (WebsitePro, WebsiteUser, AppPro, AppUser) → un order food créé dans
// WebsiteUser apparaît dans /available/ pour les drivers en ligne.
//
// Pas de fallback vers serveur tiers : si EXPO_PUBLIC_API_BASE manque,
// on utilise l'IP dev locale en __DEV__, sinon string vide (les requêtes
// échouent avec une erreur réseau explicite plutôt que d'envoyer les
// données vers un serveur inconnu).
const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ||
  (__DEV__ ? 'http://192.168.1.15:8000' : '');

// Request ID generator for tracing
const generateRequestId = () =>
  'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);

// Timeout per request type (ms)
const TIMEOUTS = {
  GET: 10000,
  POST: 15000,
  PUT: 15000,
  DELETE: 10000,
};

// SSL certificate pinning is enforced at the OS level on Android via
// android/app/src/main/res/xml/network_security_config.xml (declared in the
// AndroidManifest). On iOS, true pinning still requires a native module
// (react-native-ssl-pinning + EAS Build, or Bare Workflow) — tracked in
// services/certPinning.js, which surfaces a runtime warning when pins look
// unconfigured.

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'X-Platform': 'mobile',
  },
});

// Sanitize request data recursively
function sanitizeRequestData(data) {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sanitizeRequestData);
  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeForApi(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeRequestData(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// Request interceptor - attach token, sanitize, add headers
api.interceptors.request.use(async (config) => {
  // Tokens live in expo-secure-store (Keychain/Keystore) — not AsyncStorage,
  // which is unencrypted plain JSON readable by other apps on a rooted device.
  const token = await secureStorage.getSecure('accessToken').catch(() => null);
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // Request ID for tracing
  config.headers['X-Request-ID'] = generateRequestId();

  // Rate limiting headers
  config.headers['X-Client-Version'] = '1.0.0';

  // Set timeout based on method
  const method = (config.method || 'GET').toUpperCase();
  config.timeout = TIMEOUTS[method] || 15000;

  // Sanitize request body (skip file uploads)
  if (config.data && typeof config.data === 'object' && !(config.data instanceof FormData)) {
    config.data = sanitizeRequestData(config.data);
  }

  // Never log tokens or sensitive data
  // console.log is intentionally omitted for auth headers

  return config;
});

// Token refresh singleton — empêche que deux requêtes 401 simultanées
// déclenchent deux refresh concurrents (le 2e invalide le 1er → logout
// prématuré mid-delivery). Toutes les 401 attendent la même Promise.
let _refreshPromise = null;

async function _refreshAccessToken() {
  const refreshToken = await secureStorage.getSecure('refreshToken').catch(() => null);
  if (!refreshToken) {
    throw new Error('No refresh token');
  }
  const { data } = await axios.post(`${API_BASE}/api/v1/delivery/token/refresh/`, { refresh: refreshToken });
  await secureStorage.setSecure('accessToken', data.access);
  if (data.refresh) await secureStorage.setSecure('refreshToken', data.refresh);
  return data.access;
}

// Response interceptor - handle 401, sanitize errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        // Réutilise la promise en cours si déjà en train de refresh ;
        // sinon en démarre une et la stocke pour les autres requêtes 401
        // simultanées. Le finally clear le singleton dans tous les cas.
        if (!_refreshPromise) {
          _refreshPromise = _refreshAccessToken().finally(() => {
            _refreshPromise = null;
          });
        }
        const access = await _refreshPromise;
        originalRequest.headers.Authorization = `Bearer ${access}`;
        return api(originalRequest);
      } catch (refreshError) {
        await secureStorage.removeSecure('accessToken').catch(() => {});
        await secureStorage.removeSecure('refreshToken').catch(() => {});
        await AsyncStorage.removeItem('userData').catch(() => {});
        return Promise.reject(createSafeError('Session expired'));
      }
    }
    return Promise.reject(createSafeError(error));
  }
);

// Sanitize error responses -- never leak server details to the UI
function createSafeError(error) {
  if (typeof error === 'string') {
    return new Error(error);
  }
  const status = error?.response?.status;
  const safeMessages = {
    400: 'Invalid request',
    401: 'Authentication required',
    403: 'Access denied',
    404: 'Resource not found',
    429: 'Too many requests. Please try again later.',
    500: 'Server error. Please try again.',
    502: 'Server temporarily unavailable',
    503: 'Service unavailable',
  };
  const message = safeMessages[status] || 'An error occurred. Please try again.';
  const safeError = new Error(message);
  safeError.status = status;
  safeError.isNetworkError = !error?.response;
  return safeError;
}

export default api;
