import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

let SecureStore = null;
try {
  SecureStore = require('expo-secure-store');
} catch (e) {
  // expo-secure-store not available, fallback to AsyncStorage
}

const EXPIRY_SUFFIX = '__expiry';

// Copie en mémoire : téléphone verrouillé, iOS refuse de lire le trousseau,
// alors que la position du livreur en ligne part encore en arrière-plan.
const memoire = {};

// iOS : jetons lisibles et réécrivables téléphone verrouillé (après le premier
// déverrouillage depuis le démarrage), pour que le rafraîchissement du jeton
// pendant une course, écran éteint, soit bien enregistré. Ignoré sur Android.
function optionsTrousseau() {
  const accessible = SecureStore && SecureStore.AFTER_FIRST_UNLOCK;
  return accessible !== undefined && accessible !== null ? { keychainAccessible: accessible } : undefined;
}

// Les entrées écrites avant ce changement gardent leur accessibilité d'origine
// (WHEN_UNLOCKED) : iOS ne la modifie pas sur une simple mise à jour de valeur.
// Migration unique, faite au premier accès : lecture de l'ancienne valeur,
// suppression, réécriture avec la nouvelle accessibilité. Toutes les lectures
// et écritures attendent sa fin, la valeur reste en mémoire pendant ce temps et
// l'ancienne entrée est restaurée si la réécriture échoue : jamais de
// déconnexion. Téléphone verrouillé (lecture refusée), rien n'est touché et on
// réessaie plus tard.
const CLES_JETONS = ['accessToken', 'refreshToken'];
const MARQUEUR_MIGRATION = 'trousseauApresPremierDeverrouillage';
const DELAI_NOUVEL_ESSAI_MS = 60 * 1000;
let migrationEnCours = null;
let migrationFaite = false;
let dernierEchec = 0;
const aReecrire = {};

async function migrerTrousseau() {
  const options = optionsTrousseau();
  if (!SecureStore || Platform.OS !== 'ios' || !options) {
    migrationFaite = true;
    return;
  }
  if ((await AsyncStorage.getItem(MARQUEUR_MIGRATION)) === '1') {
    migrationFaite = true;
    return;
  }
  for (const cle of CLES_JETONS) {
    const valeur = await SecureStore.getItemAsync(cle);
    if (valeur == null) continue;
    memoire[cle] = valeur;
    await SecureStore.deleteItemAsync(cle);
    try {
      await SecureStore.setItemAsync(cle, valeur, options);
    } catch (e) {
      // Réécriture refusée : on remet l'entrée telle qu'elle était. Si même
      // cela échoue, la valeur gardée en mémoire sert et sera réécrite à la
      // prochaine lecture (getSecure).
      try {
        await SecureStore.setItemAsync(cle, valeur);
      } catch {
        aReecrire[cle] = true;
      }
      throw e;
    }
  }
  await AsyncStorage.setItem(MARQUEUR_MIGRATION, '1');
  migrationFaite = true;
}

function attendreMigration() {
  if (migrationFaite) return Promise.resolve();
  if (!migrationEnCours) {
    if (dernierEchec && Date.now() - dernierEchec < DELAI_NOUVEL_ESSAI_MS) return Promise.resolve();
    migrationEnCours = migrerTrousseau()
      .catch(() => { dernierEchec = Date.now(); })
      .finally(() => { migrationEnCours = null; });
  }
  return migrationEnCours;
}

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

    await attendreMigration();
    memoire[key] = value;
    delete aReecrire[key];
    if (SecureStore) {
      await SecureStore.setItemAsync(key, value, optionsTrousseau());
    } else {
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
    await attendreMigration();
    // Check expiry
    const expiryStr = await AsyncStorage.getItem(key + EXPIRY_SUFFIX);
    if (expiryStr && Date.now() > Number(expiryStr)) {
      await this.removeSecure(key);
      return null;
    }

    if (SecureStore) {
      try {
        const value = await SecureStore.getItemAsync(key, optionsTrousseau());
        if (value == null && aReecrire[key] && memoire[key] != null) {
          // Entrée perdue pendant la migration : on la réécrit depuis la mémoire.
          try {
            await SecureStore.setItemAsync(key, memoire[key], optionsTrousseau());
            delete aReecrire[key];
          } catch {
            // Nouvel essai à la prochaine lecture.
          }
          return memoire[key];
        }
        if (value != null) memoire[key] = value;
        return value;
      } catch (e) {
        if (memoire[key] != null) return memoire[key];
        throw e;
      }
    }

    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    return deobfuscate(raw);
  },

  /**
   * Remove a secure value and its expiry marker.
   */
  async removeSecure(key) {
    await attendreMigration();
    delete memoire[key];
    delete aReecrire[key];
    if (SecureStore) {
      await SecureStore.deleteItemAsync(key).catch(() => {});
    }
    await AsyncStorage.multiRemove([key, key + EXPIRY_SUFFIX]).catch(() => {});
  },

  /**
   * Clear all known sensitive keys.
   */
  async clearAll() {
    await attendreMigration();
    Object.keys(memoire).forEach((k) => { delete memoire[k]; });
    Object.keys(aReecrire).forEach((k) => { delete aReecrire[k]; });
    // Le marqueur de migration reste : les jetons écrits ensuite ont déjà la
    // bonne accessibilité.
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k !== MARQUEUR_MIGRATION);
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
