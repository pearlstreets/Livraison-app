/**
 * Initialize OneSignal exactly once at app start.
 *
 * The app id comes from `app.json` -> expo.extra.oneSignalAppId (or the
 * EAS build env profile if you override it there). When the id is empty
 * OR the native module isn't bundled (pre-rebuild), this is a silent
 * no-op and the app keeps working — the backend will still broadcast
 * via `included_segments=['All']` in that case, just to 0 recipients
 * until a build with OneSignal native module is shipped.
 *
 * Call this from App.js top-level so it runs before the user logs in
 * (OneSignal needs to be initialized before .login() is useful).
 */
import Constants from 'expo-constants';

let _initialized = false;
// Module OneSignal, seulement une fois initialize() réellement appelé.
let _oneSignal = null;
let _idLie = null;

export function initOneSignalOnce() {
  if (_initialized) return;
  _initialized = true;

  try {
    const moduleName = 'react-native-onesignal';
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const mod = require(moduleName);
    const OneSignal = (mod && mod.OneSignal) || mod.default || mod;
    if (!OneSignal || typeof OneSignal.initialize !== 'function') return;

    const extra =
      (Constants.expoConfig && Constants.expoConfig.extra) ||
      (Constants.manifest && Constants.manifest.extra) ||
      {};
    const appId = extra.oneSignalAppId || '';
    if (!appId) {
      // Intentionally don't throw — dev builds commonly run without an
      // OneSignal app id. Silent so we don't nag during local testing.
      return;
    }

    OneSignal.initialize(appId);
    _oneSignal = OneSignal;
    // Ask for push permission once; OneSignal persists the answer.
    if (OneSignal.Notifications && typeof OneSignal.Notifications.requestPermission === 'function') {
      OneSignal.Notifications.requestPermission(true).catch(() => {});
    }
  } catch (e) {
    // react-native-onesignal not installed / native module missing.
    // Silent — the fallback push path (Expo token + backend segments
    // broadcast) still works, and the app keeps booting normally.
  }
}

/**
 * Rattache cet appareil au livreur connecté. Le serveur cible les livreurs par
 * l'id de leur profil (DeliveryApp/push.py, notifications.py :
 * include_external_user_ids=[str(driver.id)]). Sans effet si OneSignal n'est
 * pas initialisé ; ne lève jamais d'erreur.
 */
export function lierLivreurOneSignal(id) {
  if (id === null || id === undefined || id === '') return;
  const externe = String(id);
  if (!_oneSignal || _idLie === externe) return;
  try {
    if (typeof _oneSignal.login === 'function') {
      _oneSignal.login(externe);
      _idLie = externe;
    }
  } catch {
    // SDK indisponible : les push ciblés n'arriveront pas, l'app continue.
  }
}

/**
 * Détache l'appareil du livreur à la déconnexion : plus aucun push ciblé ne
 * lui parvient sur ce téléphone. Ne lève jamais d'erreur.
 */
export function delierLivreurOneSignal() {
  _idLie = null;
  if (!_oneSignal) return;
  try {
    if (typeof _oneSignal.logout === 'function') _oneSignal.logout();
  } catch {
    // SDK indisponible : rien à détacher.
  }
}

export default initOneSignalOnce;
