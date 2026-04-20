import AsyncStorage from '@react-native-async-storage/async-storage';

let SecureStore = null;
try {
  SecureStore = require('expo-secure-store');
} catch (e) {
  // expo-secure-store not available, fallback to AsyncStorage
}

// Warn exactly once when the obfuscation fallback is active so the
// degraded-security state is visible in logs instead of invisible. We
// keep the fallback (removing it would crash on edge devices without
// SecureStore) but flag the risk so a rebuild with the secure-store
// dependency happens sooner rather than later.
let _fallbackWarned = false;
function warnFallbackOnce() {
  if (_fallbackWarned) return;
  _fallbackWarned = true;
  console.warn(
    '[secureStorage] expo-secure-store unavailable — ' +
      'tokens stored with XOR obfuscation only. ' +
      'Install expo-secure-store and rebuild for real device security.'
  );
}

const EXPIRY_SUFFIX = '__expiry';

// Simple XOR-based obfuscation for sensitive data in AsyncStorage fallback
// Not true encryption -- use expo-secure-store for real security
function obfuscate(text) {
  const key = 'pearl_k3y';
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return btoa(result);
}

function deobfuscate(encoded) {
  try {
    const key = 'pearl_k3y';
    const decoded = atob(encoded);
    let result = '';
    for (let i = 0; i < decoded.length; i++) {
      result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
  } catch {
    return null;
  }
}

// Blocked keys -- never store passwords
const BLOCKED_KEYS = ['password', 'pwd', 'passwd'];

function isBlockedKey(key) {
  const lower = key.toLowerCase();
  return BLOCKED_KEYS.some((b) => lower.includes(b));
}

const secureStorage = {
  /**
   * Store a sensitive value. Uses expo-secure-store if available, otherwise
   * falls back to AsyncStorage with obfuscation.
   * @param {string} key
   * @param {string} value
   * @param {number} [ttlMs] - optional time-to-live in milliseconds
   */
  async setSecure(key, value, ttlMs) {
    if (isBlockedKey(key)) {
      console.warn('[secureStorage] Refusing to store password-like key:', key);
      return;
    }

    if (SecureStore) {
      await SecureStore.setItemAsync(key, value);
    } else {
      warnFallbackOnce();
      await AsyncStorage.setItem(key, obfuscate(value));
    }

    if (ttlMs) {
      const expiry = Date.now() + ttlMs;
      await AsyncStorage.setItem(key + EXPIRY_SUFFIX, String(expiry));
    }
  },

  /**
   * Retrieve a sensitive value. Returns null if expired or missing.
   */
  async getSecure(key) {
    // Check expiry
    const expiryStr = await AsyncStorage.getItem(key + EXPIRY_SUFFIX);
    if (expiryStr && Date.now() > Number(expiryStr)) {
      await this.removeSecure(key);
      return null;
    }

    if (SecureStore) {
      return await SecureStore.getItemAsync(key);
    }

    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    return deobfuscate(raw);
  },

  /**
   * Remove a secure value and its expiry marker.
   */
  async removeSecure(key) {
    if (SecureStore) {
      await SecureStore.deleteItemAsync(key).catch(() => {});
    }
    await AsyncStorage.multiRemove([key, key + EXPIRY_SUFFIX]).catch(() => {});
  },

  /**
   * Clear all known sensitive keys.
   */
  async clearAll() {
    const keys = await AsyncStorage.getAllKeys();
    if (keys.length > 0) {
      await AsyncStorage.multiRemove(keys);
    }
    if (SecureStore) {
      // SecureStore does not have a "clear all", so remove known keys
      const secureKeys = ['accessToken', 'refreshToken'];
      for (const k of secureKeys) {
        await SecureStore.deleteItemAsync(k).catch(() => {});
      }
    }
  },
};

export default secureStorage;
