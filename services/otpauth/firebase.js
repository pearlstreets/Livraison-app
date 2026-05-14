/**
 * Firebase Web SDK init for Livraison_pearl (Expo managed).
 *
 * Mirrors Liste_Pearl/services/otpauth/firebase.js. Expo managed
 * doesn't support @react-native-firebase without ejecting — the
 * firebase Web SDK is the officially-supported path.
 *
 * Reads config from EXPO_PUBLIC_* env vars (same names as Liste_Pearl
 * so the app can share the same Firebase project):
 *   EXPO_PUBLIC_FIREBASE_API_KEY
 *   EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN
 *   EXPO_PUBLIC_FIREBASE_PROJECT_ID
 *   EXPO_PUBLIC_FIREBASE_APP_ID
 *
 * PREREQ: `npm install firebase`
 *
 * Returns null when config is absent or firebase package isn't
 * installed — caller (useOtpSender) falls back to legacy login.
 */
let _cachedApp = null;
let _initFailed = false;

export function isFirebaseConfigured() {
  return Boolean(
    process.env.EXPO_PUBLIC_FIREBASE_API_KEY &&
      process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID
  );
}

export async function getFirebaseApp() {
  if (_cachedApp) return _cachedApp;
  if (_initFailed) return null;
  if (!isFirebaseConfigured()) return null;

  try {
    const firebaseApp = await import("firebase/app");
    const { getApp, getApps, initializeApp } = firebaseApp;
    const config = {
      apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
      appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
    };
    _cachedApp = getApps().length ? getApp() : initializeApp(config);
    return _cachedApp;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[firebase] init failed, falling back:", err?.message);
    _initFailed = true;
    return null;
  }
}
