import AsyncStorage from '@react-native-async-storage/async-storage';

let LocalAuthentication = null;
try {
  // Loaded lazily so unit tests (node env) and JS-only setups never crash
  // when the native module isn't part of the bundle.
  LocalAuthentication = require('expo-local-authentication');
} catch {
  LocalAuthentication = null;
}

const ENABLED_KEY = '@biometric_enabled';

/**
 * True when the device exposes biometric hardware (Face ID, Touch ID,
 * fingerprint reader). Does not check enrollment.
 */
export async function isBiometricSupported() {
  if (!LocalAuthentication?.hasHardwareAsync) return false;
  try {
    return await LocalAuthentication.hasHardwareAsync();
  } catch {
    return false;
  }
}

/**
 * True when the user has at least one biometric enrolled on the device.
 */
export async function isBiometricEnrolled() {
  if (!LocalAuthentication?.isEnrolledAsync) return false;
  try {
    return await LocalAuthentication.isEnrolledAsync();
  } catch {
    return false;
  }
}

/**
 * Reads the user-level toggle. Defaults to disabled until the user opts in,
 * so the prompt never appears silently on first launch after the update.
 */
export async function isBiometricEnabled() {
  try {
    const v = await AsyncStorage.getItem(ENABLED_KEY);
    return v === '1';
  } catch {
    return false;
  }
}

export async function setBiometricEnabled(enabled) {
  await AsyncStorage.setItem(ENABLED_KEY, enabled ? '1' : '0').catch(() => {});
}

/**
 * Run the biometric prompt. Returns:
 *   { success: true }                      → user authenticated
 *   { success: false, reason: '...' }      → cancelled / failed / unsupported
 *
 * Caller decides what to do on failure (typically: nuke the SecureStore
 * tokens and force a fresh login). We do NOT clear tokens here because the
 * prompt may also be reused in non-login contexts (e.g. confirming an IBAN
 * change later on).
 */
export async function authenticateBiometric({
  promptMessage = 'Authentification requise',
  cancelLabel = 'Annuler',
  fallbackLabel,
} = {}) {
  if (!LocalAuthentication?.authenticateAsync) {
    return { success: false, reason: 'unsupported' };
  }
  if (!(await isBiometricSupported())) {
    return { success: false, reason: 'no-hardware' };
  }
  if (!(await isBiometricEnrolled())) {
    return { success: false, reason: 'not-enrolled' };
  }
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel,
      fallbackLabel,
      disableDeviceFallback: false,
    });
    if (res?.success) return { success: true };
    return { success: false, reason: res?.error || res?.warning || 'failed' };
  } catch (e) {
    return { success: false, reason: e?.message || 'error' };
  }
}

export default {
  isBiometricSupported,
  isBiometricEnrolled,
  isBiometricEnabled,
  setBiometricEnabled,
  authenticateBiometric,
};
