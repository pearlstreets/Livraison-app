import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sanitizeForApi } from '../utils/validation';

// Base URL resolution order:
//  1. EXPO_PUBLIC_API_URL env var (set at build time via `app.config.ts`,
//     `eas.json`, or a plain `.env`) — lets prod / staging / local point to
//     Pearl Streets without code changes.
//  2. Hardcoded fallback — the dev backend we've been using all along.
const API_BASE = (process.env.EXPO_PUBLIC_API_URL || 'https://pythonapi.digiexports.in').replace(/\/+$/, '');
export { API_BASE };

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

// SSL certificate pinning placeholder
// TODO: Implement cert pinning with react-native-ssl-pinning or similar
// const SSL_PINS = { 'pythonapi.digiexports.in': ['sha256/XXXX...'] };

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
  const token = await AsyncStorage.getItem('accessToken');
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

// Response interceptor - handle 401, sanitize errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = await AsyncStorage.getItem('refreshToken');
        if (!refreshToken) {
          await AsyncStorage.multiRemove(['accessToken', 'refreshToken', 'userData']);
          return Promise.reject(createSafeError('Session expired'));
        }
        const { data } = await axios.post(`${API_BASE}/api/v1/delivery/token/refresh/`, { refresh: refreshToken });
        await AsyncStorage.setItem('accessToken', data.access);
        if (data.refresh) await AsyncStorage.setItem('refreshToken', data.refresh);
        originalRequest.headers.Authorization = `Bearer ${data.access}`;
        return api(originalRequest);
      } catch (refreshError) {
        await AsyncStorage.multiRemove(['accessToken', 'refreshToken', 'userData']);
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
