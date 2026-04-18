// Thin wrapper around react-native-onesignal so the rest of the app never
// touches the native module directly. All calls are guarded:
//  - if EXPO_PUBLIC_ONESIGNAL_APP_ID is unset, every method is a no-op
//  - if the native module isn't linked (Expo Go, web, tests), we swallow
//    the import error and keep the API shape intact
// The goal is that the driver app runs cleanly in every environment (Expo
// Go dev, EAS Build, simulator) without the rest of the codebase having to
// care whether OneSignal is actually wired.

let OneSignal = null;
try {
  // eslint-disable-next-line global-require
  const mod = require('react-native-onesignal');
  OneSignal = mod.OneSignal || mod.default || mod;
} catch { /* not linked yet — no-op */ }

const APP_ID = process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID || null;

let initialised = false;
let notificationClickListener = null;

function isAvailable() {
  return !!OneSignal && !!APP_ID;
}

export const pushService = {
  // Call ONCE at app boot, before any auth-dependent code.
  init() {
    if (initialised || !isAvailable()) return;
    try {
      OneSignal.initialize(APP_ID);
      initialised = true;
    } catch { /* ignore — native module not fully initialised */ }
  },

  // Request the OS-level permission dialog. Safe to call repeatedly — the
  // OneSignal SDK suppresses duplicate prompts. Returns a Promise<boolean>.
  async requestPermission() {
    if (!isAvailable() || !initialised) return false;
    try {
      const accepted = await OneSignal.Notifications.requestPermission(true);
      return !!accepted;
    } catch {
      return false;
    }
  },

  // Associate the current driver (logged-in user) with the OneSignal
  // player so the backend can target them via external_user_id. Call on
  // login success and after session restoration on app boot.
  setExternalUser(externalId) {
    if (!isAvailable() || !initialised || !externalId) return;
    try { OneSignal.login(String(externalId)); } catch { /* ignore */ }
  },

  // Call on logout so a subsequent user on the same device doesn't receive
  // the previous user's notifications.
  clearExternalUser() {
    if (!isAvailable() || !initialised) return;
    try { OneSignal.logout(); } catch { /* ignore */ }
  },

  // Register a handler fired when the user taps a notification. Used to
  // route to the Orders tab when a new-order notification arrives. The
  // handler receives the raw OneSignal event; callers should defensively
  // read event.notification?.additionalData?.type.
  addClickListener(handler) {
    if (!isAvailable() || !initialised || typeof handler !== 'function') return;
    try {
      notificationClickListener = handler;
      OneSignal.Notifications.addEventListener('click', handler);
    } catch { /* ignore */ }
  },

  removeClickListener() {
    if (!isAvailable() || !initialised || !notificationClickListener) return;
    try {
      OneSignal.Notifications.removeEventListener('click', notificationClickListener);
    } catch { /* ignore */ }
    notificationClickListener = null;
  },

  // Exposed for debugging / settings screens.
  isEnabled() { return isAvailable() && initialised; },
  appId: APP_ID,
};

export default pushService;
