import api from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import secureStorage from './secureStorage';
import { isValidEmail, sanitizeForApi } from '../utils/validation';

// Session timeout: auto-logout after 30 minutes of inactivity
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
let sessionTimer = null;

function resetSessionTimer(onTimeout) {
  if (sessionTimer) clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => {
    authService.logout();
    if (onTimeout) onTimeout();
  }, SESSION_TIMEOUT_MS);
}

function clearSessionTimer() {
  if (sessionTimer) {
    clearTimeout(sessionTimer);
    sessionTimer = null;
  }
}

// Password is sent in plain text over HTTPS — the Django backend uses
// `check_password()` (bcrypt/argon2 hashing) on its side, so client-side
// hashing breaks login when SubtleCrypto succeeds (mismatched algos).
// HTTPS already protects confidentiality in transit.

// Token rotation: track refresh count to detect abuse
let refreshCount = 0;
const MAX_REFRESHES_PER_SESSION = 50;

// Biometric auth lives in services/biometricAuth.js (expo-local-authentication
// wrapper). It is wired into AuthContext on app open: when a token is in
// SecureStore and the user opted into biometric unlock, the prompt is shown
// before the cached profile is restored. Failure clears SecureStore.

export const authService = {
  async login(email, password) {
    // Validate email format
    if (!isValidEmail(email)) {
      throw new Error('Invalid email format');
    }

    const { data } = await api.post('/api/v1/delivery/login/', {
      email: sanitizeForApi(email),
      password, // sent over HTTPS, hashed server-side (Django check_password)
    });

    // Store tokens securely
    await secureStorage.setSecure('accessToken', data.access_token);
    await secureStorage.setSecure('refreshToken', data.refresh_token);
    // User data is non-sensitive, store in AsyncStorage
    await AsyncStorage.setItem('userData', JSON.stringify(data.user));

    refreshCount = 0;
    resetSessionTimer();
    return data;
  },

  async register(payload) {
    // Validate email
    if (!isValidEmail(payload.email)) {
      throw new Error('Invalid email format');
    }

    // Send password in plain over HTTPS — backend hashes via Django.
    const sanitizedPayload = {
      ...payload,
      email: sanitizeForApi(payload.email),
      userName: payload.userName ? sanitizeForApi(payload.userName) : undefined,
      password: payload.password,
    };

    const { data } = await api.post('/api/v1/delivery/register/', sanitizedPayload);
    return data;
  },

  async logout() {
    try {
      const refreshToken = await secureStorage.getSecure('refreshToken').catch(() => null);
      if (refreshToken) {
        await api.post('/api/v1/delivery/logout/', { refresh: refreshToken });
      }
    } catch (e) {
      // Logout API failure should not block local cleanup
    }

    // Clear ALL sensitive data from storage
    clearSessionTimer();
    refreshCount = 0;
    await secureStorage.clearAll();
  },

  async refreshToken() {
    // Token rotation guard
    if (refreshCount >= MAX_REFRESHES_PER_SESSION) {
      await this.logout();
      throw new Error('Session expired. Please log in again.');
    }

    const refreshToken = await secureStorage.getSecure('refreshToken').catch(() => null);
    if (!refreshToken) throw new Error('No refresh token');

    const { data } = await api.post('/api/v1/delivery/token/refresh/', { refresh: refreshToken });
    await secureStorage.setSecure('accessToken', data.access);
    if (data.refresh) {
      await secureStorage.setSecure('refreshToken', data.refresh);
    }
    refreshCount++;
    resetSessionTimer();
    return data;
  },

  async getProfile() {
    resetSessionTimer();
    const { data } = await api.get('/api/v1/delivery/profile/');
    return data;
  },

  async updateProfile(updates) {
    resetSessionTimer();
    const { data } = await api.put('/api/v1/delivery/profile/', updates);
    return data;
  },

  async getStoredUser() {
    const stored = await AsyncStorage.getItem('userData');
    return stored ? JSON.parse(stored) : null;
  },

  async forgotPassword(email) {
    if (!isValidEmail(email)) {
      throw new Error('Invalid email format');
    }
    const { data } = await api.post('/api/v1/delivery/forgot-password/', { email: sanitizeForApi(email) });
    return data;
  },

  async resetPassword(payload) {
    const { data } = await api.post('/api/v1/delivery/reset-password/', payload);
    return data;
  },

  async updatePassword(oldPassword, newPassword) {
    const { data } = await api.post('/api/v1/delivery/update-password/', {
      old_password: oldPassword,
      new_password: newPassword,
    });
    return data;
  },

  async createStripeConnect() {
    resetSessionTimer();
    const { data } = await api.post('/api/v1/delivery/stripe/connect/');
    return data;
  },

  // Session management
  resetSessionTimer,
  clearSessionTimer,
};
