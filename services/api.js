import axios from 'axios';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import secureStorage from './secureStorage';
import { sanitizeForApi } from '../utils/validation';
import { delierLivreurOneSignal } from './oneSignalInit';

// Pearl Streets backend. Dev → local Django (port 8000); prod → public API.
// Testing on a physical device in dev: replace localhost with your LAN IP.
const API_BASE = __DEV__ ? 'http://localhost:8000' : 'https://api.pearlstreets.com';

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
// const SSL_PINS = { 'api.pearlstreets.com': ['sha256/XXXX...'] };

let VERSION_APPLI = '1.0.0';
try {
  VERSION_APPLI = Constants.expoConfig?.version || VERSION_APPLI;
} catch {
  // Config illisible : on garde 1.0.0.
}

// Révision du code JS, envoyée dans X-Client-Revision. X-Client-Version vaut
// la version du binaire (app.json), identique pour toutes les OTA d'un même
// runtime : le serveur ne peut pas s'en servir pour savoir quelle OTA tourne.
// À augmenter de 1 quand une OTA change ce que l'app sait traiter.
//   2 : écrans IBAN, profil, véhicule et documents qui attendent la réponse du
//       serveur et affichent son message de refus (409, 403...) ; passage en
//       ligne annulé, avec le message du serveur, s'il le refuse (4xx).
const REVISION_JS = 2;

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
  const token = await secureStorage.getSecure('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // Request ID for tracing
  config.headers['X-Request-ID'] = generateRequestId();

  // Rate limiting headers : vraie version de l'appli, 1.0.0 si illisible.
  config.headers['X-Client-Version'] = VERSION_APPLI;
  config.headers['X-Client-Revision'] = String(REVISION_JS);

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

async function purgerSession() {
  delierLivreurOneSignal();
  await secureStorage.removeSecure('accessToken');
  await secureStorage.removeSecure('refreshToken');
  await AsyncStorage.removeItem('userData');
}

// Un seul rafraîchissement à la fois : le serveur fait tourner le jeton de
// rafraîchissement et met l'ancien en liste noire. Deux 401 simultanés (écran +
// envoi de position) renouvelaient deux fois : le second échouait et
// déconnectait le livreur. Les appels concurrents attendent le même résultat.
let rafraichissementEnCours = null;
function rafraichirJetons() {
  if (!rafraichissementEnCours) {
    rafraichissementEnCours = (async () => {
      const refreshToken = await secureStorage.getSecure('refreshToken');
      if (!refreshToken) return null;
      const { data } = await axios.post(`${API_BASE}/api/v1/delivery/token/refresh/`, { refresh: refreshToken });
      await secureStorage.setSecure('accessToken', data.access);
      if (data.refresh) await secureStorage.setSecure('refreshToken', data.refresh);
      return data.access;
    })().finally(() => { rafraichissementEnCours = null; });
  }
  return rafraichissementEnCours;
}

// Response interceptor - handle 401, sanitize errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      let access = null;
      try {
        access = await rafraichirJetons();
      } catch (refreshError) {
        // Réseau coupé (tunnel, zone blanche) ou serveur indisponible : la
        // session reste valable, on ne déconnecte pas le livreur ; la prochaine
        // requête retentera. Seul un jeton refusé (400/401) ferme la session.
        const statut = refreshError?.response?.status;
        if (statut !== 400 && statut !== 401) return Promise.reject(createSafeError(refreshError));
        await purgerSession();
        return Promise.reject(createSafeError('Session expired'));
      }
      if (!access) {
        await purgerSession();
        return Promise.reject(createSafeError('Session expired'));
      }
      originalRequest.headers.Authorization = `Bearer ${access}`;
      return api(originalRequest);
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
  // Message rédigé par le serveur pour le livreur (refus 4xx seulement, jamais
  // une erreur 5xx ni une page HTML) : affiché tel quel par l'écran appelant.
  safeError.serverMessage = messageServeur(status, error?.response?.data);
  return safeError;
}

// Premier texte lisible d'une réponse d'erreur 4xx : erreurs par champ
// ({ errors: { iban: ['...'] } }), puis detail, message ou error.
function messageServeur(status, data) {
  if (!status || status < 400 || status >= 500) return null;
  if (!data || typeof data !== 'object') return null;
  const propre = (v) => (typeof v === 'string' && v.trim() && v.trim().length <= 300 && !/</.test(v) ? v.trim() : null);
  const premier = (v) => {
    if (propre(v)) return propre(v);
    if (Array.isArray(v)) {
      for (const x of v) { const m = premier(x); if (m) return m; }
    } else if (v && typeof v === 'object') {
      for (const x of Object.values(v)) { const m = premier(x); if (m) return m; }
    }
    return null;
  };
  const generique = /^(validation error|invalid request)$/i;
  for (const cle of ['errors', 'detail', 'message', 'error']) {
    const m = premier(data[cle]);
    if (m && !generique.test(m)) return m;
  }
  return null;
}

export default api;
