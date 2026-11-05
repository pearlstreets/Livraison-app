import { EN_TETE_PROVENANCE, provenanceInstallation } from './provenanceInstall';
import axios from 'axios';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import secureStorage from './secureStorage';
import { enteteSelfie } from './selfieCamera';
import { sanitizeForApi } from '../utils/validation';

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
//   3 : refus 403 « documents_requis » (passage en ligne, acceptation)
//       reconnu : écran des documents demandés au seuil de gains.
const REVISION_JS = 3;

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

  // Provenance publicitaire de l'installation (services/provenanceInstall),
  // sur les POST : le serveur la range sur le compte livreur créé.
  if ((config.method || '').toLowerCase() === 'post') {
    config.headers[EN_TETE_PROVENANCE] = provenanceInstallation();
  }

  // Rate limiting headers : vraie version de l'appli, 1.0.0 si illisible.
  config.headers['X-Client-Version'] = VERSION_APPLI;
  config.headers['X-Client-Revision'] = String(REVISION_JS);
  // Vérification d'identité par selfie vidéo : 1 si la caméra peut filmer,
  // 0 sinon (permission refusée pour de bon ou absente de l'appareil).
  config.headers['X-Pearl-Selfie'] = enteteSelfie();

  // Set timeout based on method, sauf délai explicite de l'appelant (retrait
  // d'appareil à 4 s, vérification SIRET à 9 s) : seul le délai par défaut de
  // l'instance est remplacé.
  const method = (config.method || 'GET').toUpperCase();
  if (config.timeout == null || config.timeout === api.defaults.timeout) {
    config.timeout = TIMEOUTS[method] || 15000;
  }

  // Sanitize request body (skip file uploads)
  if (config.data && typeof config.data === 'object' && !(config.data instanceof FormData)) {
    config.data = sanitizeRequestData(config.data);
  }

  // Never log tokens or sensitive data
  // console.log is intentionally omitted for auth headers

  return config;
});

// Rappel posé par AuthContext : la session vient d'être refusée par le
// serveur (jeton expiré, mot de passe changé, compte désactivé ailleurs).
// Sans lui, les jetons étaient vidés mais l'écran restait « connecté ».
let surSessionPurgee = null;
export function setOnSessionPurgee(rappel) {
  surSessionPurgee = typeof rappel === 'function' ? rappel : null;
}

async function purgerSession() {
  // Session déjà perdue : l'appareil ne peut plus être retiré côté serveur
  // (route authentifiée), le retrait est gardé en attente et rejoué au
  // prochain enregistrement. Import tardif : pushDirect importe api.
  try {
    require('./pushDirect').oublierAppareil();
  } catch {
    // Module indisponible : rien à oublier.
  }
  await secureStorage.removeSecure('accessToken');
  await secureStorage.removeSecure('refreshToken');
  await AsyncStorage.removeItem('userData');
  if (surSessionPurgee) {
    try { surSessionPurgee(); } catch { /* l'écran se mettra à jour au prochain appel */ }
  }
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
      // Délai borné : sans lui, un réseau muet bloquait tous les appels en
      // attente de ce rafraîchissement.
      const { data } = await axios.post(`${API_BASE}/api/v1/delivery/token/refresh/`, { refresh: refreshToken }, { timeout: 8000 });
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
    // Connexion, inscription, mot de passe oublié : un 401 y veut dire
    // « identifiants refusés », pas « jeton expiré ». Sans cette exception,
    // un mauvais mot de passe lançait un rafraîchissement, vidait la session
    // et remontait « Session expired » sans statut.
    const routeSansSession = /\/api\/v1\/delivery\/(login|register|forgot-password|reset-password|token\/refresh)\//.test(originalRequest?.url || '');
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !routeSansSession) {
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
  const corps = error?.response?.data;
  // Vérification d'identité (423 bloqué, 409 vérification expirée) : état
  // renvoyé par le serveur, lu par l'écran de vérification.
  if (corps && typeof corps === 'object') {
    if (corps.identite && typeof corps.identite === 'object') safeError.identite = corps.identite;
    if (typeof corps.status === 'string') safeError.statutServeur = corps.status;
  }
  // Code machine d'un refus 4xx (ex. 403 « documents_requis ») et son corps,
  // lus par les écrans qui savent les traiter ; jamais affichés tels quels.
  if (status >= 400 && status < 500 && corps && typeof corps === 'object' && !Array.isArray(corps)) {
    if (typeof corps.code === 'string') safeError.code = corps.code;
    safeError.serverData = corps;
  }
  // Code court d'un 502 du virement instantané (echec_virement), lu par l'écran Gains.
  if (!safeError.code && status >= 500 && typeof corps?.code === 'string') safeError.code = corps.code;
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
