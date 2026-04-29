import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const EXPIRY_SUFFIX = '__expiry';

// Blocked keys -- never store passwords
const BLOCKED_KEYS = ['password', 'pwd', 'passwd'];

function isBlockedKey(key) {
  const lower = key.toLowerCase();
  return BLOCKED_KEYS.some((b) => lower.includes(b));
}

// Hard requirement: expo-secure-store must be available. The previous
// implementation fell back to a Base64+XOR scheme with a static key
// ('pearl_k3y'), which is not encryption — anyone with the bundle can decrypt
// the AsyncStorage blob. We now refuse to operate without the native module
// rather than offering a placebo.
function assertSecureStoreAvailable() {
  if (!SecureStore || typeof SecureStore.setItemAsync !== 'function') {
    throw new Error(
      '[secureStorage] expo-secure-store is required for sensitive storage. ' +
        'Install it (`npx expo install expo-secure-store`) before continuing.',
    );
  }
}

const secureStorage = {
  /**
   * Store a sensitive value via the platform Keychain/Keystore.
   * Throws if expo-secure-store is unavailable rather than degrading
   * silently to an unencrypted AsyncStorage path.
   *
   * @param {string} key
   * @param {string} value
   * @param {number} [ttlMs] - optional time-to-live in milliseconds
   */
  async setSecure(key, value, ttlMs) {
    if (isBlockedKey(key)) {
      console.warn('[secureStorage] Refusing to store password-like key:', key);
      return;
    }
    assertSecureStoreAvailable();
    await SecureStore.setItemAsync(key, value);
    if (ttlMs) {
      const expiry = Date.now() + ttlMs;
      await AsyncStorage.setItem(key + EXPIRY_SUFFIX, String(expiry));
    }
  },

  /**
   * Retrieve a sensitive value. Returns null if expired or missing.
   */
  async getSecure(key) {
    assertSecureStoreAvailable();
    // Check expiry
    const expiryStr = await AsyncStorage.getItem(key + EXPIRY_SUFFIX);
    if (expiryStr && Date.now() > Number(expiryStr)) {
      await this.removeSecure(key);
      return null;
    }
    return await SecureStore.getItemAsync(key);
  },

  /**
   * Remove a secure value and its expiry marker.
   */
  async removeSecure(key) {
    if (SecureStore && typeof SecureStore.deleteItemAsync === 'function') {
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
    if (SecureStore && typeof SecureStore.deleteItemAsync === 'function') {
      const secureKeys = ['accessToken', 'refreshToken'];
      for (const k of secureKeys) {
        await SecureStore.deleteItemAsync(k).catch(() => {});
      }
    }
  },
};

export default secureStorage;
